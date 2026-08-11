import type { CollectionConfig } from 'payload'

import { ownerOnly } from '@/access/roles'

export const AuditEvents: CollectionConfig = {
  slug: 'audit-events',
  labels: {
    singular: '审计记录',
    plural: '审计记录',
  },
  access: {
    create: () => false,
    delete: () => false,
    read: ownerOnly,
    update: () => false,
  },
  admin: {
    defaultColumns: ['createdAt', 'action', 'summary', 'actor'],
    group: '系统设置',
    hidden: ({ user }) => user?.role !== 'owner',
    hideAPIURL: true,
    useAsTitle: 'summary',
  },
  fields: [
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true },
    },
    {
      name: 'action',
      type: 'text',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'entityType',
      type: 'text',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'entityId',
      type: 'text',
      admin: { readOnly: true },
    },
    {
      name: 'summary',
      type: 'text',
      required: true,
      admin: { readOnly: true },
    },
    {
      name: 'metadata',
      type: 'json',
      admin: { readOnly: true },
    },
  ],
  timestamps: true,
}
