import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requirePermission } from '@/lib/permissions/rbac'
import { countAuditLogs, getAuditLogs } from '@/lib/audit/auditLog'

/**
 * Audit Logs API
 *
 * GET /api/audit-logs - View audit logs
 */

/**
 * GET /api/audit-logs
 * Get audit logs for the current tenant
 * Requires: view_audit_logs permission (OWNER only)
 *
 * Query params:
 * - userId: Filter by user
 * - entity: Filter by entity type
 * - action: Filter by action type
 * - limit: Number of records (default 100)
 * - offset: Pagination offset
 */
export async function GET(req: Request) {
  try {
    const { error, tenantId, user, rolePermissions } = await requireTenant()
    if (error) return error!

    // Check permission - only OWNERs can view audit logs
    const { authorized, error: permError } = requirePermission(
      { role: user!.role, rolePermissions },
      'view_audit_logs'
    )
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || undefined
    const entity = searchParams.get('entity') || undefined
    const action = searchParams.get('action') || undefined
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)

    const options = {
      userId,
      entity,
      action,
      limit,
      offset,
    }

    const [logs, total] = await Promise.all([
      getAuditLogs(tenantId, options),
      countAuditLogs(tenantId, options),
    ])

    return NextResponse.json({
      logs,
      pagination: {
        limit,
        offset,
        total,
      },
    })
  } catch (err) {
    console.error('Failed to fetch audit logs:', err)
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    )
  }
}
