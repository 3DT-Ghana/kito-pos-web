import { putObject, getObject, deleteObject, presignGetUrl, assertSafeKey } from './r2'

/**
 * Application-level file storage.
 *
 * KYC documents (agent Ghana Cards, business application documents) live in a
 * private Cloudflare R2 bucket. What is persisted on the record is not a signed
 * R2 URL but the app-relative path `/api/files/<key>` — a stable, same-origin
 * reference that:
 *
 *   • never expires, unlike a presigned URL (SigV4 caps at 7 days);
 *   • re-checks authorisation on every view rather than once at upload time;
 *   • keeps the bucket entirely private, with no public bucket or custom domain.
 */

export const FILE_ROUTE_PREFIX = '/api/files/'

export { putObject, getObject, deleteObject, presignGetUrl, assertSafeKey }

/** The value to persist on a record for a freshly uploaded object. */
export function fileUrlForKey(key: string): string {
  assertSafeKey(key)
  return FILE_ROUTE_PREFIX + key.split('/').map(encodeURIComponent).join('/')
}

/**
 * Recover the storage key from a persisted file URL.
 *
 * Returns `null` for absolute URLs, which is how rows written before the move to
 * R2 are stored (they point at the old Supabase bucket). Those keep rendering
 * from their original host; only new uploads use the `/api/files` route.
 */
export function keyFromFileUrl(fileUrl: string): string | null {
  if (!fileUrl.startsWith(FILE_ROUTE_PREFIX)) return null
  const key = fileUrl
    .slice(FILE_ROUTE_PREFIX.length)
    .split('/')
    .map(decodeURIComponent)
    .join('/')
  return key || null
}

/** Upload a document and return the URL to persist on the owning record. */
export async function uploadDocument(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await putObject(key, buffer, contentType)
  return fileUrlForKey(key)
}
