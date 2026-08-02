import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import {
  getCachedPlatformSettings,
  getDefaultPlatformSettings,
  primePlatformSettingsCache,
} from '@/lib/admin/platformSettings'

const DEFAULTS = getDefaultPlatformSettings()

// Public GET — no auth needed; client-side hook and auth.ts read this.
export async function GET() {
  try {
    const settings = await getCachedPlatformSettings()
    return NextResponse.json(settings)
  } catch {
    // DB unavailable — return hardcoded defaults so the app still works
    return NextResponse.json(DEFAULTS)
  }
}

export async function PATCH(req: Request) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  try {
    const body = await req.json()
    const data: Record<string, number> = {}

    const idle = Number(body.idleTimeoutMinutes)
    const sess = Number(body.sessionMaxHours)

    if (Number.isInteger(idle) && idle >= 1 && idle <= 60) data.idleTimeoutMinutes = idle
    if (Number.isInteger(sess) && sess >= 1 && sess <= 24) data.sessionMaxHours = sess

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields. idleTimeoutMinutes: 1–60, sessionMaxHours: 1–24.' }, { status: 400 })
    }

    const settings = await prisma.platformSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...DEFAULTS, ...data },
      update: { ...data, updatedByEmail: context!.email },
    })

    primePlatformSettingsCache({
      idleTimeoutMinutes: settings.idleTimeoutMinutes,
      sessionMaxHours: settings.sessionMaxHours,
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'session_settings.updated',
        entity: 'PlatformSettings',
        entityId: 'global',
        details: data,
      },
    })

    return NextResponse.json({
      idleTimeoutMinutes: settings.idleTimeoutMinutes,
      sessionMaxHours: settings.sessionMaxHours,
      updatedAt: settings.updatedAt,
      updatedByEmail: settings.updatedByEmail,
    })
  } catch (err) {
    console.error('Session settings update error:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
