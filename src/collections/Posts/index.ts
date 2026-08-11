import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
} from 'payload'
import { APIError } from 'payload'

import {
  BlocksFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { editorOrOwner } from '../../access/roles'
import { Banner } from '../../blocks/Banner/config'
import { Code } from '../../blocks/Code/config'
import { MediaBlock } from '../../blocks/MediaBlock/config'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { populateAuthors } from './hooks/populateAuthors'
import { revalidateDelete, revalidatePost } from './hooks/revalidatePost'

import { slugField } from 'payload'
import { adminText as tr } from '../../i18n/admin'
import {
  queueCollectionTranslation,
  translationFields,
} from '../../i18n/translationWorkflow'
import { writeAuditEvent } from '../../utilities/audit'

const auditPostChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (req.context?.translationWorkflow || doc._status === previousDoc?._status) return doc
  await writeAuditEvent(req, {
    action: doc._status === 'published' ? 'content.published' : 'content.unpublished',
    entityId: doc.id,
    entityType: 'posts',
    summary: `${doc._status === 'published' ? '发布' : '下架'}文章：${doc.title}`,
  })
  return doc
}

const auditPostDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await writeAuditEvent(req, {
    action: 'content.deleted',
    entityId: doc.id,
    entityType: 'posts',
    summary: `永久删除文章：${doc.title}`,
  })
  return doc
}

const requireConfirmedPermanentDelete: CollectionBeforeDeleteHook = ({ req }) => {
  if (!req.context?.permanentDeleteConfirmed) {
    throw new APIError('请使用“永久删除”按钮并输入完整文章标题确认。', 400)
  }
}

export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  labels: {
    singular: tr('Blog article', '博客文章', 'Artículo'),
    plural: tr('Blog', '博客管理', 'Blog'),
  },
  access: {
    create: editorOrOwner,
    // Permanent deletion is deliberately exposed only through the
    // owner-confirmation endpoint so Payload's generic delete button stays hidden.
    delete: () => false,
    read: authenticatedOrPublished,
    update: editorOrOwner,
  },
  // This config controls what's populated by default when a post is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'posts'>
  defaultPopulate: {
    title: true,
    slug: true,
    categories: true,
    meta: {
      image: true,
      description: true,
    },
  },
  admin: {
    components: {
      edit: {
        beforeDocumentControls: ['@/components/PermanentDeleteButton'],
      },
    },
    group: tr('Website content', '网站内容', 'Contenido del sitio'),
    hideAPIURL: true,
    description: tr('Write product knowledge and company news. Save as a draft before publishing.', '撰写行业资讯、产品知识和公司动态。可以先保存草稿，确认后再发布。', 'Escriba información de productos y noticias. Puede guardar un borrador antes de publicar.'),
    defaultColumns: ['title', '_status', 'translationStatus', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'posts',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'posts',
        req,
      }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      label: tr('Article title', '文章标题', 'Título del artículo'),
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'excerpt',
      label: tr('Summary', '文章摘要', 'Resumen'),
      type: 'textarea',
      localized: true,
      maxLength: 260,
      admin: { description: tr('Shown in the article list.', '显示在博客列表中；不填写时网站会使用默认说明。', 'Se muestra en la lista de artículos.') },
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'heroImage',
              label: tr('Cover image', '封面图片', 'Imagen de portada'),
              type: 'upload',
              relationTo: 'media',
            },
            {
              name: 'content',
              label: tr('Article content', '文章正文', 'Contenido del artículo'),
              type: 'richText',
              localized: true,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
                    BlocksFeature({ blocks: [Banner, Code, MediaBlock] }),
                    FixedToolbarFeature(),
                    InlineToolbarFeature(),
                    HorizontalRuleFeature(),
                  ]
                },
              }),
              required: true,
            },
          ],
          label: tr('Content', '文章内容', 'Contenido'),
        },
        {
          fields: [
            {
              name: 'relatedPosts',
              label: tr('Related articles (optional)', '相关文章（选填）', 'Artículos relacionados (opcional)'),
              type: 'relationship',
              admin: {
                position: 'sidebar',
              },
              filterOptions: ({ id }) => {
                return {
                  id: {
                    not_in: [id],
                  },
                }
              },
              hasMany: true,
              relationTo: 'posts',
            },
            {
              name: 'categories',
              label: tr('Categories (optional)', '文章分类（选填）', 'Categorías (opcional)'),
              type: 'relationship',
              admin: {
                position: 'sidebar',
              },
              hasMany: true,
              relationTo: 'categories',
            },
          ],
          label: tr('More settings (optional)', '更多设置（选填）', 'Más opciones (opcional)'),
        },
      ],
    },
    {
      name: 'publishedAt',
      label: tr('Publication date', '发布时间', 'Fecha de publicación'),
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            if (siblingData._status === 'published' && !value) {
              return new Date()
            }
            return value
          },
        ],
      },
    },
    {
      name: 'authors',
      label: tr('Authors (optional)', '作者（选填）', 'Autores (opcional)'),
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      hasMany: true,
      relationTo: 'users',
    },
    // This field is only used to populate the user data via the `populateAuthors` hook
    // This is because the `user` collection has access control locked to protect user privacy
    // GraphQL will also not return mutated user data that differs from the underlying schema
    {
      name: 'populatedAuthors',
      type: 'array',
      access: {
        update: () => false,
      },
      admin: {
        disabled: true,
        readOnly: true,
      },
      fields: [
        {
          name: 'id',
          type: 'text',
        },
        {
          name: 'name',
          type: 'text',
        },
      ],
    },
    slugField({
      fieldToUse: 'title',
    }),
    ...translationFields,
  ],
  hooks: {
    afterChange: [
      queueCollectionTranslation('posts', 'translatePost', (doc) => ({
        content: doc.content,
        excerpt: doc.excerpt,
        meta: doc.meta,
        title: doc.title,
      })),
      auditPostChange,
      revalidatePost,
    ],
    afterRead: [populateAuthors],
    afterDelete: [auditPostDelete, revalidateDelete],
    beforeDelete: [requireConfirmedPermanentDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100, // We set this interval for optimal live preview
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
