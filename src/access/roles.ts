import type { Access, CollectionConfig, PayloadRequest } from 'payload'

export type UserRole = 'editor' | 'owner'

type RoleUser = {
  id?: number | string
  role?: UserRole | null
}

export function getRole(req: PayloadRequest): UserRole | null {
  return ((req.user as RoleUser | null)?.role as UserRole | undefined) || null
}

export function isOwner(req: PayloadRequest): boolean {
  return getRole(req) === 'owner'
}

export function isEditorOrOwner(req: PayloadRequest): boolean {
  const role = getRole(req)
  return role === 'owner' || role === 'editor'
}

export const ownerOnly: Access = ({ req }) => isOwner(req)
export const editorOrOwner: Access = ({ req }) => isEditorOrOwner(req)

export const ownerOrSelf: Access = ({ id, req }) => {
  if (isOwner(req)) return true
  if (!req.user?.id) return false
  return id != null ? String(id) === String(req.user.id) : { id: { equals: req.user.id } }
}

export const publicPublishedOrAuthenticated: Access = ({ req }) => {
  if (isEditorOrOwner(req)) return true
  return { _status: { equals: 'published' } }
}

export const roleField: CollectionConfig['fields'][number] = {
  name: 'role',
  type: 'select',
  required: true,
  // The only generic create form is Payload's first-user bootstrap screen.
  // Later accounts are created through UserInvite, which always sends a role.
  defaultValue: 'owner',
  options: [
    { label: '所有者', value: 'owner' },
    { label: '内容编辑', value: 'editor' },
  ],
  access: {
    create: ({ req }) => isOwner(req),
    update: ({ req }) => isOwner(req),
  },
  admin: {
    description: '所有者可以管理账号和系统设置；内容编辑只能维护网站内容。',
    position: 'sidebar',
  },
}
