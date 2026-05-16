/**
 * Supabase Storage helpers for Ghana Card image uploads.
 * Uses the Supabase Storage REST API directly (no SDK required).
 * Bucket: ghana-cards (private — create it in Supabase Dashboard → Storage)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'ghana-cards'

function storageHeaders() {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: SERVICE_ROLE_KEY,
  }
}

/**
 * Upload a file buffer to Supabase Storage.
 * Returns the storage path (not a public URL — use getSignedUrl to display).
 */
export async function uploadGhanaCard(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...storageHeaders(),
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: new Uint8Array(buffer),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Storage upload failed: ${err}`)
  }

  return path
}

/**
 * Get a signed URL for a private storage object (valid for 1 year).
 */
export async function getSignedUrl(path: string): Promise<string> {
  const url = `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...storageHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 31536000 }), // 1 year
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to get signed URL: ${err}`)
  }

  const data = await res.json()
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`
}
