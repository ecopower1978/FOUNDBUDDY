import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionAfterReadHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionConfig,
  type FieldHook,
} from 'payload'

import {
  editorOrOwner,
  isEditorOrOwner,
  publicPublishedOrAuthenticated,
} from '../access/roles'
import { adminText as tr } from '../i18n/admin'
import {
  queueCollectionTranslation,
  translationFields,
} from '../i18n/translationWorkflow'
import { writeAuditEvent } from '../utilities/audit'
import { revalidateLocalizedContent } from '../utilities/revalidateLocalized'

const validatePublish: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data._status !== 'published') return data

  const title = data.title ?? originalDoc?.title
  const description = data.shortDescription ?? originalDoc?.shortDescription
  const images = data.images ?? originalDoc?.images
  if (!title || !description || !Array.isArray(images) || images.length === 0) {
    throw new APIError('发布商品前请填写名称、简介并至少上传一张图片。', 400)
  }
  return data
}

const setWorkflowState: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data._status === 'published') {
    data.workflowState = 'draft'
  } else if (originalDoc?._status === 'published') {
    data.workflowState = 'unlisted'
  } else if (!data.workflowState) {
    data.workflowState = originalDoc?.workflowState || 'draft'
  }
  return data
}

const createProductSlug: FieldHook = async ({
  data,
  operation,
  originalDoc,
  req,
  value,
}) => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (operation === 'update' && typeof originalDoc?.slug === 'string') {
    return originalDoc.slug
  }

  const title = typeof data?.title === 'string' ? data.title : ''
  const readableSlug = title
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!readableSlug) return `product-${Date.now().toString(36)}`

  const existingProduct = await req.payload.find({
    collection: 'products',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: readableSlug } },
  })
  return existingProduct.totalDocs > 0
    ? `${readableSlug}-${Date.now().toString(36)}`
    : readableSlug
}

const auditProductChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (req.context?.translationWorkflow) return doc
  if (doc._status !== previousDoc?._status) {
    await writeAuditEvent(req, {
      action: doc._status === 'published' ? 'content.published' : 'content.unpublished',
      entityId: doc.id,
      entityType: 'products',
      summary:
        doc._status === 'published'
          ? `发布商品：${doc.title}`
          : `下架商品：${doc.title}`,
    })
  }
  return doc
}

const auditProductDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await writeAuditEvent(req, {
    action: 'content.deleted',
    entityId: doc.id,
    entityType: 'products',
    summary: `永久删除商品：${doc.title}`,
  })
  return doc
}

const requireConfirmedPermanentDelete: CollectionBeforeDeleteHook = ({ req }) => {
  if (!req.context?.permanentDeleteConfirmed) {
    throw new APIError('请使用“永久删除”按钮并输入完整商品名称确认。', 400)
  }
}

const revalidateProduct: CollectionAfterChangeHook = ({ doc, req }) => {
  if (!req.context?.disableRevalidate) {
    revalidateLocalizedContent(req, 'product', doc.slug)
  }
  return doc
}

export const sanitizePublicProduct: CollectionAfterReadHook = ({ doc, req }) => {
  if (req.user || req.payloadAPI === 'local') return doc

  const {
    _status: _status,
    sku: _sku,
    translationSourceHash: _translationSourceHash,
    translationStatus: _translationStatus,
    workflowState: _workflowState,
    ...publicDocument
  } = doc
  return publicDocument
}

export const Products: CollectionConfig = {
  slug: 'products',
  disableBulkDelete: true,
  disableBulkEdit: true,
  disableDuplicate: true,
  defaultSort: '-createdAt',
  lockDocuments: false,
  labels: {
    singular: tr('Product', '商品', 'Producto'),
    plural: tr('Products', '商品管理', 'Productos'),
  },
  access: {
    create: editorOrOwner,
    // Permanent deletion is deliberately exposed only through the
    // owner-confirmation endpoint so Payload's generic delete button stays hidden.
    delete: () => false,
    read: publicPublishedOrAuthenticated,
    update: editorOrOwner,
  },
  admin: {
    components: {
      beforeListTable: ['@/components/ProductBulkActions'],
      edit: {
        beforeDocumentControls: ['@/components/PermanentDeleteButton'],
      },
    },
    group: tr('Website content', '网站内容', 'Contenido del sitio'),
    useAsTitle: 'title',
    defaultColumns: ['title', '_status', 'translationStatus', 'category', 'updatedAt'],
    hideAPIURL: true,
    description: tr(
      'Save incomplete products as drafts. Published products are visible immediately.',
      '资料未完成时请保存草稿；只有发布后的商品才会在网站和公开接口中显示。',
      'Guarde productos incompletos como borradores. Solo los publicados son visibles.',
    ),
  },
  fields: [
    {
      name: 'title',
      label: tr('Product name', '商品名称', 'Nombre del producto'),
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'shortDescription',
      label: tr('Short description', '一句话简介', 'Descripción breve'),
      type: 'textarea',
      required: true,
      localized: true,
      maxLength: 220,
      admin: {
        description: tr(
          'Shown in product lists. Keep it to 2–3 lines.',
          '显示在商品列表中，建议控制在 2–3 行。',
          'Se muestra en la lista. Utilice 2–3 líneas.',
        ),
      },
    },
    {
      name: 'category',
      label: tr('Category (optional)', '商品分类（选填）', 'Categoría (opcional)'),
      type: 'text',
      localized: true,
    },
    {
      name: 'sku',
      label: tr('SKU (optional)', '商品编号 SKU（选填）', 'SKU (opcional)'),
      type: 'text',
      index: true,
      access: {
        read: ({ req }) => isEditorOrOwner(req),
      },
      admin: {
        description: tr(
          'Keep the existing SKU when migrating or replacing a product.',
          '用于内部查找和数据迁移；替换商品时请保留原编号。',
          'Conserve el SKU al migrar o reemplazar un producto.',
        ),
      },
    },
    {
      name: 'description',
      label: tr('Product details (optional)', '商品详情（选填）', 'Detalles (opcional)'),
      type: 'textarea',
      localized: true,
      admin: {
        description: tr(
          'Detailed materials, use cases, packaging or delivery notes.',
          '可填写材质、用途、包装、交付等详细说明。',
          'Materiales, usos, embalaje y detalles de entrega.',
        ),
      },
    },
    {
      name: 'specifications',
      label: tr('Specifications (optional)', '规格参数（选填）', 'Especificaciones (opcional)'),
      type: 'array',
      maxRows: 30,
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'name',
          label: tr('Name', '参数名', 'Nombre'),
          type: 'text',
          localized: true,
          required: true,
        },
        {
          name: 'value',
          label: tr('Value', '参数值', 'Valor'),
          type: 'text',
          localized: true,
          required: true,
        },
      ],
    },
    {
      name: 'images',
      label: tr('Product images', '商品图片', 'Imágenes del producto'),
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      maxRows: 8,
      admin: {
        allowCreate: true,
        description: tr(
          'The first image is the cover. At least one image is required before publishing.',
          '第一张图片作为封面；发布前至少需要一张图片。',
          'La primera imagen es la portada. Se requiere una imagen para publicar.',
        ),
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { hidden: true },
      hooks: { beforeValidate: [createProductSlug] },
    },
    {
      name: 'workflowState',
      type: 'select',
      defaultValue: 'draft',
      access: {
        read: ({ req }) => isEditorOrOwner(req),
        update: () => false,
      },
      admin: {
        hidden: true,
        readOnly: true,
      },
      options: [
        { label: '草稿', value: 'draft' },
        { label: '已下架', value: 'unlisted' },
      ],
      required: true,
    },
    ...translationFields,
  ],
  hooks: {
    afterChange: [
      queueCollectionTranslation('products', 'translateProduct', (doc) => ({
        category: doc.category,
        description: doc.description,
        shortDescription: doc.shortDescription,
        specifications: doc.specifications,
        title: doc.title,
      })),
      auditProductChange,
      revalidateProduct,
    ],
    afterRead: [sanitizePublicProduct],
    afterDelete: [
      auditProductDelete,
      ({ doc, req }) => {
        if (!req.context?.disableRevalidate) {
          revalidateLocalizedContent(req, 'product', doc.slug)
        }
        return doc
      },
    ],
    beforeChange: [setWorkflowState, validatePublish],
    beforeDelete: [requireConfirmedPermanentDelete],
  },
  versions: {
    drafts: {
      autosave: false,
      schedulePublish: true,
    },
    maxPerDoc: 30,
  },
}
