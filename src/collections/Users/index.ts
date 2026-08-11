import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionAfterLoginHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionConfig,
} from 'payload'

import { authenticated } from '../../access/authenticated'
import { isOwner, ownerOrSelf, roleField } from '../../access/roles'
import { adminText as tr } from '../../i18n/admin'
import { writeAuditEvent } from '../../utilities/audit'

const protectOwnerRole: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation === 'create') {
    const users = await req.payload.count({
      collection: 'users',
      overrideAccess: true,
      req,
    })
    if (users.totalDocs === 0) data.role = 'owner'
    else if (!isOwner(req)) {
      throw new APIError('只有所有者可以邀请新账号。', 403)
    }
  }

  if (
    operation === 'update' &&
    originalDoc?.role === 'owner' &&
    data.role &&
    data.role !== 'owner'
  ) {
    const owners = await req.payload.count({
      collection: 'users',
      overrideAccess: true,
      req,
      where: { role: { equals: 'owner' } },
    })
    if (owners.totalDocs <= 1) {
      throw new APIError('系统必须至少保留一名所有者。', 400)
    }
  }

  return data
}

const protectOwnerDeletion: CollectionBeforeDeleteHook = async ({ id, req }) => {
  if (String(id) === String(req.user?.id)) {
    throw new APIError('不能删除当前登录账号。', 400)
  }

  const user = await req.payload.findByID({
    collection: 'users',
    id,
    overrideAccess: true,
    req,
  })
  if (user.role === 'owner') {
    const owners = await req.payload.count({
      collection: 'users',
      overrideAccess: true,
      req,
      where: { role: { equals: 'owner' } },
    })
    if (owners.totalDocs <= 1) {
      throw new APIError('不能删除最后一名所有者。', 400)
    }
  }
}

const auditAccountChange: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation === 'update' && previousDoc?.role === doc.role) return doc
  await writeAuditEvent(req, {
    action:
      operation === 'create'
        ? 'account.created'
        : previousDoc?.role !== doc.role
          ? 'account.role_changed'
          : 'account.role_changed',
    entityId: doc.id,
    entityType: 'users',
    metadata: { role: doc.role },
    summary:
      operation === 'create'
        ? `创建账号：${doc.email}`
        : `更新账号角色：${doc.email} → ${doc.role}`,
  })
  return doc
}

const auditAccountDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await writeAuditEvent(req, {
    action: 'account.deleted',
    entityId: doc.id,
    entityType: 'users',
    summary: `删除账号：${doc.email}`,
  })
  return doc
}

const auditLogin: CollectionAfterLoginHook = async ({ req, user }) => {
  await writeAuditEvent(req, {
    action: 'account.login',
    entityId: user.id,
    entityType: 'users',
    summary: `账号登录：${user.email}`,
  })
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: tr('Account', '账号', 'Cuenta'),
    plural: tr('Accounts', '账号管理', 'Cuentas'),
  },
  access: {
    admin: authenticated,
    create: async ({ req }) => {
      const users = await req.payload.count({
        collection: 'users',
        overrideAccess: true,
        req,
      })
      // After bootstrap, accounts are created only by the invitation endpoint.
      return users.totalDocs === 0
    },
    delete: ({ req }) => isOwner(req),
    read: ownerOrSelf,
    update: ownerOrSelf,
  },
  admin: {
    components: {
      beforeListTable: ['@/components/UserInvite'],
    },
    group: tr('System settings', '系统设置', 'Configuración'),
    description: tr(
      'Owners manage accounts. Editors maintain website content.',
      '所有者可以管理账号；内容编辑只能维护网站内容。',
      'Los propietarios administran cuentas y los editores mantienen el contenido.',
    ),
    defaultColumns: ['name', 'email', 'role', 'updatedAt'],
    hidden: ({ user }) => user?.role !== 'owner',
    hideAPIURL: true,
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      label: tr('Name', '姓名', 'Nombre'),
      type: 'text',
      required: true,
    },
    roleField,
  ],
  hooks: {
    afterChange: [auditAccountChange],
    afterDelete: [auditAccountDelete],
    afterLogin: [auditLogin],
    beforeChange: [protectOwnerRole],
    beforeDelete: [protectOwnerDeletion],
  },
  timestamps: true,
}
