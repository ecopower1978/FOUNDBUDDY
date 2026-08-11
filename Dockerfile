# syntax=docker/dockerfile:1.7
FROM node:22.17.0-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG SITE_URL
ARG S3_BUCKET
ARG S3_REGION
ARG S3_ENDPOINT
ARG S3_PUBLIC_URL
ARG SMTP_HOST
ARG SMTP_PORT=587
ARG SMTP_FROM_ADDRESS
ARG SMTP_FROM_NAME

ENV NODE_ENV=production
ENV SITE_URL=$SITE_URL
ENV S3_BUCKET=$S3_BUCKET
ENV S3_REGION=$S3_REGION
ENV S3_ENDPOINT=$S3_ENDPOINT
ENV S3_PUBLIC_URL=$S3_PUBLIC_URL
ENV SMTP_HOST=$SMTP_HOST
ENV SMTP_PORT=$SMTP_PORT
ENV SMTP_FROM_ADDRESS=$SMTP_FROM_ADDRESS
ENV SMTP_FROM_NAME=$SMTP_FROM_NAME
ENV SMTP_SKIP_VERIFY=true
ENV TRUST_PROXY_HEADERS=true
ENV NEXT_TELEMETRY_DISABLED=1

# Secrets are mounted for this single build step and are not stored in an image
# layer. See docs/operations.md for the exact docker build command.
RUN --mount=type=secret,id=database_url,required=true \
    --mount=type=secret,id=payload_secret,required=true \
    --mount=type=secret,id=preview_secret,required=true \
    --mount=type=secret,id=cron_secret,required=true \
    --mount=type=secret,id=s3_access_key_id,required=true \
    --mount=type=secret,id=s3_secret_access_key,required=true \
    --mount=type=secret,id=redis_url,required=true \
    DATABASE_URL="$(cat /run/secrets/database_url)" \
    PAYLOAD_SECRET="$(cat /run/secrets/payload_secret)" \
    PREVIEW_SECRET="$(cat /run/secrets/preview_secret)" \
    CRON_SECRET="$(cat /run/secrets/cron_secret)" \
    S3_ACCESS_KEY_ID="$(cat /run/secrets/s3_access_key_id)" \
    S3_SECRET_ACCESS_KEY="$(cat /run/secrets/s3_secret_access_key)" \
    REDIS_URL="$(cat /run/secrets/redis_url)" \
    pnpm build

FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json next.config.ts ./
COPY src ./src
CMD ["pnpm", "db:migrate"]

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/.next \
  && chown nextjs:nodejs /app/.next

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/live >/dev/null || exit 1
CMD ["node", "server.js"]
