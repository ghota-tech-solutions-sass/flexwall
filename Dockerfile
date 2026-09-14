# Flexwall: the monorepo builds one image, the web app with its SDK and plugins.

FROM oven/bun:1.4-alpine AS builder
# Next builds under Node (bun --bun next build is unreliable on x86_64); Bun stays the runtime.
RUN apk add --no-cache nodejs libc6-compat
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ARG NEXT_PUBLIC_APP_URL=https://flexwall.lol
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN bun --cwd apps/web run build

FROM oven/bun:1.4-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /srv
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app

# Standalone output traced from the repo root keeps the monorepo layout: apps/web/server.js.
COPY --from=builder --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /repo/apps/web/public ./apps/web/public

USER app
EXPOSE 3000
WORKDIR /srv/apps/web
CMD ["bun", "server.js"]
