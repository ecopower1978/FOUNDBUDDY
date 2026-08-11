# 国际贸易网站

一个面向生产环境的多语言国际贸易网站和商户 CMS，基于 Next.js 16、Payload 3、PostgreSQL、兼容 S3 的对象存储以及 Redis 构建。

## 支持的功能

- 公共页面：`/{locale}`、`/{locale}/products/{slug}`、`/{locale}/posts` 以及 `/{locale}/posts/{slug}`。
- 支持语言：英语、西班牙语、阿拉伯语、德语、希伯来语、韩语、葡萄牙语、简体中文和繁体中文。
- 商户角色：`owner`（所有者）和 `editor`（编辑者）。
- 商品工作流：草稿、发布和下架；首页排序保存在独立的 `homepage` 全局配置中。
- 商品、文章和公司信息翻译通过可重试的 Payload Jobs 执行。
- 公共图片存储在兼容 S3 的对象存储中；限流和幂等记录存储在 Redis 中。

## 本地开发

使用 Node 22.17 和 pnpm 11.9。将 `.env.example` 复制为 `.env`，然后执行：

```bash
docker compose up -d
pnpm install --frozen-lockfile
pnpm dev
```

本地环境包含 PostgreSQL、MinIO 和 Redis。启动可选的本地翻译服务：

```bash
docker compose --profile translation up -d
```

开发环境可以使用 Payload schema push。CI、预发布环境和生产环境必须设置 `PAYLOAD_DB_PUSH=false`，并使用数据库迁移。

## 数据库工作流

```bash
pnpm payload migrate:create descriptive_change_name
pnpm db:status
pnpm db:migrate
```

已提交到仓库的基线迁移可以在空数据库中创建完整的 PostgreSQL 结构。之后的每一次结构变更都必须提交对应的迁移文件。除本地开发外，任何应用实例都不得启用 schema push。

## 旧系统数据导入

除非传入 `--apply`，否则导入器只执行读取操作：

```bash
pnpm data:import -- --source ./international-trade-web.db \
  --media-dir ./public/media --report ./reports/preflight.json
```

修复预检报告中的所有阻断项，暂停旧管理后台写入并完成备份后，再执行应用：

```bash
pnpm data:import -- --apply --send-invites \
  --source ./international-trade-web.db --media-dir ./public/media
```

只有在明确进行预发布演练时才使用 `--skip-invites`。生产环境还必须设置 `IMPORT_PRODUCTION_CONFIRM=IMPORT_SQLITE`。导入器支持幂等执行：使用 slug、邮箱和媒体迁移校验和来更新或复用记录，绝不会复制旧系统的密码哈希。

## 安全的演示数据

演示数据只能通过 CLI 导入；该命令会拒绝生产环境，并拒绝连接到数据库名不包含 `demo` 的数据库：

```bash
SITE_VARIANT=demo DATABASE_URL=postgresql://.../trade_demo pnpm seed:demo
```

该命令只能对空数据库执行，并会输出一个运行时随机生成的一次性密码。项目没有公开的 seed 路由，也没有固定的演示账号密码。

## 质量检查命令

```bash
pnpm lint
pnpm typecheck
pnpm test:int
pnpm test:e2e
pnpm build
pnpm audit --prod --audit-level=high
```

测试会拒绝数据库名不包含 `_test` 的数据库。每次测试都会创建并清理自己的 PostgreSQL schema 和 MinIO bucket。Playwright 始终启动独立的 Web 服务器，并使用项目锁定的 Chromium 版本。

## 运维

分步骤的中文生产环境部署指南请参阅 [deployment.zh-CN.md](docs/deployment.zh-CN.md)。关于存储配置、Docker 构建、迁移、备份和回滚的详细运维手册请参阅 [operations.md](docs/operations.md)。发布门禁检查项请参阅 [acceptance-checklist.md](docs/acceptance-checklist.md)，权限矩阵请参阅 [permissions.md](docs/permissions.md)。当前唯一接受的中等严重程度传递依赖安全公告记录在 [security-exceptions.md](docs/security-exceptions.md) 中。
