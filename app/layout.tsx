import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { SessionProvider } from "@/components/providers/SessionProvider"
import { BranchProvider, type Branch } from "@/lib/branch/BranchContext"
import { ALL_BRANCHES_SELECTION, BRANCH_SELECTION_COOKIE } from '@/lib/branch/constants'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import {
  canViewAllBranchesForRole,
  type RolePermissionsMap,
} from '@/lib/permissions/rbac'
import {
  DEFAULT_TENANT_FEATURES,
  TENANT_CLIENT_FEATURE_SELECT,
  toTenantFeatures,
} from '@/lib/tenant/clientFeatures'
import { TenantBootstrapProvider } from '@/lib/tenant/TenantBootstrapContext'
import { mergePlanFeatures } from '@/lib/tenant/features'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Market Inventory - Multi-Tenant Sales & Inventory Management',
  description: 'Manage sales, inventory, customers, and suppliers for your business',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession(authOptions)
  const tenantId = session?.user?.tenantId ?? null

  let tenantName: string | null = null
  let features = DEFAULT_TENANT_FEATURES
  let rolePermissions: RolePermissionsMap | null = null
  let branchState = {
    branches: [] as Branch[],
    branchesEnabled: false,
    currentBranchId: null as string | null,
    assignedBranchId: null as string | null,
    canViewAllBranches: false,
    isBranchLocked: false,
  }

  if (tenantId) {
    const [tenant, plan] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          name: true,
          rolePermissions: true,
          ...TENANT_CLIENT_FEATURE_SELECT,
        },
      }),
      prisma.tenantBusinessPlan.findUnique({
        where: { tenantId },
        select: {
          features: { select: { feature: { select: { key: true } } } },
        },
      }),
    ])

    if (tenant) {
      tenantName = tenant.name
      rolePermissions = (tenant.rolePermissions as RolePermissionsMap | null) ?? null
      const baseFeatures = toTenantFeatures(tenant)
      const planKeys = plan?.features.map((entry) => entry.feature.key) ?? []
      features = {
        ...baseFeatures,
        ...mergePlanFeatures(baseFeatures, planKeys),
      }

      if (features.enableBranches && session?.user?.role) {
        const cookieStore = await cookies()
        const rawSelection = cookieStore.get(BRANCH_SELECTION_COOKIE)?.value?.trim()
        const [userRecord, allBranches] = await Promise.all([
          prisma.user.findFirst({
            where: { id: session.user.id, tenantId },
            select: { branchId: true },
          }),
          prisma.branch.findMany({
            where: { tenantId },
            select: { id: true, name: true, isDefault: true },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          }),
        ])

        const canViewAllBranches = canViewAllBranchesForRole(session.user.role)
        const branchIds = new Set(allBranches.map((branch) => branch.id))
        const assignedBranchId =
          userRecord?.branchId && branchIds.has(userRecord.branchId)
            ? userRecord.branchId
            : null
        const defaultBranch = allBranches.find((branch) => branch.isDefault) ?? allBranches[0] ?? null

        let currentBranchId: string | null = null
        if (assignedBranchId && !canViewAllBranches) {
          currentBranchId = assignedBranchId
        } else if (!assignedBranchId && !canViewAllBranches) {
          currentBranchId = defaultBranch?.id ?? null
        } else if (canViewAllBranches && rawSelection === ALL_BRANCHES_SELECTION) {
          currentBranchId = null
        } else if (rawSelection && rawSelection !== ALL_BRANCHES_SELECTION && branchIds.has(rawSelection)) {
          currentBranchId = rawSelection
        } else {
          currentBranchId = assignedBranchId ?? defaultBranch?.id ?? null
        }

        branchState = {
          branches:
            assignedBranchId && !canViewAllBranches
              ? allBranches.filter((branch) => branch.id === assignedBranchId)
              : allBranches,
          branchesEnabled: true,
          currentBranchId,
          assignedBranchId,
          canViewAllBranches,
          isBranchLocked: Boolean(assignedBranchId && !canViewAllBranches),
        }
      }
    }
  }

  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#2563eb" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider session={session}>
          <TenantBootstrapProvider value={{ tenantId, tenantName, features, rolePermissions }}>
            <BranchProvider initialState={branchState}>{children}</BranchProvider>
          </TenantBootstrapProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
