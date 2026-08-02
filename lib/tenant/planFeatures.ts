import { prisma } from '@/lib/db/prisma'

export async function getTenantPlanFeatureKeys(tenantId: string) {
  try {
    const plan = await prisma.tenantBusinessPlan.findUnique({
      where: { tenantId },
      select: {
        features: { select: { feature: { select: { key: true } } } },
      },
    })

    return plan?.features.map((entry) => entry.feature.key) ?? []
  } catch (error) {
    console.error(`Failed to load tenant plan features for tenant ${tenantId}:`, error)
    return []
  }
}
