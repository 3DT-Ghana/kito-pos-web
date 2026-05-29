import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { seedFeatureModules } from '@/lib/billing/seedModules'

/**
 * GET  /api/admin/feature-modules  — list all feature modules (seeds on first call)
 * POST /api/admin/feature-modules  — create a custom module
 */

export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  // Ensure canonical modules exist on every fresh DB
  await seedFeatureModules()

  const modules = await prisma.featureModule.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(modules)
}

export async function POST(req: Request) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  try {
    const body = await req.json()
    const { key, name, description, category, setupFee, monthlyFee, yearlyFee, oneTimeFee, discount, commissionRate, vatRate, sortOrder } = body

    if (!key?.trim() || !name?.trim()) {
      return NextResponse.json({ error: 'key and name are required' }, { status: 400 })
    }

    const exists = await prisma.featureModule.findUnique({ where: { key: key.trim() } })
    if (exists) {
      return NextResponse.json({ error: 'A module with that key already exists' }, { status: 409 })
    }

    const featureModule = await prisma.featureModule.create({
      data: {
        key: key.trim(),
        name: name.trim(),
        description: description?.trim() ?? null,
        category: category?.trim() ?? 'Module',
        setupFee: setupFee ?? 0,
        monthlyFee: monthlyFee ?? 0,
        yearlyFee: yearlyFee ?? 0,
        oneTimeFee: oneTimeFee ?? 0,
        discount: discount ?? 0,
        commissionRate: commissionRate ?? 0,
        vatRate: vatRate ?? 0,
        sortOrder: sortOrder ?? 99,
      },
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'feature_module.created',
        entity: 'FeatureModule',
        entityId: featureModule.id,
        details: { key: featureModule.key, name: featureModule.name },
      },
    })

    return NextResponse.json(featureModule, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create feature module' }, { status: 500 })
  }
}
