import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { ImprovedDashboard } from './ImprovedDashboard'
import { prisma } from '@/lib/db/prisma'

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
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    })
    if (tenant) {
      tenantName = tenant.name
    }
  } catch (error) {
    console.error('Failed to fetch tenant:', error)
  }

  return (
    <ImprovedDashboard
      userName={user.name}
      tenantName={tenantName}
    />
  )
}
