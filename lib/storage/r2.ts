import { AwsClient } from 'aws4fetch'
import { env } from '@/lib/env'

/**
 * Cloudflare R2 object storage, via the S3-compatible API.
 *
 * Signing is done with `aws4fetch` (a few KB, WebCrypto-based) rather than the
 * AWS SDK, which would add megabytes to every serverless bundle for four
 * operations.
 *
 * The bucket is private. Objects are never linked to directly — they are served
 * through `/api/files/[...key]`, which authorises the caller before streaming
 * the object back. `presignGetUrl` exists for the cases where a short-lived
 * direct link is genuinely wanted (e.g. handing a URL to a third party).
 */

let client: AwsClient | null = null

function r2() {
  const cfg = env('storage')

  if (!client) {
    client = new AwsClient({
      accessKeyId: cfg.R2_ACCESS_KEY_ID,
      secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
      service: 's3',
      // R2 ignores the region but SigV4 requires one; "auto" is what Cloudflare
      // documents for the S3-compatible endpoint.
      region: 'auto',
    })
  }

  const endpoint =
    cfg.R2_ENDPOINT ?? `https://${cfg.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

  return { client, endpoint: endpoint.replace(/\/$/, ''), bucket: cfg.R2_BUCKET }
}

/**
 * Percent-encode an object key without destroying the `/` separators that give
 * the bucket its folder-like layout.
 */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function objectUrl(key: string): string {
  const { endpoint, bucket } = r2()
  return `${endpoint}/${bucket}/${encodeKey(key)}`
}

/**
 * Reject keys that could escape their intended prefix once joined into a URL.
 * Callers build keys from database ids, but this is the last line of defence for
 * anything that reaches storage from a request.
 */
export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('..') ||
    key.includes('\\') ||
    key.includes('\0')
  ) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`)
  }
}

/** Upload an object. Returns the key it was stored under. */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  assertSafeKey(key)
  const { client } = r2()

  const res = await client.fetch(objectUrl(key), {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(body),
  })

  if (!res.ok) {
    throw new Error(`R2 upload failed (${res.status}): ${await res.text()}`)
  }

  return key
}

/**
 * Fetch an object. Returns `null` when it does not exist so callers can answer
 * 404 rather than 500.
 */
export async function getObject(key: string): Promise<Response | null> {
  assertSafeKey(key)
  const { client } = r2()

  const res = await client.fetch(objectUrl(key), { method: 'GET' })

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`R2 download failed (${res.status}): ${await res.text()}`)
  }

  return res
}

/** Delete an object. Succeeds silently if it is already gone. */
export async function deleteObject(key: string): Promise<void> {
  assertSafeKey(key)
  const { client } = r2()

  const res = await client.fetch(objectUrl(key), { method: 'DELETE' })

  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed (${res.status}): ${await res.text()}`)
  }
}

/**
 * Presigned GET URL for direct access to a private object.
 *
 * SigV4 caps presigned URL lifetime at 7 days, so this is not a substitute for
 * the authenticated `/api/files` route when a link needs to stay valid.
 */
export async function presignGetUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  assertSafeKey(key)
  const { client } = r2()

  const maxExpiry = 7 * 24 * 60 * 60
  const expires = Math.min(Math.max(expiresInSeconds, 1), maxExpiry)

  const url = new URL(objectUrl(key))
  url.searchParams.set('X-Amz-Expires', String(expires))

  const signed = await client.sign(new URL(url).toString(), {
    method: 'GET',
    aws: { signQuery: true },
  })

  return signed.url
}
