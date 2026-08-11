# 生产部署操作手册

本文以一台安装了 Docker 的 Linux 服务器为例，说明从基础设施准备到首次上线、日常更新和回滚的完整流程。生产环境推荐使用 Docker 镜像部署；仓库中的 `docker-compose.yml` 只用于本地开发，不应直接用于生产。

## 1. 部署架构

生产环境至少需要以下组件：

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
- LibreTranslate、AI 客服和博客发布接口均为可选集成，变量说明见 [`.env.example`](../.env.example)。

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

`ready` 接口会检查 PostgreSQL、数据库迁移、S3 和 Redis。返回 `503` 时不要切换生产流量。

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

翻译任务通过受保护接口执行：

```bash
curl --fail --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  https://www.company.tld/api/jobs/run
```

在平台调度器或系统定时任务中按业务量设置频率。`CRON_SECRET` 只能保存在调度器的 Secret Manager 中，不能写入仓库或日志。

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
