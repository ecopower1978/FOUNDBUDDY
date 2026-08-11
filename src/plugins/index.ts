import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import type { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { s3Storage } from '@payloadcms/storage-s3'
import type { Plugin } from 'payload'

import { env, isS3Configured } from '@/config/env'
import { siteBrandName } from '@/config/siteVariant'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import type { Post } from '@/payload-types'

const generateTitle: GenerateTitle<Post> = ({ doc }) =>
  doc?.title ? `${doc.title} | ${siteBrandName}` : siteBrandName

const generateURL: GenerateURL<Post> = ({ doc, locale }) =>
  doc?.slug
    ? `${env.siteURL}/${locale || 'en'}/posts/${doc.slug}`
    : `${env.siteURL}/${locale || 'en'}`

const corePlugins: Plugin[] = [
  redirectsPlugin({
    collections: ['posts'],
    overrides: {
      admin: { hidden: true },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  nestedDocsPlugin({
    collections: ['categories'],
    generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
  }),
  seoPlugin({
    collections: ['posts'],
    generateTitle,
    generateURL,
    uploadsCollection: 'media',
  }),
]

if (isS3Configured || process.env.NODE_ENV === 'production') {
  corePlugins.push(
    s3Storage({
      alwaysInsertFields: true,
      bucket: env.s3.bucket,
      collections: {
        media: {
          generateFileURL: ({ filename, prefix }) =>
            `${env.s3.publicURL}/${[prefix, filename].filter(Boolean).join('/')}`,
          prefix: 'media',
        },
      },
      config: {
        credentials: {
          accessKeyId: env.s3.accessKeyId,
          secretAccessKey: env.s3.secretAccessKey,
        },
        endpoint: env.s3.endpoint || undefined,
        forcePathStyle: env.s3.forcePathStyle,
        region: env.s3.region,
      },
      disableLocalStorage: true,
      enabled: isS3Configured,
    }),
  )
}

export const plugins = corePlugins

