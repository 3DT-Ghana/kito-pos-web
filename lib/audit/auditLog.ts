import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

/**
 * Audit Logging System
 *
 * Tracks all create/update/delete operations for compliance and security
 */

export interface AuditLogEntry {
  tenantId: string
  userId: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW'
  entity: string
  entityId?: string
  details?: Record<string, unknown>
}

/**
 * Create an audit log entry
 *
 * @example
 * ```typescript
 * await createAuditLog({
 *   tenantId: user.tenantId,
 *   userId: user.id,
 *   action: 'CREATE',
 *   entity: 'Sale',
 *   entityId: sale.id,
 *   details: { totalAmount: sale.totalAmount }
 * })
 * ```
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        action: `${entry.action}_${entry.entity}`,
        entity: entry.entity,
        entityId: entry.entityId,
        details: entry.details as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (err) {
    // Log error but don't fail the main operation
    console.error('Failed to create audit log:', err)
  }
}

/**
 * Batch create audit logs
 */
export async function createAuditLogs(entries: AuditLogEntry[]): Promise<void> {
  try {
    await prisma.auditLog.createMany({
      data: entries.map(entry => ({
        tenantId: entry.tenantId,
        userId: entry.userId,
        action: `${entry.action}_${entry.entity}`,
        entity: entry.entity,
        entityId: entry.entityId,
        details: entry.details as Prisma.InputJsonValue | undefined,
      })),
    })
  } catch (err) {
    console.error('Failed to create audit logs:', err)
  }
}

/**
 * Get audit logs for a tenant
 */
export async function getAuditLogs(
  tenantId: string,
  options?: {
    userId?: string
    entity?: string
    action?: string
    limit?: number
    offset?: number
  }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId }

  if (options?.userId) {
    where.userId = options.userId
  }

  if (options?.entity) {
    where.entity = options.entity
  }

  if (options?.action) {
    where.action = {
      contains: options.action,
    }
  }

  return await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 100,
    skip: options?.offset || 0,
  })
}

/**
 * Audit log decorators for common operations
 */
export const AuditActions = {
  created: (entity: string, tenantId: string, userId: string, entityId?: string) =>
    createAuditLog({
      tenantId,
      userId,
      action: 'CREATE',
      entity,
      entityId,
    }),

  updated: (entity: string, tenantId: string, userId: string, entityId?: string) =>
    createAuditLog({
      tenantId,
      userId,
      action: 'UPDATE',
      entity,
      entityId,
    }),

  deleted: (entity: string, tenantId: string, userId: string, entityId?: string) =>
    createAuditLog({
      tenantId,
      userId,
      action: 'DELETE',
      entity,
      entityId,
    }),

  viewed: (entity: string, tenantId: string, userId: string, entityId?: string) =>
    createAuditLog({
      tenantId,
      userId,
      action: 'VIEW',
      entity,
      entityId,
    }),
}
