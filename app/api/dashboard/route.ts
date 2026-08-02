import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { getDashboardData } from '@/lib/dashboard/getDashboardData'

export async function GET() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    return NextResponse.json(await getDashboardData(context!))
  } catch (err) {
    console.error('Dashboard API error:', err)
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
  }
}
