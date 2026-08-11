import { APIError, type GlobalBeforeChangeHook, type GlobalConfig } from 'payload'

import { editorOrOwner } from '@/access/roles'
import { writeAuditEvent } from '@/utilities/audit'
import { revalidateLocalizedContent } from '@/utilities/revalidateLocalized'

const validateFeaturedProducts: GlobalBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const selected = data.featuredProducts ?? originalDoc?.featuredProducts ?? []
  const ids = (Array.isArray(selected) ? selected : [])
    .map((item) =>
      item && typeof item === 'object' && 'id' in item ? item.id : item,
    )
    .filter((id): id is number | string => typeof id === 'number' || typeof id === 'string')
  const uniqueIDs = [...new Set(ids.map(String))]

  if (ids.length > 8) {
    throw new APIError('首页最多只能推荐 8 个商品。', 400)
  }
  if (uniqueIDs.length !== ids.length) {
    throw new APIError('首页推荐列表不能包含重复商品。', 400)
  }
  if (!uniqueIDs.length) return data

  const products = await req.payload.find({
    collection: 'products',
    depth: 0,
    limit: 8,
    overrideAccess: true,
    req,
    where: {
      and: [
        { id: { in: uniqueIDs } },
        { _status: { equals: 'published' } },
      ],
    },
  })
  if (products.totalDocs !== uniqueIDs.length) {
    throw new APIError('首页只能推荐当前已发布的商品，请移除草稿或已下架商品。', 400)
  }
  return data
}

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  label: '首页商品排序',
  access: {
    read: () => true,
    update: editorOrOwner,
  },
  admin: {
    group: '网站内容',
    hideAPIURL: true,
    description: '选择最多 8 个已发布商品，并拖动调整首页展示顺序。',
  },
  fields: [
    {
      name: 'featuredProducts',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
      maxRows: 8,
      filterOptions: {
        _status: { equals: 'published' },
      },
      label: '首页推荐商品',
      admin: {
        description: '第一个商品将作为首屏主广告。',
      },
    },
  ],
  hooks: {
    beforeChange: [validateFeaturedProducts],
    afterChange: [
      async ({ doc, req }) => {
        if (!req.context?.disableRevalidate) {
          revalidateLocalizedContent(req, 'homepage')
        }
        await writeAuditEvent(req, {
          action: 'homepage.updated',
          entityType: 'homepage',
          metadata: { productCount: doc.featuredProducts?.length || 0 },
          summary: '更新首页商品排序',
        })
        return doc
      },
    ],
  },
}
