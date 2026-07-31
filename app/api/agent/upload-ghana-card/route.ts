import { NextResponse } from 'next/server'
import { requireAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'
import { uploadDocument } from '@/lib/storage'
import { getGlobalKYCSettings } from '@/lib/kyc/settings'
import { MAX_UPLOAD_BYTES } from '@/lib/storage/limits'

export const runtime = 'nodejs'

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

    // 4 MB, not 5: a Vercel function rejects request bodies over ~4.5 MB before
    // the handler ever runs, so a 5 MB cap here would surface as an opaque
    // platform error rather than this message.
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File must be under 4 MB' }, { status: 400 })
    }

    const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
    const key = `agents/${context!.agent.id}/ghana-card.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileUrl = await uploadDocument(key, buffer, file.type)

    const updated = await prisma.agent.update({
      where: { id: context!.agent.id },
      data: {
        ghanaCardImageUrl: fileUrl,
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
