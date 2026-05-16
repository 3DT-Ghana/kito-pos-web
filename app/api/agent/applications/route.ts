import { NextResponse } from 'next/server'
import { requireApprovedAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'
import { BusinessType } from '@prisma/client'

/**
 * GET /api/agent/applications
 * List all business applications submitted by the authenticated agent.
 *
 * POST /api/agent/applications
 * Submit a new business application.
 */

export async function GET() {
  const { context, error } = await requireApprovedAgent()
  if (error) return error

  const applications = await prisma.businessApplication.findMany({
    where: { agentId: context!.agent.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(applications)
}

export async function POST(req: Request) {
  const { context, error } = await requireApprovedAgent()
  if (error) return error

  try {
    const body = await req.json()
    const {
      businessName,
      businessType,
      businessAddress,
      gpsLatitude,
      gpsLongitude,
      ownerFullName,
      ownerPhone,
      ownerEmail,
      ownerGhanaCardNumber,
    } = body

    if (!businessName || !businessAddress || !ownerFullName || !ownerPhone || !ownerEmail) {
      return NextResponse.json(
        { error: 'businessName, businessAddress, ownerFullName, ownerPhone and ownerEmail are required' },
        { status: 400 }
      )
    }

    const validTypes = ['SHOP', 'COMPANY', 'OTHER']
    const resolvedType: BusinessType =
      businessType && validTypes.includes(businessType) ? businessType : 'SHOP'

    const application = await prisma.businessApplication.create({
      data: {
        businessName,
        businessType: resolvedType,
        businessAddress,
        gpsLatitude: gpsLatitude ?? null,
        gpsLongitude: gpsLongitude ?? null,
        ownerFullName,
        ownerPhone,
        ownerEmail,
        ownerGhanaCardNumber: ownerGhanaCardNumber ?? null,
        agentId: context!.agent.id,
      },
    })

    return NextResponse.json(application, { status: 201 })
  } catch (err) {
    console.error('Business application create error:', err)
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }
}
