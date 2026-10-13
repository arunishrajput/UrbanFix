# syntax=docker/dockerfile:1.7
# UrbanFix as ONE container: the API serves the built web app from the same
# origin and runs background jobs in-process (JOBS_MODE=inline). Made for
# single-service hosts such as Render's free tier (see docs/deploy-free.md).
# For multi-container setups use api.Dockerfile + web.Dockerfile instead.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# ---- dependency manifests only (better layer caching) ----
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @urbanfix/api... --filter @urbanfix/web...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
# Hosts like Render pass service environment variables as build args.
ARG VITE_MAP_TILE_URL=""
ARG VITE_MAP_ATTRIBUTION=""
ARG VITE_SHOW_DEMO_ACCOUNTS="false"
# Empty VITE_API_URL = same origin.
ENV VITE_API_URL="" VITE_MAP_TILE_URL=$VITE_MAP_TILE_URL VITE_MAP_ATTRIBUTION=$VITE_MAP_ATTRIBUTION VITE_SHOW_DEMO_ACCOUNTS=$VITE_SHOW_DEMO_ACCOUNTS
RUN pnpm --filter @urbanfix/api build && pnpm --filter @urbanfix/web build

FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter @urbanfix/api...

# ---- runtime ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    JOBS_MODE=inline \
    WEB_DIST_DIR=/app/apps/web/dist
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/api/drizzle ./apps/api/drizzle
COPY apps/api/package.json ./apps/api/package.json
RUN mkdir -p /app/apps/api/uploads && chown -R node:node /app/apps/api/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]
