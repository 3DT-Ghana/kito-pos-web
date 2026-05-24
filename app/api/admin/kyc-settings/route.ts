import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/admin/kyc-settings
 * Return the global KYC settings (upserted on first read with defaults).
 *
 * PATCH /api/admin/kyc-settings
 * Update KYC requirement rules.
 * Body: any subset of {
 *   requireBusinessRegNumber,
 *   requireBusinessCertUpload,
 *   requireDirectorGhanaCardNumber,
 *   requireDirectorGhanaCardUpload,
 *   requireAgentGhanaCardNumber,
 *   requireAgentGhanaCardUpload,
 * }
 */

export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const settings = await prisma.kYCSettings.upsert({
    where: { id: 'global' },
    create: { id: 'global' },
    update: {},
  })

  return NextResponse.json(settings)
}

export async function PATCH(req: Request) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  try {
    const body = await req.json()
    const {
      requireBusinessRegNumber,
      requireBusinessCertUpload,
      requireDirectorGhanaCardNumber,
      requireDirectorGhanaCardUpload,
      requireAgentGhanaCardNumber,
      requireAgentGhanaCardUpload,
    } = body

    const data: Record<string, boolean | string> = {}

    if (typeof requireBusinessRegNumber === 'boolean') data.requireBusinessRegNumber = requireBusinessRegNumber
    if (typeof requireBusinessCertUpload === 'boolean') data.requireBusinessCertUpload = requireBusinessCertUpload
    if (typeof requireDirectorGhanaCardNumber === 'boolean') data.requireDirectorGhanaCardNumber = requireDirectorGhanaCardNumber
    if (typeof requireDirectorGhanaCardUpload === 'boolean') data.requireDirectorGhanaCardUpload = requireDirectorGhanaCardUpload
    if (typeof requireAgentGhanaCardNumber === 'boolean') data.requireAgentGhanaCardNumber = requireAgentGhanaCardNumber
    if (typeof requireAgentGhanaCardUpload === 'boolean') data.requireAgentGhanaCardUpload = requireAgentGhanaCardUpload

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    data.updatedByEmail = context!.email

    const settings = await prisma.kYCSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...data },
      update: data,
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'kyc_settings.updated',
        entity: 'KYCSettings',
        entityId: 'global',
        details: data,
      },
    })

    return NextResponse.json(settings)
  } catch (err) {
    console.error('KYC settings update error:', err)
    return NextResponse.json({ error: 'Failed to update KYC settings' }, { status: 500 })
  }
}
