import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'

interface RouteParams { params: Promise<{ id: string }> }

const PLAN_INCLUDE = {
  features: {
    include: { feature: true },
    orderBy: { createdAt: 'asc' as const },
  },
  items: {
    include: { item: true },
    orderBy: { createdAt: 'asc' as const },
  },
  invoices: {
    orderBy: { createdAt: 'desc' as const },
    take: 5,
    select: { id: true, invoiceNumber: true, total: true, status: true, createdAt: true },
  },
}

/**
 * GET  /api/admin/tenant-plans/[id]
 *   id can be a plan UUID or a tenantId (the route resolves both).
 *
 * PUT  /api/admin/tenant-plans/[id]
 *   Upsert: create or fully replace a tenant's plan (features + items).
 *   Body: { tenantId, name?, billingCycle, discount, features: [...], items: [...] }
 */

export async function GET(_req: Request, { params }: RouteParams) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  // Try by plan id first, then by tenantId
  const plan = await prisma.tenantBusinessPlan.findFirst({
    where: { OR: [{ id }, { tenantId: id }] },
    include: PLAN_INCLUDE,
  })

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: plan.tenantId },
    select: { id: true, name: true, status: true, agentId: true },
  })

  return NextResponse.json({ ...plan, tenant })
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  try {
    const body = await req.json()
    const {
      tenantId,
      name,
      billingCycle = 'MONTHLY',
      discount = 0,
      notes,
      features = [],   // [{ featureId, setupFee?, monthlyFee?, yearlyFee?, oneTimeFee?, discount? }]
      items = [],      // [{ itemId, quantity?, unitPrice?, discount? }]
    } = body

    const resolvedTenantId = tenantId ?? id

    const tenant = await prisma.tenant.findUnique({ where: { id: resolvedTenantId }, select: { id: true, name: true } })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Upsert plan
    const plan = await prisma.tenantBusinessPlan.upsert({
      where: { tenantId: resolvedTenantId },
      create: {
        tenantId: resolvedTenantId,
        name: name ?? `${tenant.name} Plan`,
        billingCycle,
        discount,
        notes: notes ?? null,
        createdByEmail: context!.email,
      },
      update: {
        name: name ?? undefined,
        billingCycle,
        discount,
        notes: notes ?? undefined,
      },
    })

    // Replace features
    await prisma.tenantPlanFeature.deleteMany({ where: { planId: plan.id } })
    if (features.length > 0) {
      await prisma.tenantPlanFeature.createMany({
        data: features.map((f: { featureId: string; setupFee?: number; monthlyFee?: number; yearlyFee?: number; oneTimeFee?: number; discount?: number }) => ({
          planId: plan.id,
          featureId: f.featureId,
          setupFee: f.setupFee ?? null,
          monthlyFee: f.monthlyFee ?? null,
          yearlyFee: f.yearlyFee ?? null,
          oneTimeFee: f.oneTimeFee ?? null,
          discount: f.discount ?? null,
        })),
      })
    }

    // Replace items
    await prisma.tenantPlanItem.deleteMany({ where: { planId: plan.id } })
    if (items.length > 0) {
      await prisma.tenantPlanItem.createMany({
        data: items.map((i: { itemId: string; quantity?: number; unitPrice?: number; discount?: number }) => ({
          planId: plan.id,
          itemId: i.itemId,
          quantity: i.quantity ?? 1,
          unitPrice: i.unitPrice ?? null,
          discount: i.discount ?? null,
        })),
      })
    }

    // Sync tenant feature flags to match assigned plan features
    await syncTenantFeatureFlags(resolvedTenantId, plan.id)

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'tenant_plan.updated',
        entity: 'TenantBusinessPlan',
        entityId: plan.id,
        details: { tenantId: resolvedTenantId, features: features.length, items: items.length },
      },
    })

    const updated = await prisma.tenantBusinessPlan.findUnique({ where: { id: plan.id }, include: PLAN_INCLUDE })
    return NextResponse.json({ ...updated, tenant })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to save tenant plan' }, { status: 500 })
  }
}

/**
 * Sync the tenant's enable* column flags to match the feature modules currently
 * on their plan. This ensures existing code paths that check tenant columns
 * still work even before a session refresh resolves the plan.
 */
async function syncTenantFeatureFlags(tenantId: string, planId: string) {
  const planFeatures = await prisma.tenantPlanFeature.findMany({
    where: { planId },
    include: { feature: { select: { key: true } } },
  })

  const keys = new Set(planFeatures.map((pf) => pf.feature.key))

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      enablePosTerminal:    keys.has('pos') || keys.has('pos_terminal'),
      enableAccounting:     keys.has('accounting'),
      enablePayroll:        keys.has('payroll'),
      enableBranches:       keys.has('multi_branch') || keys.has('branches'),
      enablePurchaseOrders: keys.has('purchase_orders'),
      enableQuotations:     keys.has('quotations'),
      enableExpenses:       keys.has('expense_tracking') || keys.has('expenses'),
      enableTill:           keys.has('till'),
      enableBarcodeGenerator: keys.has('barcodes') || keys.has('barcode'),
      enableExpiryTracking: keys.has('expiry_tracking') || keys.has('expiry'),
      enableCreditSales:    keys.has('credit_sales'),
      enableSmsNotifications: keys.has('sms_notifications') || keys.has('sms'),
      requireApproval:      keys.has('approval'),
    },
  })
}
