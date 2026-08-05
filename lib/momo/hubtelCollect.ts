/**
 * Hubtel Receive Money (MoMo Prompt) Integration
 *
 * Sends a payment prompt to a customer's mobile money account.
 * The customer receives a USSD/push notification and approves the payment.
 *
 * API docs: https://developers.hubtel.com/docs/receive-money-prompt
 * Endpoint: POST https://api.hubtel.com/v2/merchant/pay
 */

export interface HubtelCollectConfig {
  clientId: string
  clientSecret: string
}

export interface MomoCollectRequest {
  amount: number
  phoneNumber: string        // customer's MoMo number e.g. 0244123456
  description: string        // shown to customer e.g. "Payment to PETROS SHOP"
  clientReference: string    // unique ref e.g. sale ID or payment ID
}

export interface MomoCollectResult {
  success: boolean
  transactionId?: string     // Hubtel transaction ID to poll status
  status?: string
  error?: string
}

export interface MomoStatusResult {
  success: boolean
  status?: 'pending' | 'success' | 'failed'
  error?: string
}

/**
 * Ghana MSISDN in the form Hubtel expects. Shared with the Verification API,
 * which documents the same accepted formats (0XXXXXXXXX / 233XXXXXXXXX).
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('233') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return '233' + digits.slice(1)
  if (digits.length === 9) return '233' + digits
  return null
}

/** Hubtel authenticates every API in this family with the same Basic scheme. */
export function basicAuth(clientId: string, clientSecret: string): string {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

/**
 * Send a MoMo payment prompt to the customer.
 * Returns a transactionId you can poll for status.
 */
export async function sendMomoCollect(
  config: HubtelCollectConfig,
  req: MomoCollectRequest
): Promise<MomoCollectResult> {
  try {
    const phone = normalisePhone(req.phoneNumber)
    if (!phone) {
      return { success: false, error: `Invalid phone number: ${req.phoneNumber}` }
    }

    const payload = {
      Amount: req.amount,
      PhoneNumber: phone,
      Description: req.description,
      ClientReference: req.clientReference,
      CallbackUrl: '', // optional — we poll instead
    }

    const res = await fetch('https://api.hubtel.com/v2/merchant/pay', {
      method: 'POST',
      headers: {
        Authorization: basicAuth(config.clientId, config.clientSecret),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok || data?.ResponseCode !== '0000') {
      return {
        success: false,
        error: data?.Message || data?.message || `HTTP ${res.status}`,
      }
    }

    return {
      success: true,
      transactionId: data?.Data?.TransactionId || data?.TransactionId,
      status: 'pending',
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/**
 * Poll the status of a MoMo collect transaction.
 */
export async function getMomoStatus(
  config: HubtelCollectConfig,
  transactionId: string
): Promise<MomoStatusResult> {
  try {
    const res = await fetch(
      `https://api.hubtel.com/v2/merchant/pay/status/${encodeURIComponent(transactionId)}`,
      {
        headers: {
          Authorization: basicAuth(config.clientId, config.clientSecret),
        },
      }
    )

    const data = await res.json()

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` }
    }

    const rawStatus = (data?.Data?.Status || data?.Status || '').toLowerCase()
    const status: MomoStatusResult['status'] =
      rawStatus === 'success' || rawStatus === 'successful' ? 'success'
      : rawStatus === 'failed' || rawStatus === 'cancelled' ? 'failed'
      : 'pending'

    return { success: true, status }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
