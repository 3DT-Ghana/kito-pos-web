import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { TenantStatus } from '@prisma/client'
import { sendMail } from '@/lib/email/mailer'
import {
  onboardingNotificationHtml,
  onboardingNotificationText,
} from '@/lib/email/templates/onboardingNotification'
import {
  createTenantWithOwner,
  normalizeEmail,
  OwnerEmailConflictError,
} from '@/lib/tenant/onboarding'

const ADMIN_NOTIFICATION_EMAIL = 'ee.wilson@outlook.com'

/**
 * Tenants API
 *
 * POST /api/tenants - Create new tenant (signup/registration)
 */

/**
 * POST /api/tenants
 * Create a new tenant with owner user (signup)
 * This is a public endpoint (no authentication required)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const normalizedEmail = normalizeEmail(String(body.email))
    const businessName = String(body.businessName).trim()
    const phone = body.phone ? String(body.phone).trim() : null

    // Validate required fields
    const validationError = validateSignupData(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      )
    }

    // Hash password
    const hashedPassword = await hash(body.password, 10)

    // Create tenant and owner user atomically
    const result = await prisma.$transaction(async (tx) => {
      return createTenantWithOwner(tx, {
        businessName,
        phone,
        status: TenantStatus.TRIAL,
        ownerName: body.name,
        ownerEmail: normalizedEmail,
        passwordHash: hashedPassword,
      })
    })

    // Don't return password in response
    const { password, ...userWithoutPassword } = result.owner
    void password

    // Fire-and-forget admin notification email
    sendMail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `🏪 New Business Onboarded: ${result.tenant.name}`,
      html: onboardingNotificationHtml({
        businessName: result.tenant.name,
        ownerName: result.owner.name,
        ownerEmail: result.owner.email,
        createdAt: result.tenant.createdAt,
      }),
      text: onboardingNotificationText({
        businessName: result.tenant.name,
        ownerName: result.owner.name,
        ownerEmail: result.owner.email,
        createdAt: result.tenant.createdAt,
      }),
    })

    return NextResponse.json(
      {
        message: 'Account created successfully',
        tenant: result.tenant,
        user: userWithoutPassword,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof OwnerEmailConflictError) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    console.error('Failed to create tenant:', err)
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    )
  }
}

/**
 * Validate signup data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateSignupData(data: any): string | null {
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    return 'Your name is required'
  }

  if (!data.email || typeof data.email !== 'string') {
    return 'Email is required'
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(data.email)) {
    return 'Invalid email format'
  }

  if (!data.password || typeof data.password !== 'string' || data.password.length < 8) {
    return 'Password must be at least 8 characters'
  }

  if (!data.businessName || typeof data.businessName !== 'string' || data.businessName.trim().length === 0) {
    return 'Business name is required'
  }

  return null
}
