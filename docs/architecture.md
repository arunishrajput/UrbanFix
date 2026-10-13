# Architecture

## Components

| Component                             | Responsibility                                                                                                                         | Scales by                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Web** (`apps/web`)                  | React SPA/PWA for citizens, officials and admins. Served as static files by nginx.                                                     | CDN / nginx replicas                              |
| **nginx**                             | Serves the SPA, reverse-proxies `/api`, `/uploads` and `/socket.io` so the browser sees a single origin (first-party cookies, no CORS) | Replicas                                          |
| **API** (`apps/api/src/server.ts`)    | REST API, auth, validation, RBAC, uploads and image processing, duplicate checks, Socket.IO gateway                                    | Stateless replicas (JWT; Socket.IO Redis adapter) |
| **Worker** (`apps/api/src/worker.ts`) | BullMQ consumer: AI analysis, notification delivery, verification deadlines, SLA alerts, analytics refresh, cleanup                    | Replicas; per-queue concurrency                   |
| **PostgreSQL 16 + PostGIS**           | System of record. Geography columns with GiST indexes, trigram and full-text search, a materialized analytics view                     | Managed DB, read replicas for analytics           |
| **Redis**                             | BullMQ queues, rate-limit counters, Socket.IO pub/sub, geocode and settings caches, suspended-user set                                 | Managed Redis                                     |
| **Object storage**                    | Photo variants (local volume or S3 / R2 / MinIO)                                                                                       | CDN in front                                      |
| **Gemini**                            | Vision analysis and multimodal embeddings                                                                                              | Model fallback chain, circuit breaker             |
| **Nominatim**                         | Reverse geocoding (cached; throttled to 1 request/s across replicas)                                                                   | Self-host for volume                              |

## Code organisation

The API is split into feature modules (`src/modules/<feature>/{routes,service,repo}.ts`). Routes declare zod schemas
and role checks; services own the transactions; repos hold the read models.

Cross-cutting concerns live in `src/core`:

| File       | Concern                   |
| ---------- | ------------------------- |
| `config`   | environment validation    |
| `auth`     | JWT and passwords         |
| `rbac`     | route guards              |
| `errors`   | one error shape           |
| `jobs`     | queue or inline jobs      |
| `realtime` | Socket.IO and the emitter |
| `storage`  | local or S3               |
| `logger`   | pino with redaction       |

`packages/shared` holds everything both sides must agree on: enums, zod request schemas, response types, the status
machine, and the pure rules for duplicate scoring, priority, verification and gamification. Changing a rule or a
response shape breaks the build on both sides.

## Report flow

```
Citizen app                       API                                   Worker
──────────                        ───                                   ──────
pick photo ──compress──▶ POST /uploads ─ sharp: variants, thumbhash,
                                         SHA-256, pHash, EXIF GPS
                                         insert photo (DRAFT) ─ enqueue ──▶ analyze-photo:
                         ◀── upload ──                                       Gemini vision + embedding
poll GET /uploads/:id  ◀───────── socket "upload:analyzed" ◀────────────── (heuristics if unavailable)
GPS / EXIF / map pin ─▶ GET /geo/reverse (cached Nominatim)
category (AI preselected)
POST /issues/duplicates/check ─ PostGIS radius → score (shared rules)
  ├─ likely matches → "Join this issue" ─▶ POST /issues/:id/join
  └─ none / dismissed ──────────────────▶ POST /issues (re-checks, 409 if a likely match wasn't dismissed)
                                         transaction: issue, report, photos, supporter,
                                         timeline event, notifications, reputation
                                         after commit ─ enqueue notify ───────▶ socket + Web Push
                                                      ─ broadcast issue:created (map, dashboards)
```

## Transactions and side effects

Each service runs its writes in a single database transaction. Anything that must happen only after commit
(queueing notification delivery, Socket.IO broadcasts, follow-up jobs) goes into an `Effects` object and is flushed
after the transaction resolves. A rolled-back request never notifies anyone, and a failed side effect never fails a
request that already committed.

## Issue lifecycle

```
PENDING ──▶ IN_PROGRESS ──▶ RESOLVED ──(citizens confirm)──▶ VERIFIED
   │             │             └──(one "still not fixed" + photo)──▶ REOPENED ──▶ IN_PROGRESS / RESOLVED
   └──▶ REJECTED ◀──────────────┘                              (officials can also reopen)
```

- `packages/shared/src/status.ts` lists every allowed transition and which roles may make it. Only the verification
  workflow (`system`) or an admin can mark an issue VERIFIED.
- Marking an issue RESOLVED requires a work-completion photo (configurable). It opens a verification round and asks
  every reporter to confirm.
- A delayed job settles the round when its window closes (72 h by default).

## Realtime

| Room                     | Receives                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `user:{id}`              | The user's notifications (persisted first, then pushed), and `upload:analyzed` for their photos |
| `issue:{id}`             | Live status and support changes for anyone viewing the issue                                    |
| `officials`, `ward:{id}` | New and updated issues for the dashboards                                                       |
| `public-map`             | New issues pulse on the citizen map                                                             |

The worker publishes through `@socket.io/redis-emitter`, and the Redis adapter routes each message to whichever API
replica holds the socket. Web Push (VAPID) reaches citizens whose app is closed.

## Background jobs

| Queue           | Jobs                                                                        | Concurrency            |
| --------------- | --------------------------------------------------------------------------- | ---------------------- |
| `ai`            | `analyze-photo`                                                             | 2 (free-tier friendly) |
| `notifications` | `notify` (socket + Web Push fan-out)                                        | 10                     |
| `workflow`      | `close-verification` (delayed), `award-badges`                              | 5                      |
| `maintenance`   | `refresh-analytics` (15 min), `sla-check` (hourly), `cleanup-uploads` (6 h) | 1                      |

Jobs retry with exponential backoff. `JOBS_MODE=inline` runs the same handlers in the API process, for tests and very
small deployments.

## Security model

- **Sessions.** Access JWTs (HS256, 15 min) are held in memory on the client. Refresh tokens are opaque, stored
  hashed, rotated on every use, and kept in an httpOnly `SameSite=Lax` cookie scoped to `/api/v1/auth`. Reusing a
  token revokes its family, and refresh requires an `X-Requested-With` header.
- **Guests.** Guests are real user rows flagged `is_guest`. They can report and verify, and can upgrade to a full
  account in place.
- **Authorization.** Route guards (`requireAuth`, `requireRole`) plus scope checks in services: ward-scoped officials
  and staff, assignee-only work for staff. Suspensions take effect immediately through a Redis set checked on every
  request.
- **Uploads.** Magic-byte sniffing, a 10 MB limit, pixel limits, and re-encoding to WebP with metadata stripped.
  Storage keys are UUID paths, and the local driver guards against path traversal.
- **AI safety.** Prompts treat text inside images as data. Output is constrained to a JSON schema and validated, and
  an unknown category is rejected.
