import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { zh } from '@payloadcms/translations/languages/zh'
import path from 'path'
import { buildConfig, type PayloadRequest } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { isEditorOrOwner, isOwner } from '@/access/roles'
import { AuditEvents } from '@/collections/AuditEvents'
import { Categories } from '@/collections/Categories'
import { Media } from '@/collections/Media'
import { Posts } from '@/collections/Posts'
import { Products } from '@/collections/Products'
import { Users } from '@/collections/Users'
import { env, isSMTPConfigured } from '@/config/env'
import { defaultLexical } from '@/fields/defaultLexical'
import { Company } from '@/globals/Company'
import { CustomerService } from '@/globals/CustomerService'
import { Homepage } from '@/globals/Homepage'
import { translationTasks } from '@/jobs/translationTasks'
import { plugins } from '@/plugins'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const isDevelopment = process.env.NODE_ENV !== 'production'

const email = isSMTPConfigured
  ? nodemailerAdapter({
      defaultFromAddress: env.smtp.fromAddress,
      defaultFromName: env.smtp.fromName,
      skipVerify: process.env.SMTP_SKIP_VERIFY === 'true',
      transportOptions: {
        auth:
          env.smtp.user && env.smtp.password
            ? { pass: env.smtp.password, user: env.smtp.user }
            : undefined,
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
      },
    })
  : undefined

export default buildConfig({
  folders: {
    browseByFolder: false,
  },
  i18n: {
    fallbackLanguage: 'zh',
    supportedLanguages: { zh },
  },
  localization: {
    locales: [
      { code: 'en', label: 'English', fallbackLocale: 'zh-CN' },
      { code: 'es', label: 'Español', fallbackLocale: 'en' },
      { code: 'ar', label: 'العربية', fallbackLocale: 'en', rtl: true },
      { code: 'de', label: 'Deutsch', fallbackLocale: 'en' },
      { code: 'he', label: 'עברית', fallbackLocale: 'en', rtl: true },
      { code: 'ko', label: '한국어', fallbackLocale: 'en' },
      { code: 'pt', label: 'Português', fallbackLocale: 'en' },
      { code: 'zh-CN', label: '中文（简体）', fallbackLocale: 'en' },
      { code: 'zh-TW', label: '中文（繁體）', fallbackLocale: 'zh-CN' },
    ],
    defaultLocale: 'zh-CN',
    fallback: true,
    defaultLocalePublishOption: 'all',
  },
  admin: {
    meta: {
      titleSuffix: ' | 网站管理后台',
    },
    components: {
      beforeLogin: ['@/components/BeforeLogin'],
      beforeDashboard: ['@/components/BeforeDashboard'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        { label: '手机', name: 'mobile', width: 375, height: 667 },
        { label: '平板', name: 'tablet', width: 768, height: 1024 },
        { label: '电脑', name: 'desktop', width: 1440, height: 900 },
      ],
    },
  },
  editor: defaultLexical,
  db: postgresAdapter({
    allowIDOnCreate: true,
    migrationDir: path.resolve(dirname, 'migrations'),
    pool: {
      connectionString: env.databaseURL,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
    },
    push: isDevelopment && process.env.PAYLOAD_DB_PUSH !== 'false',
    schemaName: process.env.DATABASE_SCHEMA || undefined,
  }),
  email,
  collections: [Products, Posts, Media, Categories, Users, AuditEvents],
  cors: [env.siteURL],
  csrf: [env.siteURL],
  globals: [Company, CustomerService, Homepage],
  graphQL: {
    disablePlaygroundInProduction: true,
  },
  plugins,
  secret: env.payloadSecret,
  serverURL: env.siteURL,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      queue: ({ req }: { req: PayloadRequest }) => isEditorOrOwner(req),
      run: ({ req }: { req: PayloadRequest }): boolean => {
        if (req.user) return isOwner(req)
        return req.headers.get('authorization') === `Bearer ${env.cronSecret}`
      },
    },
    tasks: translationTasks,
  },
})
