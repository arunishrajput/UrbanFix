# API

REST over JSON under `/api/v1`. The interactive OpenAPI docs (Swagger UI) are served at `/api/docs` and generated
from the same zod schemas that validate requests.

**Authentication.** Send `Authorization: Bearer <accessToken>`. Tokens come from login, register or guest; they last
15 minutes and are renewed through `POST /auth/refresh`, which uses the httpOnly cookie and needs the header
`X-Requested-With: urbanfix`.

**Errors** always have this shape:

```json
{
  "error": {
    "code": "DUPLICATE_SUSPECTED",
    "message": "There is already an open Garbage issue reported 12 meters away.",
    "details": {},
    "requestId": "…"
  }
}
```

Codes include `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
`DUPLICATE_SUSPECTED` / `ALREADY_REPORTED` / `ISSUE_CLOSED` (409), `INVALID_TRANSITION` (422) and `RATE_LIMITED`
(429).

**Pagination.** Public lists use cursors (`{ items, nextCursor }`). Dashboard and admin tables use pages
(`{ items, total, page, pageSize }`).

## Endpoints

Legend: 🌐 public · 👤 any signed-in user (guests included) · 🛠 staff, official or admin · 🧭 official or admin ·
🔑 admin.

### Auth & reference data

| Method | Path                                                   | Access | Notes                                                                        |
| ------ | ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------- |
| POST   | `/auth/register`                                       | 🌐     | name, email, password (8+ characters, a letter and a number), optional phone |
| POST   | `/auth/login`                                          | 🌐     | rate limited                                                                 |
| POST   | `/auth/guest`                                          | 🌐     | creates a guest account and session                                          |
| POST   | `/auth/refresh` · `/auth/logout`                       | cookie | rotation with reuse detection                                                |
| POST   | `/auth/upgrade`                                        | 👤     | turns a guest into a full account, keeping all data                          |
| GET    | `/auth/me`                                             | 👤     |                                                                              |
| GET    | `/config` · `/categories` · `/wards` · `/stats/public` | 🌐     | runtime config, active categories, wards with GeoJSON, city numbers          |
| GET    | `/geo/reverse?lat&lng`                                 | 🌐     | cached, throttled Nominatim proxy                                            |

### Uploads & issues

| Method        | Path                                                  | Access      | Notes                                                                                                                                                  |
| ------------- | ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST          | `/uploads?kind=REPORT\|VERIFICATION\|WORK_COMPLETION` | 👤          | multipart `file`; returns variants, thumbhash, EXIF location; AI analysis runs in the background                                                       |
| GET           | `/uploads/:id`                                        | 👤 owner    | analysis status and result                                                                                                                             |
| GET           | `/issues`                                             | 🌐          | filters: `status`, `category`, `priority`, `wardId`, `q` (text or `UF-000123`); `sort`: newest, updated, support, priority, nearest (with `lat`/`lng`) |
| GET           | `/issues/map?bbox=w,s,e,n`                            | 🌐          | lightweight points (up to 5,000) for clustering                                                                                                        |
| GET           | `/issues/heatmap?bbox=…`                              | 🌐          | `[lat, lng, weight]`                                                                                                                                   |
| GET           | `/issues/nearby?lat&lng&radiusM`                      | 🌐          | nearest first, with distance                                                                                                                           |
| POST          | `/issues/duplicates/check`                            | 👤          | `{lat, lng, accuracyM, categorySlug?, description?, uploadIds}` returns `{candidates, headline, blocking, radiusM}`                                    |
| POST          | `/issues`                                             | 👤          | `{lat, lng, accuracyM, categorySlug, description?, uploadIds, dismissedCandidateIds}`; 409 when a likely duplicate wasn't dismissed                    |
| GET           | `/issues/:id`                                         | 🌐          | full detail, with viewer state (supporter, reporter, pending verification)                                                                             |
| GET           | `/issues/:id/timeline` · `/issues/:id/reports`        | 🌐          | staff also see internal notes and reporter details                                                                                                     |
| POST          | `/issues/:id/join`                                    | 👤          | adds a report and photos as evidence; joining a RESOLVED issue reopens it                                                                              |
| POST / DELETE | `/issues/:id/support`                                 | 👤          | "me too"                                                                                                                                               |
| POST          | `/issues/:id/verification`                            | 👤 reporter | `{response: RESOLVED\|NOT_FIXED\|SKIPPED, comment?, uploadIds}`; NOT_FIXED needs a photo                                                               |

### Officials

| Method     | Path                                                                                                     | Access | Notes                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| GET        | `/manage/issues`                                                                                         | 🛠      | filters plus `assignee` (me, unassigned, or an ID), `overdue`, `from`/`to`; ward-scoped |
| GET        | `/manage/issues/:id`                                                                                     | 🛠      | detail, reporter contacts, allowed transitions, dismissed duplicate suggestions         |
| POST       | `/manage/issues/:id/assign`                                                                              | 🧭     | `{assigneeId \| null}`                                                                  |
| POST       | `/manage/issues/:id/status`                                                                              | 🛠      | `{status, note?}`; staff only on their own assignments; RESOLVED requires a work photo  |
| PATCH      | `/manage/issues/:id`                                                                                     | 🧭     | priority (locks it), category                                                           |
| GET / POST | `/manage/issues/:id/notes`                                                                               | 🛠      | internal notes                                                                          |
| POST       | `/manage/issues/:id/work-photos`                                                                         | 🛠      | `{uploadIds}` (kind WORK_COMPLETION)                                                    |
| POST       | `/manage/issues/:id/merge`                                                                               | 🧭     | `{targetIssueId}`                                                                       |
| GET        | `/manage/staff` · `/manage/stats`                                                                        | 🛠      | assignable people with open workload; KPIs                                              |
| GET        | `/analytics/overview` · `reports-per-day` · `resolution-time` · `categories` · `wards` · `participation` | 🛠      | `from`, `to`, `wardId`, `category`; ward-scoped for ward officials                      |

### Me, notifications, admin

| Method                    | Path                                                  | Access | Notes                                                                               |
| ------------------------- | ----------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| GET / PATCH               | `/me/profile`                                         | 👤     | stats, level, badges with progress, notification preferences                        |
| GET                       | `/me/reports?type=submitted\|joined\|all`             | 👤     |                                                                                     |
| GET                       | `/me/verifications/pending`                           | 👤     | resolved issues waiting for this citizen                                            |
| GET                       | `/notifications` · `/notifications/unread-count`      | 👤     |                                                                                     |
| POST                      | `/notifications/:id/read` · `/notifications/read-all` | 👤     |                                                                                     |
| GET                       | `/push/vapid-key`                                     | 🌐     |                                                                                     |
| POST / DELETE             | `/push/subscribe`                                     | 👤     | Web Push subscription                                                               |
| GET / POST / PATCH        | `/admin/users[/:id]`                                  | 🔑     | create officials and staff, change role or ward, suspend (takes effect immediately) |
| GET / POST / PUT / DELETE | `/admin/categories[/:id]`                             | 🔑     | categories in use are deactivated rather than deleted                               |
| GET / POST / PUT          | `/admin/wards[/:id]`                                  | 🔑     | GeoJSON Polygon or MultiPolygon boundaries                                          |
| GET                       | `/admin/moderation?status=FLAGGED\|PENDING\|REJECTED` | 🔑     |                                                                                     |
| POST                      | `/admin/moderation/:reportId/decision`                | 🔑     | `{action: APPROVE\|REJECT}`                                                         |
| GET / PUT                 | `/admin/settings`                                     | 🔑     | verification rules                                                                  |
| GET                       | `/admin/audit-logs`                                   | 🔑     |                                                                                     |

Health checks: `GET /healthz` (liveness) and `GET /readyz` (database and Redis).

## Realtime (Socket.IO, path `/socket.io`)

Connect with `auth: { token: accessToken }`. Signed-in users join their personal room automatically; officials also
join the officials room and their ward's room.

| Event                           | Direction       | Payload                                                            |
| ------------------------------- | --------------- | ------------------------------------------------------------------ |
| `notification:new`              | server → client | `NotificationDTO`                                                  |
| `issue:created`                 | server → client | map point plus `wardId` (to the officials room and the public map) |
| `issue:updated`                 | server → client | `{ id, status?, priority?, supportCount? }`                        |
| `upload:analyzed`               | server → client | `{ id, analysisStatus }`                                           |
| `issue:watch` / `issue:unwatch` | client → server | issue ID                                                           |
| `map:watch`                     | client → server | join the public map room                                           |

## Example

```bash
API=http://localhost:4000/api/v1
TOKEN=$(curl -s -X POST $API/auth/guest -H 'content-type: application/json' -d '{}' | jq -r .accessToken)
UPLOAD=$(curl -s -X POST "$API/uploads" -H "authorization: Bearer $TOKEN" -F file=@pothole.jpg | jq -r .id)
curl -s -X POST $API/issues/duplicates/check -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"lat\":18.52315,\"lng\":73.8413,\"accuracyM\":8,\"categorySlug\":\"garbage\",\"uploadIds\":[\"$UPLOAD\"]}" | jq .headline
# "There is already an open Garbage issue reported 12 meters away."
```
