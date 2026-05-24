import { NextResponse } from 'next/server'
import { requireAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'
import { uploadGhanaCard, getSignedUrl } from '@/lib/storage/supabase'
import { getGlobalKYCSettings } from '@/lib/kyc/settings'

/**
 * POST /api/agent/upload-ghana-card
 * Upload Ghana Card image + card number for the authenticated agent.
 * Available to agents of any status (including PENDING).
 * Accepts multipart/form-data: file (image), ghanaCardNumber (string)
 */
export async function POST(req: Request) {
  const { context, error } = await requireAgent()
  if (error) return error

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const ghanaCardNumber = formData.get('ghanaCardNumber') as string | null
    const trimmedCardNumber = ghanaCardNumber?.trim() || null

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const kycSettings = await getGlobalKYCSettings()
    if (
      kycSettings.requireAgentGhanaCardNumber &&
      !trimmedCardNumber &&
      !context!.agent.ghanaCardNumber?.trim()
    ) {
      return NextResponse.json({ error: 'ghanaCardNumber is required' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'File must be a JPEG, PNG, or WebP image' },
        { status: 400 }
      )
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 })
    }

    const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
    const path = `agents/${context!.agent.id}/ghana-card.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadGhanaCard(path, buffer, file.type)
    const signedUrl = await getSignedUrl(path)

    const updated = await prisma.agent.update({
      where: { id: context!.agent.id },
      data: {
        ghanaCardImageUrl: signedUrl,
        ...(trimmedCardNumber ? { ghanaCardNumber: trimmedCardNumber } : {}),
      },
      select: {
        id: true,
        agentCode: true,
        fullName: true,
        email: true,
        ghanaCardNumber: true,
        ghanaCardImageUrl: true,
        status: true,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Ghana Card upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
