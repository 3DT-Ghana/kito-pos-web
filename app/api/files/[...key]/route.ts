import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { getObject } from '@/lib/storage'

/**
 * GET /api/files/<key>
 *
 * Streams a private object out of the Cloudflare R2 bucket after checking that
 * the caller is allowed to see it. This is the only way KYC documents are read;
 * the bucket itself has no public access and no custom domain.
 *
 * Authorisation:
 *   agents/<agentId>/...        — the agent themselves, or a super admin
 *   businesses/<applicationId>/ — the agent who submitted the application, or a
 *                                 super admin
 *   anything else               — denied
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ key: string[] }>
}

const INLINE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])

async function isAuthorised(
  key: string,
  session: { user?: { platformRole?: string; agentId?: string } } | null
): Promise<boolean> {
  const user = session?.user
  if (!user) return false

  if (user.platformRole === 'SUPER_ADMIN') return true
  if (user.platformRole !== 'AGENT' || !user.agentId) return false

  const [scope, id] = key.split('/')

  if (scope === 'agents') {
    return id === user.agentId
  }

  if (scope === 'businesses') {
    const application = await prisma.businessApplication.findFirst({
      where: { id, agentId: user.agentId },
      select: { id: true },
    })
    return application !== null
  }

  return false
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { key: segments } = await params
  const key = segments.map(decodeURIComponent).join('/')

  // Path traversal guard — belt and braces alongside assertSafeKey in the R2
  // layer, because this key comes straight off the URL.
  if (segments.some((s) => s === '..' || s === '.' || s.includes('\\') || s.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  if (!(await isAuthorised(key, session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const object = await getObject(key)

    if (!object) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const contentType = object.headers.get('content-type') ?? 'application/octet-stream'
    const headers = new Headers({
      'Content-Type': contentType,
      // Private, per-user content: never let a shared cache hold on to it.
      'Cache-Control': 'private, no-store',
      'Content-Disposition': INLINE_TYPES.has(contentType) ? 'inline' : 'attachment',
      'X-Content-Type-Options': 'nosniff',
    })

    const length = object.headers.get('content-length')
    if (length) headers.set('Content-Length', length)

    return new NextResponse(object.body, { status: 200, headers })
  } catch (err) {
    console.error('File download error:', err)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
