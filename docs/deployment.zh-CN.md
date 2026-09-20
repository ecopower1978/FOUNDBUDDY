# 生产部署操作手册

本文包含两条生产部署路径：本项目当前线上使用的 Vercel 部署，以及适用于自托管 Linux 服务器的 Docker 部署。仓库中的 `docker-compose.yml` 只用于本地开发，不应直接用于生产。

如果操作当前线上环境，请先阅读第 0 节；后面的 Docker 构建、迁移和反向代理章节适用于自托管方案，不是当前 Vercel 生产环境的必经步骤。

## 0. 本项目当前线上部署快照（Vercel）

以下记录对应 2026-08-17 的已验证生产环境。套餐、区域和部署别名可能变化，操作前以 Vercel 控制台当前显示为准。

### 0.1 项目和发布信息

- 部署平台：Vercel；项目名：`foundbuddy`；生产域名：<https://www.foundbuddy.com>；
- Vercel 关联 GitHub 仓库：`Alex-Wang-88/foundbuddy`，生产分支：`main`；本地仓库中对应的远程名称是 `vercel-mirror`；
- 本次已验证提交：`2cc4fcd`（修复多语言文档方向）；性能优化提交：`0f5bf68`；
- 本次生产部署：`dpl_4xA4wPtq8A4abQsX66fd1JRhuHMJ`，状态：`Ready`；
- 本次部署别名：<https://foundbuddy-qiizq0l87-alex-wang-88-s-projects.vercel.app>。日常访问和验证应使用正式域名，不要依赖临时别名；
- Vercel 项目 ID：`prj_3lceqGEqFajMNWPiBQqzrCS0zywt`；团队 ID：`team_GW5mxynTV0XOwvPdRIWP4eFG`。

### 0.2 Vercel 发布流程

Git 集成开启时，推送 `main` 会触发生产部署。推荐的发布顺序如下：

1. 在本地完成 lint、类型检查、测试和生产构建；
2. 确认目标提交已经推送到 Vercel 关联仓库的 `main`；
3. 在 Vercel Deployments 中等待构建完成，确认状态为 `Ready`；
4. 如果本次变更包含环境变量或 Marketplace 资源，保存变量后必须重新部署，旧部署不会自动读取新变量；
5. 通过第 0.4 节的健康检查和冒烟测试后，再通知用户切换或继续使用生产环境。

需要使用 CLI 时，可使用预构建发布流程：

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

检查部署和日志：

```bash
vercel ls
vercel inspect <deployment-url-or-id>
vercel logs <deployment-url-or-id> --level error
```

CLI 或 CI 中只通过 Secret Manager 提供 `VERCEL_TOKEN`，不要把 Token、数据库连接串或 `REDIS_URL` 写入仓库、截图或日志。

### 0.3 Redis Marketplace 配置

本次通过 Vercel Marketplace 创建并连接了官方 Redis Cloud 资源：

- 资源名：`foundbuddy-redis`；
- 套餐：`Free`，30 MB；
- 区域：Washington, D.C.（Vercel 区域标识 `iad1`）；
- 当前能力快照：RAM-only、无持久化、无高可用，100 ops/sec、5 GB/月网络、30 个连接；
- 连接项目：Vercel 项目 `foundbuddy`；
- 环境变量：`REDIS_URL`，标记为 Sensitive，已配置到 Production 和 Preview；Development 未使用线上变量。

套餐和限额可能随 Marketplace 规则变化。生产业务量增加或需要持久化、高可用时，应重新评估套餐，不要把当前免费规格当作容量承诺。

Redis 在本项目中用于限流和幂等状态。它还可以作为多实例共享状态的基础，但不会自动缓存所有后台页面；后台页面的主要耗时仍可能来自鉴权和 PostgreSQL 查询。

本地开发使用 Docker Compose 中独立的 Redis：

```bash
docker compose up -d redis
docker compose ps redis
docker compose exec redis redis-cli ping
```

最后一条命令应返回 `PONG`。本地的 `REDIS_URL` 通常为 `redis://127.0.0.1:6379`，不要把本地连接串误填到生产环境。

### 0.4 线上验证

部署完成后先检查存活和就绪接口：

```bash
curl --fail https://www.foundbuddy.com/api/health/live
curl --fail https://www.foundbuddy.com/api/health/ready
```

`/api/health/ready` 会检查 PostgreSQL、迁移状态、对象存储、Redis 和自动翻译服务配置。修复版本部署后应看到：

```json
{
  "checks": {
    "database": "connected",
    "migrations": "current",
    "storage": "connected",
    "redis": "PONG",
    "translation": "configured"
  },
  "status": "ready"
}
```

生产验证必须看到 Redis 为 `PONG`。如果出现 `development-no-redis`，优先检查 Vercel 中 `REDIS_URL` 是否配置到了当前环境，并重新部署；不要只依据页面能打开就判定发布完成。

随后至少验证：首页、文章列表、管理员登录、后台读写、图片加载和浏览器控制台。完整清单见第 10 节和 [acceptance-checklist.md](acceptance-checklist.md)。

### 0.5 本次性能验证记录

2026-08-17 使用同一生产域名进行三次线上 TTFB 测量，网络和冷/热缓存会造成波动，以下数字用于发布对比，不是 SLA：

| 路由 | 未优化时实测 | 本次发布后实测 | 结论 |
| --- | ---: | ---: | --- |
| `/en` | 约 7.64 秒 | 1.04–1.23 秒 | 约快 85%，约 6.6 倍 |
| `/en/posts` | 1–2.3 秒 | 1.07–2.17 秒 | 基本持平，仍受数据库查询影响 |
| `/admin` | 2.1–6.8 秒 | 1.25–2.60 秒 | 后台明显改善，约快 30%–70% |
| `/api/health/ready` | 约 5.73 秒 | 1.74–3.41 秒 | 约快 69%，其中包含完整依赖检查 |

首页的主要收益来自静态化、缓存和查询优化；Redis 接入主要解决生产多实例下的共享限流、幂等和连接健康验证，不能单独解释所有页面的速度变化。

## 1. 部署架构（自托管 Docker 方案）

如果不使用第 0 节的 Vercel 方案，而是自行维护 Linux 服务器，生产环境至少需要以下组件：

- 应用容器：Next.js 16 + Payload 3，容器内监听 `3000` 端口；
- PostgreSQL：保存业务数据和 Payload 迁移记录；
- Redis：保存限流和幂等状态；
- S3 兼容对象存储：保存公开媒体文件；
- SMTP 服务：发送邀请和密码重置邮件；
- HTTPS 反向代理或负载均衡器：终止 TLS，并将请求转发到应用；
- 定时任务：使用受保护接口运行翻译任务。

数据库、Redis 和对象存储应使用托管服务或独立的持久化实例，不要把生产数据保存在应用容器的临时文件系统中。

## 2. 环境和权限要求

构建机或部署服务器需要：

- Docker 24 或更高版本，并启用 BuildKit；
- Git；
- 可访问 PostgreSQL、Redis、S3 和 SMTP；
- 一个已解析到入口服务器或负载均衡器的正式域名；
- 有效的 HTTPS 证书；
- 足够创建 S3 存储桶策略、数据库备份和部署密钥的权限。

如果不使用 Docker，本项目要求 Node.js `22.x`（推荐 `22.17.0`）和 pnpm `11.x`（推荐 `11.9.0`）。生产构建仍需自行实现进程守护、非 root 用户运行和健康检查，因此推荐使用仓库中的 `Dockerfile`。

## 3. 准备基础设施

### 3.1 PostgreSQL

创建独立的生产数据库和最小权限用户。连接串示例：

```text
postgresql://trade_app:strong-password@postgres.internal:5432/international_trade
```

要求：

- 启用 TLS（由服务商支持时）；
- 只允许应用和迁移任务访问；
- 启用每日加密备份；
- 上线前完成一次恢复演练。

### 3.2 Redis

使用带认证和 TLS 的实例（服务商支持时），例如：

```text
rediss://default:strong-password@redis.internal:6379
```

Redis 必须可被所有应用实例访问，不能使用各实例自己的本地 Redis。

### 3.3 S3 兼容对象存储

创建私有存储桶，并为应用创建仅限该存储桶的访问密钥。浏览器访问媒体时使用独立的 HTTPS 公共域名或 CDN。不要开放匿名列举或写入权限。

首次配置版本控制、生命周期和 CORS 前，先确认保留周期，然后执行：

```bash
STORAGE_NONCURRENT_DAYS=365 \
STORAGE_CONFIG_CONFIRM=CONFIGURE \
pnpm storage:configure
```

详细策略见 [operations.md](operations.md#object-storage)。

### 3.4 SMTP

准备事务邮件服务，验证发件域名，并配置 SPF、DKIM 和 DMARC。先在预发布环境验证邀请和密码重置邮件，再用于生产。

## 4. 配置生产环境变量

不要提交生产 `.env`。应在部署平台的 Secret Manager 中保存变量；如果使用单机 Docker，可在仓库外创建一个只有部署用户可读的文件，例如 `/etc/international-trade-web/app.env`。

生成随机密钥：

```bash
openssl rand -base64 48
openssl rand -base64 36
openssl rand -base64 36
```

分别用于 `PAYLOAD_SECRET`、`PREVIEW_SECRET` 和 `CRON_SECRET`。生产变量模板如下：

```dotenv
NODE_ENV=production
SITE_VARIANT=blank
SITE_URL=https://www.company.tld
PORT=3000
HOSTNAME=0.0.0.0

DATABASE_URL=postgresql://trade_app:replace-me@postgres.internal:5432/international_trade
DATABASE_POOL_MAX=10
PAYLOAD_DB_PUSH=false
PAYLOAD_SECRET=replace-with-at-least-32-random-characters
PREVIEW_SECRET=replace-with-at-least-24-random-characters
CRON_SECRET=replace-with-at-least-24-random-characters
TRUST_PROXY_HEADERS=true

S3_BUCKET=company-media
S3_REGION=auto
S3_ENDPOINT=https://storage.company.tld
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
S3_PUBLIC_URL=https://media.company.tld
S3_FORCE_PATH_STYLE=false

REDIS_URL=rediss://default:replace-me@redis.internal:6379

# 自动翻译（生产环境必填，二选一）
# LibreTranslate：
TRANSLATION_PROVIDER=libretranslate
TRANSLATION_API_URL=https://translate.company.tld
TRANSLATION_API_KEY=replace-me-if-required
# OpenAI 兼容的智能体 SSE 接口：
# TRANSLATION_PROVIDER=yunbloom-batch
# TRANSLATION_API_URL=https://api.example.tld/v2/chat/completions/share?shareId=replace-me
# TRANSLATION_API_KEY=replace-me
# TRANSLATION_MODEL=replace-me-only-for-a-base-url

SMTP_HOST=smtp.company.tld
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=replace-me
SMTP_PASSWORD=replace-me
SMTP_FROM_ADDRESS=website@company.tld
SMTP_FROM_NAME=Company website
SMTP_SKIP_VERIFY=false

CSP_REPORT_ONLY=true
```

注意：

- `SITE_URL` 和 `S3_PUBLIC_URL` 在生产环境必须使用 HTTPS；
- `SITE_URL` 必须是真实域名，不能是 `localhost` 或 `.example` 域名；
- `PAYLOAD_DB_PUSH` 必须为 `false`，生产环境只能使用已提交的数据库迁移；
- `TRUST_PROXY_HEADERS=true` 只适用于可信反向代理，入口必须覆盖客户端伪造的转发头；
- `S3_FORCE_PATH_STYLE` 是否启用由对象存储服务商决定；
- 使用 SMTPS 直连端口（通常为 465）时将 `SMTP_SECURE` 设为 `true`；
- `SITE_VARIANT=blank` 用于正式空白站点；不要在真实生产数据库中运行演示数据种子；
- 自动翻译在多语言生产站点中是必需依赖；将 `TRANSLATION_PROVIDER` 设置为 `libretranslate`、`yunbloom` 或 `yunbloom-batch`，并配置对应的 `TRANSLATION_API_URL`、`TRANSLATION_API_KEY`。文章使用 `yunbloom-batch` 时，一次请求生成 8 种站点语言。使用 OpenAI 兼容基础地址时再设置 `TRANSLATION_MODEL`。旧的 `LIBRETRANSLATE_*` 变量仍兼容。
- AI 客服和博客发布接口仍为可选集成，其他变量说明见 [`.env.example`](../.env.example)。

设置环境文件权限：

```bash
sudo chown root:docker /etc/international-trade-web/app.env
sudo chmod 640 /etc/international-trade-web/app.env
```

## 5. 拉取并检查代码

```bash
git clone https://github.com/Alex-Wang-88/international-trade-web.git
cd international-trade-web
git checkout main
git pull --ff-only
```

记录准备部署的提交，便于回滚：

```bash
git rev-parse HEAD
```

发布前应确保 CI 通过。也可以在构建机执行：

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:int
pnpm test:e2e
pnpm build
pnpm audit --prod --audit-level=high
```

## 6. 构建镜像

应用镜像在构建阶段需要完整的生产配置。BuildKit Secret 只在单个构建步骤中挂载，不会写入镜像层。

先将环境文件加载到当前 shell。不要在共享终端中打印变量值：

```bash
set -a
. /etc/international-trade-web/app.env
set +a
export DOCKER_BUILDKIT=1
export RELEASE_TAG="$(git rev-parse --short=12 HEAD)"
```

构建应用镜像：

```bash
docker build --target runner \
  --build-arg SITE_URL="$SITE_URL" \
  --build-arg S3_BUCKET="$S3_BUCKET" \
  --build-arg S3_REGION="$S3_REGION" \
  --build-arg S3_ENDPOINT="$S3_ENDPOINT" \
  --build-arg S3_PUBLIC_URL="$S3_PUBLIC_URL" \
  --build-arg SMTP_HOST="$SMTP_HOST" \
  --build-arg SMTP_PORT="$SMTP_PORT" \
  --build-arg SMTP_FROM_ADDRESS="$SMTP_FROM_ADDRESS" \
  --build-arg SMTP_FROM_NAME="$SMTP_FROM_NAME" \
  --secret id=database_url,env=DATABASE_URL \
  --secret id=payload_secret,env=PAYLOAD_SECRET \
  --secret id=preview_secret,env=PREVIEW_SECRET \
  --secret id=cron_secret,env=CRON_SECRET \
  --secret id=s3_access_key_id,env=S3_ACCESS_KEY_ID \
  --secret id=s3_secret_access_key,env=S3_SECRET_ACCESS_KEY \
  --secret id=redis_url,env=REDIS_URL \
  -t "international-trade-web:$RELEASE_TAG" .
```

从同一提交构建迁移镜像：

```bash
docker build --target migrator \
  -t "international-trade-web-migrator:$RELEASE_TAG" .
```

如果使用镜像仓库，在这里为两个镜像添加仓库标签并推送。应用镜像和迁移镜像必须使用同一个提交版本。

## 7. 执行数据库迁移

每次发布都先备份数据库，再运行一次性迁移任务：

```bash
docker run --rm \
  --env-file /etc/international-trade-web/app.env \
  "international-trade-web-migrator:$RELEASE_TAG"
```

只有迁移进程退出码为 `0` 时才能继续。不要同时运行多个迁移任务，也不要在生产环境启用 schema push。

查看迁移状态时可在迁移镜像中覆盖命令：

```bash
docker run --rm \
  --env-file /etc/international-trade-web/app.env \
  "international-trade-web-migrator:$RELEASE_TAG" \
  pnpm db:status
```

## 8. 启动应用

单机 Docker 示例：

```bash
docker run -d \
  --name international-trade-web \
  --restart unless-stopped \
  --env-file /etc/international-trade-web/app.env \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  -p 127.0.0.1:3000:3000 \
  "international-trade-web:$RELEASE_TAG"
```

应用镜像以非 root 用户运行。若使用 Kubernetes、ECS 或其他平台，应保持以下设置：

- 容器端口：`3000`；
- 存活检查：`GET /api/health/live`；
- 就绪检查：`GET /api/health/ready`；
- 滚动发布时只有就绪检查返回 `200` 才接收流量；
- 至少保留一个上一版本镜像用于回滚；
- 多实例共享 PostgreSQL、Redis 和 S3，不挂载本地媒体目录。

## 9. 配置 HTTPS 反向代理

下面是 Nginx 的最小示例。证书可由 Certbot、云负载均衡器或托管平台提供：

```nginx
server {
    listen 443 ssl http2;
    server_name www.company.tld;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header CF-Connecting-IP "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

入口代理必须删除或覆盖来自客户端的 `CF-Connecting-IP`、`X-Real-IP` 和 `X-Forwarded-For`。如果前面还有可信 CDN 或负载均衡器，应按其官方方式恢复真实地址，并只信任固定的上游代理网段。

## 10. 上线验证

先在服务器本机检查：

```bash
curl --fail http://127.0.0.1:3000/api/health/live
curl --fail http://127.0.0.1:3000/api/health/ready
```

再通过正式域名检查：

```bash
curl --fail https://www.company.tld/api/health/live
curl --fail https://www.company.tld/api/health/ready
```

`ready` 接口会检查 PostgreSQL、数据库迁移、S3、Redis 和自动翻译服务配置。返回 `503` 时不要切换生产流量。

上线前还需人工验证：

1. 九种语言的首页、产品页和文章页；
2. 管理员登录；
3. 产品草稿、保存、发布和下架；
4. 图片上传及公共 URL；
5. 邀请和密码重置邮件；
6. 翻译任务；
7. AI 客服降级行为；
8. 浏览器控制台和 CSP 报告。

完整发布门禁见 [acceptance-checklist.md](acceptance-checklist.md)。

## 11. 定时任务

翻译任务由仓库中的 Vercel Cron 每天 02:00 UTC 调用一次 `GET /api/jobs/run` 执行；当前线上 Hobby 套餐不支持更高频率。自托管环境也可以使用下面的 `POST` 调用：

```bash
curl --fail --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  https://www.company.tld/api/jobs/run
```

首次切换已有数据时，任务入口会自动为缺少翻译元数据的商品、文章和公司资料补建状态并入队。若需要手动执行一次批量补队列，可以运行：

```bash
TRANSLATION_BACKFILL_CONFIRM=BACKFILL_TRANSLATIONS pnpm translations:backfill -- --apply
```

`--apply` 会写入数据库；生产环境必须同时设置确认变量。`CRON_SECRET` 只能保存在调度器的 Secret Manager 中，不能写入仓库或日志。

翻译队列按语言优先级依次处理：英文、德文、西班牙文、葡萄牙文、阿拉伯文、希伯来文、韩文，最后是繁体中文。每次调度只消费一种语言，并发锁限制为一个翻译任务；当前语言完成后才会把同一内容排入下一种语言。某条内容失败时会停在当前语言，等待自动重试或管理员重新提交。

## 12. 日常更新

每次部署新版本：

1. 拉取并记录目标提交；
2. 确认 CI 和发布清单通过；
3. 备份 PostgreSQL；
4. 从同一提交构建应用镜像和迁移镜像；
5. 运行迁移任务并确认退出码为 `0`；
6. 启动新应用实例；
7. 等待就绪检查返回 `200`；
8. 完成冒烟测试后切换流量；
9. 保留上一版本镜像和部署记录；
10. 定期运行 `pnpm storage:check` 验证媒体完整性。

## 13. 回滚

如果新版本还没有接收管理后台写入，可停止新实例并将流量切回上一版本：

```bash
docker stop international-trade-web
docker rename international-trade-web international-trade-web-failed
docker run -d \
  --name international-trade-web \
  --restart unless-stopped \
  --env-file /etc/international-trade-web/app.env \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  -p 127.0.0.1:3000:3000 \
  "international-trade-web:PREVIOUS_RELEASE_TAG"
```

数据库迁移必须在发布前单独评审兼容性和回滚方案。新版本已经产生管理后台写入时，不得直接丢弃数据库变更或对象存储文件；应先导出新增数据和对象键，再按照已评审方案处理。详细要求见 [operations.md](operations.md#rollback)。

## 14. 运维周期

- 每日：加密备份 PostgreSQL；
- 至少每周：运行 `pnpm storage:check`；
- 每次发布：保存提交 SHA、镜像摘要、迁移结果和冒烟测试记录；
- 每季度：在隔离环境执行数据库和媒体恢复演练；
- 密钥轮换：更新 Secret Manager，滚动重启应用；博客发布令牌轮换时可短期使用 `BLOG_PUBLISH_TOKEN_PREVIOUS`；
- CSP：先在预发布环境使用 `CSP_REPORT_ONLY=true`，修复违规后再设为 `false` 强制执行。

备份、对象存储、邮件安全和故障回滚的详细策略见 [operations.md](operations.md)。
