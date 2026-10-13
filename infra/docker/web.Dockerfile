# syntax=docker/dockerfile:1.7
# UrbanFix web app: static Vite build served by nginx, which also proxies
# /api, /uploads and /socket.io to the API container.

FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @urbanfix/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG VITE_API_URL=""
ARG VITE_MAP_TILE_URL=""
ARG VITE_MAP_ATTRIBUTION=""
ARG VITE_SHOW_DEMO_ACCOUNTS="false"
ENV VITE_API_URL=$VITE_API_URL VITE_MAP_TILE_URL=$VITE_MAP_TILE_URL VITE_MAP_ATTRIBUTION=$VITE_MAP_ATTRIBUTION VITE_SHOW_DEMO_ACCOUNTS=$VITE_SHOW_DEMO_ACCOUNTS
RUN pnpm --filter @urbanfix/web build

FROM nginx:1.27-alpine AS runtime
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
