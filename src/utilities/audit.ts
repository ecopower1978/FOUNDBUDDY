import type { PayloadRequest } from 'payload'

export type AuditAction =
  | 'account.created'
  | 'account.deleted'
  | 'account.login'
  | 'account.role_changed'
  | 'account.updated'
  | 'automation.publish'
  | 'company.updated'
  | 'content.deleted'
  | 'content.published'
  | 'content.unpublished'
  | 'customer_service.updated'
  | 'translation.retry'
  | 'homepage.updated'

export async function writeAuditEvent(
  req: PayloadRequest,
  {
    action,
    entityId,
    entityType,
    metadata,
    summary,
  }: {
    action: AuditAction
    entityId?: number | string | null
    entityType: string
    metadata?: Record<string, unknown>
    summary: string
  },
) {
  try {
    await req.payload.create({
      collection: 'audit-events' as never,
      data: {
        action,
        actor: req.user?.id,
        entityId: entityId == null ? undefined : String(entityId),
        entityType,
        metadata,
        summary,
      } as never,
      overrideAccess: true,
      req,
    })
  } catch (error) {
    req.payload.logger.error({
      err: error,
      message: `Unable to record audit event: ${action}`,
    })
  }
}
