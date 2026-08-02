export function extractBearerToken(headerValue: string | null | undefined): string | null {
  const value = headerValue?.trim()
  if (!value || !value.toLowerCase().startsWith('bearer ')) {
    return null
  }

  const token = value.slice(7).trim()
  return token || null
}

export function getMobileAuthToken(
  getHeader: (name: string) => string | null | undefined
): { token: string | null; hasAuthHeader: boolean } {
  const authorizationHeader = getHeader('authorization')
  const mobileAuthHeader = getHeader('x-mobile-auth')
  const token =
    extractBearerToken(authorizationHeader) ??
    extractBearerToken(mobileAuthHeader)

  return {
    token,
    hasAuthHeader: Boolean(authorizationHeader?.trim() || mobileAuthHeader?.trim()),
  }
}
