# Deploy UrbanFix for free

This guide puts UrbanFix online at no cost and without a credit card, using free tiers that work well together:

| Piece                                 | Service                                         | Free tier (October 2026)                                                                                          |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| App: API, web app and background jobs | [Render](https://render.com) web service        | 512 MB RAM, 0.1 CPU. Sleeps after 15 min without traffic (about 1 min to wake). 750 h/month, 5 GB bandwidth/month |
| PostgreSQL + PostGIS                  | [Neon](https://neon.com)                        | 0.5 GB, 100 compute-hours/month. Suspends after 5 min idle and resumes on the next query                          |
| Redis (rate limits, caches, realtime) | [Upstash](https://upstash.com)                  | 256 MB, 500K commands/month                                                                                       |
| Photo storage (S3-compatible)         | [Supabase](https://supabase.com) Storage        | About 1 GB. The project pauses after 7 days without activity; restore it with one click                           |
| AI photo analysis                     | [Google AI Studio](https://aistudio.google.com) | Free Gemini key. Without a key, built-in heuristics categorise photos                                             |

```
browser ──HTTPS──> Render: one container (infra/docker/app.Dockerfile)
                     ├─ serves the web app and /api from the same origin
                     ├─ Socket.IO for live updates
                     └─ background jobs in-process (JOBS_MODE=inline)
                          ├─> Neon (Postgres + PostGIS)
                          ├─> Upstash (Redis)
                          ├─> Supabase Storage (photos; browsers load them straight from Supabase)
                          └─> Gemini, Nominatim
```

The multi-container setup (`docker-compose.yml`: separate worker, nginx) needs more than free tiers offer. This
deploy runs everything in one container instead:

- The API serves the built web app, so cookies and WebSockets stay same-origin.
- Background jobs run inside the API process.
- Recurring maintenance (closing expired verification windows, SLA checks, analytics refresh, upload cleanup) runs on
  timers inside the API, and only after real traffic, so an idle deploy lets the database sleep.

Budget about 30–45 minutes the first time. Pick regions close to your users. The examples use Singapore, which is
close to India.

## 1. Gemini API key (optional, 2 min)

Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). If a key was ever pasted into a chat
or committed anywhere, delete it and create a new one.

## 2. Database: Neon (5 min)

1. Sign up at [neon.com](https://neon.com) (GitHub login works).
2. Create a project:
   - **Postgres 17** (16 also works)
   - **Region:** AWS Asia Pacific (Singapore)
3. Click **Connect** and copy the connection string. It looks like:
   ```
   postgresql://neondb_owner:…@ep-xxx-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
   Either the direct or the pooled string works.

You don't need to enable PostGIS, pg_trgm or citext yourself; the first migration creates them. On startup `pg` may
log an SSL-mode notice about `sslmode=require`; it is harmless, because Neon's certificates are publicly trusted.

## 3. Redis: Upstash (3 min)

1. Sign up at [upstash.com](https://upstash.com) and create a **Redis** database.
2. Choose region `ap-southeast-1` and the free plan. Leave eviction off.
3. Copy the TLS URL from the database page. It looks like:
   ```
   rediss://default:…@xxx.upstash.io:6379
   ```

## 4. Photo storage: Supabase Storage (5 min)

1. Sign up at [supabase.com](https://supabase.com) and create a project in Singapore or Mumbai. Store the database
   password somewhere safe; UrbanFix doesn't use it.
2. Create the bucket: **Storage → New bucket**, name it `urbanfix`, and turn on **Public bucket**.
3. Get the S3 details from **Storage → Settings → S3 Connection** (enable the S3 connection if asked):
   - **Endpoint:** copy it exactly as shown, e.g. `https://<project-ref>.supabase.co/storage/v1/s3`.
   - **Region:** e.g. `ap-southeast-1`.
   - **Access key:** click **New access key**, then copy the access key ID and secret.
4. Your public URL is:
   ```
   https://<project-ref>.supabase.co/storage/v1/object/public/urbanfix
   ```
   The project ref is the subdomain in your project URL.

## 5. Load the demo data from your computer (10 min, optional)

Render's free plan has no shell, so seed the database from your own machine. You need Node 22 and pnpm 10
(`corepack enable`).

```bash
git clone https://github.com/arunishrajput/UrbanFix.git
cd UrbanFix
git checkout claude/nifty-dijkstra-fv7ccf   # until it is merged
pnpm install
```

Create `apps/api/.env` (it is gitignored) with the values from steps 2–4:

```bash
DATABASE_URL=postgresql://neondb_owner:…@ep-…neon.tech/neondb?sslmode=require
REDIS_URL=rediss://default:…@….upstash.io:6379
STORAGE_DRIVER=s3
S3_BUCKET=urbanfix
S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
S3_REGION=ap-southeast-1
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_PUBLIC_URL=https://<project-ref>.supabase.co/storage/v1/object/public/urbanfix
```

Then run:

```bash
pnpm db:migrate
pnpm db:seed      # Pune demo city: wards, staff, ~160 issues with photos; uploads to Supabase
```

The seed refuses to run on a database that already has data. Skip this step to launch with an empty city; you can
then create officials from the admin pages.

## 6. Deploy on Render (10 min, then the first build)

1. Sign up at [render.com](https://render.com) with GitHub and give it access to the `UrbanFix` repository.
2. Go to **New → Blueprint** and pick the repository and branch. `render.yaml` is on `claude/nifty-dijkstra-fv7ccf`
   until it is merged into `main`.
3. Render reads [`render.yaml`](../render.yaml) and asks for the secret values:

   | Variable                                   | Value                                                                 |
   | ------------------------------------------ | --------------------------------------------------------------------- |
   | `DATABASE_URL`                             | Neon connection string (step 2)                                       |
   | `REDIS_URL`                                | Upstash `rediss://` URL (step 3)                                      |
   | `S3_ENDPOINT`, `S3_REGION`                 | Supabase S3 endpoint and region (step 4)                              |
   | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase S3 access key (step 4)                                       |
   | `S3_PUBLIC_URL`                            | `https://<project-ref>.supabase.co/storage/v1/object/public/urbanfix` |
   | `GEMINI_API_KEY`                           | Key from step 1, or leave empty                                       |
   | `GEOCODER_EMAIL`                           | Your email; the Nominatim geocoder's usage policy asks for one        |

   `JWT_ACCESS_SECRET` is generated for you.

4. Click **Apply**. The first Docker build takes about 5–10 minutes. Database migrations run when the app starts.
5. Open `https://urbanfix-xxxx.onrender.com`. If you seeded, the sign-in page lists the demo accounts (password
   `urbanfix123`).

Every push to the deployed branch redeploys automatically.

### Check that it works

1. `https://<your-app>.onrender.com/readyz` returns `{"status":"ready"}`, which means Neon and Upstash are reachable.
2. Report an issue with a photo. The photo should load from `…supabase.co/storage/…` (right-click → open image).
3. Sign in as an official in a second browser. Status changes should appear live for the citizen.
4. `/api/docs` shows the API reference.

## 7. Optional extras

- **No cold starts.** Add a free monitor at [UptimeRobot](https://uptimerobot.com) (or
  [cron-job.org](https://cron-job.org)) that requests `https://<your-app>.onrender.com/healthz` every 5 minutes.
  - Running 24/7 uses about 744 of Render's 750 free hours, so do this only if it is your only free Render service.
  - `/healthz` touches neither the database nor Redis, so it doesn't use your Neon or Upstash quotas.
- **Push notifications.** Run `npx web-push generate-vapid-keys` and add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
  in **Render → Environment**.
- **Custom domain.** Add it in Render (TLS is free). Nothing else changes: the app and API share one origin.
- **Map tiles.** The public OpenStreetMap tile servers are fine for a demo. For real traffic, use a tile provider key
  via the `VITE_MAP_TILE_URL` and `VITE_MAP_ATTRIBUTION` environment variables; they are applied at build time.

## Limits and what to expect

- **First visit after a quiet period.** It takes about a minute while Render wakes the container; after that the app
  is fast.
- **Bandwidth.** 5 GB/month on Render covers the app and API traffic. Photos are served by Supabase, not Render.
- **Supabase pausing.** If the project sees no activity for 7 days, Supabase pauses it and photos stop loading. Open
  the Supabase dashboard and click **Restore project**; nothing is lost.
- **Database size.** Neon's 0.5 GB holds the demo city many times over. Photos are not stored in the database.
- **Background jobs.** They run inside the web process. If the instance restarts mid-job (a deploy, or sleep), the job
  is retried later or swept up by the next maintenance run. Verification windows are closed by a sweep, so none are
  lost.
- **Memory.** `render.yaml` tunes Node and libvips for 512 MB. Large bursts of uploads are processed one at a time.

## Troubleshooting

| Symptom                                               | Fix                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deploy fails with `Invalid environment configuration` | The log names the variable. A common cause is a missing or short `JWT_ACCESS_SECRET` when it was added by hand; it needs 32+ characters.               |
| `/readyz` returns 503                                 | Check `DATABASE_URL` (keep `?sslmode=require`) and `REDIS_URL` (must start with `rediss://`).                                                          |
| Uploads fail with an S3 error                         | Check the endpoint, region and key pair. The bucket name must match `S3_BUCKET` (`urbanfix`).                                                          |
| Photos upload but don't display                       | The bucket isn't public, or `S3_PUBLIC_URL` is wrong. Open one photo URL directly in the browser.                                                      |
| Map tiles are grey                                    | A browser extension or network is blocking `tile.openstreetmap.org`, or the tile server is rate limiting; set `VITE_MAP_TILE_URL` to another provider. |

## Outgrowing the free tier

- **Render Starter plan or higher.** No sleep. Add a background worker running the same image with
  `node dist/worker.js` and set `JOBS_MODE=queue` on both, or use `api.Dockerfile` + `web.Dockerfile`.
- **Cloudflare R2.** 10 GB of free storage with no egress fees; it needs a card on file. Point the `S3_*` variables at
  it.
- **Your own VM.** Run the full `docker-compose.yml` behind Caddy for TLS (for example on an Oracle Cloud Always Free
  Arm VM, which needs card verification). On Arm, swap `postgis/postgis` for an Arm64 build such as
  `imresamu/postgis`.
