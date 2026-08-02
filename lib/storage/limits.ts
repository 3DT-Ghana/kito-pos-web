/**
 * Upload limits.
 *
 * A Vercel function rejects request bodies larger than ~4.5 MB at the platform
 * edge, before the route handler runs, so anything above that surfaces as an
 * opaque 413 rather than a useful validation message. 4 MB leaves headroom for
 * multipart boundaries and the other form fields.
 *
 * To accept larger files, move uploads off the request path entirely: mint a
 * presigned PUT with `presignGetUrl`'s sibling in lib/storage/r2.ts and have the
 * browser upload straight to R2. `MAX_UPLOAD_BYTES` is the only thing that has
 * to change here once that lands.
 *
 * Shared by client and server so the browser can reject an oversized file before
 * spending the upload.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export const MAX_UPLOAD_LABEL = '4 MB'
