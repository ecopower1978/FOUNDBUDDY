# Operations runbook

## Required production configuration

Production startup validates and refuses missing or unsafe values for:

- `DATABASE_URL`, `SITE_URL`, `PAYLOAD_SECRET`, `PREVIEW_SECRET`,
  `CRON_SECRET`, `TRUST_PROXY_HEADERS=true`
- `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`
- `REDIS_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM_ADDRESS`, `SMTP_FROM_NAME`

`SITE_URL` and `S3_PUBLIC_URL` must use HTTPS. Supply secrets through the
platform secret manager; do not place production values in an image, compose
file or repository.

`TRUST_PROXY_HEADERS=true` is safe only when the ingress removes client-supplied
`CF-Connecting-IP`, `X-Real-IP` and `X-Forwarded-For` values and writes its own
verified client address before forwarding the request.

LibreTranslate, AI Chat and Blog Publish are independent optional integrations.
If `BLOG_PUBLISH_TOKEN` is empty, its route responds with 404. Keep the previous
token temporarily in `BLOG_PUBLISH_TOKEN_PREVIOUS` during rotation.

AI customer-service settings are managed by an owner under `Admin > System
settings > Customer service API`. The global stores the endpoint, API key and
authentication scheme. Apply the database migration before opening this page
in a deployment with `PAYLOAD_DB_PUSH=false`. The `AI_CHAT_*` environment
variables remain a fallback for existing deployments and emergency recovery.

## Object storage

Create a private bucket and expose only the intended public media prefix through
the provider/CDN. Review retention, then apply versioning, lifecycle and CORS:

```bash
STORAGE_NONCURRENT_DAYS=365 STORAGE_CONFIG_CONFIRM=CONFIGURE \
  pnpm storage:configure
```

Schedule `pnpm storage:check` at least weekly. Alert on any missing object or
size mismatch. The script checks every database media row against
`media/{filename}` in object storage.

Configure the provider to:

- retain object versions and deny public listing/writes;
- encrypt objects at rest;
- abort incomplete multipart uploads after seven days;
- retain noncurrent versions for the reviewed retention period;
- allow browser `GET` and `HEAD` only from `SITE_URL`;
- log administrative and destructive object operations.

## Email

Use a transactional SMTP/SES/Resend account. Verify invitation and password
reset delivery in staging. Publish SPF and DKIM records supplied by the
provider, then enforce DMARC gradually (`p=none`, monitor, then quarantine or
reject). Use a monitored sender and alert address. Never test staging with real
customer addresses unless explicitly approved.

## Docker builds

The application image uses Next standalone output and a non-root runtime user.
BuildKit secrets are available only to the build command:

```bash
docker build --target runner \
  --build-arg SITE_URL=https://www.company.tld \
  --build-arg S3_BUCKET=company-media \
  --build-arg S3_REGION=auto \
  --build-arg S3_ENDPOINT=https://storage.company.tld \
  --build-arg S3_PUBLIC_URL=https://media.company.tld \
  --build-arg SMTP_HOST=smtp.company.tld \
  --build-arg SMTP_PORT=587 \
  --build-arg SMTP_FROM_ADDRESS=website@company.tld \
  --build-arg SMTP_FROM_NAME="Company website" \
  --secret id=database_url,env=DATABASE_URL \
  --secret id=payload_secret,env=PAYLOAD_SECRET \
  --secret id=preview_secret,env=PREVIEW_SECRET \
  --secret id=cron_secret,env=CRON_SECRET \
  --secret id=s3_access_key_id,env=S3_ACCESS_KEY_ID \
  --secret id=s3_secret_access_key,env=S3_SECRET_ACCESS_KEY \
  --secret id=redis_url,env=REDIS_URL \
  -t international-trade-web:release .
```

Build the `migrator` target from the same source revision for the independent
migration job. Inject the complete runtime environment when running either
target.

## Release order

1. Freeze old-admin writes for a migration cutover.
2. Take a PostgreSQL backup (or all legacy SQLite/media backups on first
   cutover) and verify that the backup can be read.
3. Run the independent migrator job and require exit code zero.
4. Start new stateless application instances.
5. Require `/api/health/live` and `/api/health/ready` to return 200. Readiness
   checks PostgreSQL, the latest migration, S3 and Redis.
6. Run internal smoke checks: login, draft/save/publish/unlist, image upload,
   translation job, email reset, AI fallback and all nine locale routes.
7. Switch traffic only after smoke checks pass.
8. Re-enable merchant writes after final reconciliation.

Run translation workers through the protected `/api/jobs/run` endpoint with
`Authorization: Bearer $CRON_SECRET`. Use a scheduler interval appropriate for
the expected translation volume; the job endpoint runs the translation queue
with controlled concurrency.

## Backup and restore

- Run encrypted PostgreSQL backups daily and retain them according to the
  business recovery policy.
- Keep object versioning enabled.
- Store backup credentials separately from application credentials.
- Perform a quarterly restore drill into an isolated account/database.
- During a drill, restore the database, verify media integrity, authenticate an
  owner, publish/unlist a temporary record, run all locale smoke tests and
  record recovery point and recovery time.

On the first SQLite cutover, retain the three SQLite snapshots, original media
directory and old application image read-only for at least 30 days.

## Rollback

Before new-admin writes are enabled, switch traffic back to the old application
if acceptance fails. After new-admin writes are enabled, first export the
PostgreSQL delta and uploaded object keys; never roll back by discarding merchant
changes. Database migrations must have a reviewed compatibility/rollback plan.

## CSP rollout

Set `CSP_REPORT_ONLY=true` in staging and inspect browser reports for Payload
admin, uploads, previews and optional integrations. Remove violations or add the
narrowest necessary origin. Enable enforcing CSP before production traffic.
