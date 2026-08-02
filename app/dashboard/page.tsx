import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { ImprovedDashboard } from './ImprovedDashboard'
import { prisma } from '@/lib/db/prisma'
import { AppLayout } from '@/components/layout/AppLayout'
import { requireBranchAccess } from '@/lib/branch/server'
import { getDashboardData } from '@/lib/dashboard/getDashboardData'

/**
 * Dashboard Page
 *
 * Main dashboard with improved UX for non-technical users
 * Large buttons, clear labels, colorful design
 */

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user) {
    redirect('/auth/login')
  }

  const { user } = session

  if (!user.tenantId) {
    redirect('/agent/dashboard')
  }

  // Cashiers go straight to POS
  if (user.role === 'CASHIER') {
    redirect('/pos')
  }

  // Get tenant name
  let tenantName = 'My Business'
  let initialDashboardData = null
  let initialBranchId: string | null = null
  try {
    const [tenant, branchAccess] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true },
      }),
      requireBranchAccess(),
    ])
    if (tenant) {
      tenantName = tenant.name
    }

    if (!branchAccess.error && branchAccess.context) {
      initialBranchId = branchAccess.context.currentBranchId
      initialDashboardData = await getDashboardData(branchAccess.context)
    }
  } catch (error) {
    console.error('Failed to fetch tenant:', error)
  }

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)

  return (
    <AppLayout>
      <ImprovedDashboard
        userName={user.name}
        tenantName={tenantName}
        greeting={greeting}
        dateStr={dateStr}
        initialDashboardData={initialDashboardData}
        initialBranchId={initialBranchId}
      />
    </AppLayout>
  )
}
