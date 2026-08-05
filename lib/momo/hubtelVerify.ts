import { basicAuth, normalisePhone } from './hubtelCollect'

/**
 * Hubtel Verification API — Mobile Money Registration & Username Query.
 *
 * Confirms that a number is registered for mobile money and returns the name
 * on the wallet, so a mistyped digit is caught before a payment prompt is sent
 * to a stranger's phone.
 *
 * Docs: developers.hubtel.com → Complementary APIs → Verification
 * Endpoint:
 *   GET https://rnv.hubtel.com/v2/merchantaccount/merchants/{account}/mobilemoney/verify
 *       ?channel={channel}&customerMsisdn={number}
 *
 * Note this sits on a different host to the payment API and identifies the
 * merchant by Collection Account Number in the path, not by credentials alone.
 *
 * Hubtel requires the *server's* public IP to be whitelisted with them — every
 * call is refused otherwise, which is why this must never gate a sale.
 */

export type MomoChannel = 'mtn-gh' | 'vodafone-gh' | 'tigo-gh'

/** Networks as the cashier sees them, paired with Hubtel's channel codes. */
export const MOMO_CHANNELS: { value: MomoChannel; label: string }[] = [
  { value: 'mtn-gh', label: 'MTN' },
  { value: 'vodafone-gh', label: 'Telecel' },
  { value: 'tigo-gh', label: 'AirtelTigo' },
]

export function isMomoChannel(value: unknown): value is MomoChannel {
  return MOMO_CHANNELS.some((c) => c.value === value)
}

export interface HubtelVerifyConfig {
  clientId: string
  clientSecret: string
  /** Hubtel Collection Account Number, e.g. "11684". */
  collectionAccount: string
}

export interface MomoVerifyResult {
  /** Whether the call itself completed — not whether the number is registered. */
  success: boolean
  isRegistered?: boolean
  /** Name on the mobile money wallet, e.g. "JOSEPH ANNOH". */
  name?: string
  /** Wallet status, e.g. "active". */
  status?: string
  /** "Subscriber" (individual), "Agent" (vendor) or "Merchant". v2 only. */
  profile?: string
  /** Hubtel's own message where present — it is written for operators. */
  error?: string
}

// A hanging verification must never hold up a sale.
const TIMEOUT_MS = 8000

export async function verifyMomoNumber(
  config: HubtelVerifyConfig,
  channel: MomoChannel,
  phoneNumber: string
): Promise<MomoVerifyResult> {
  const phone = normalisePhone(phoneNumber)
  if (!phone) {
    return { success: false, error: `Invalid phone number: ${phoneNumber}` }
  }

  const url =
    `https://rnv.hubtel.com/v2/merchantaccount/merchants/` +
    `${encodeURIComponent(config.collectionAccount)}/mobilemoney/verify` +
    `?channel=${encodeURIComponent(channel)}&customerMsisdn=${encodeURIComponent(phone)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: basicAuth(config.clientId, config.clientSecret),
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      return {
        success: false,
        error:
          data?.message ||
          (res.status === 401 || res.status === 403
            ? 'Hubtel rejected the request. Check the credentials, and that this server’s IP is whitelisted.'
            : `Verification unavailable (HTTP ${res.status})`),
      }
    }

    // A documented failure ("2001") returns data: null with a message written
    // for the operator, so pass it through rather than inventing our own.
    if (data?.responseCode !== '0000' || !data?.data) {
      return {
        success: false,
        error: data?.message || 'This number could not be verified.',
      }
    }

    return {
      success: true,
      isRegistered: Boolean(data.data.isRegistered),
      name: data.data.name || undefined,
      status: data.data.status || undefined,
      // profile is v2-only; tolerate its absence rather than showing "undefined".
      profile: data.data.profile || undefined,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: 'Verification timed out.' }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Verification failed.',
    }
  } finally {
    clearTimeout(timer)
  }
}
