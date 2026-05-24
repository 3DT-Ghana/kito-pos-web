/**
 * Hubtel SMS Gateway Integration
 *
 * Hubtel is Ghana's leading SMS gateway.
 * API docs: https://developers.hubtel.com/docs/send-message-api
 *
 * Authentication: Basic Auth (clientId:clientSecret → Base64)
 * Endpoint: POST https://smsc.hubtel.com/v1/messages/send
 */

export interface HubtelConfig {
  clientId: string
  clientSecret: string
  senderId: string // max 11 chars, no spaces, e.g. "MYBIZ"
}

export interface SmsSendResult {
  success: boolean
  messageId?: string
  status?: string
  error?: string
}

/**
 * Send a single SMS via Hubtel
 */
export async function sendSms(
  config: HubtelConfig,
  to: string,
  message: string,
): Promise<SmsSendResult> {
  try {
    // Normalise Ghanaian number: strip leading 0 and prepend 233
    const normalised = normalisePhone(to)
    if (!normalised) {
      return { success: false, error: `Invalid phone number: ${to}` }
    }

    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

    const payload = {
      From: config.senderId,
      To: normalised,
      Content: message,
    }

    const res = await fetch('https://smsc.hubtel.com/v1/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      return {
        success: false,
        error: data?.Message || data?.message || `HTTP ${res.status}`,
      }
    }

    return {
      success: true,
      messageId: data?.MessageId || data?.messageId,
      status: data?.Status || data?.status,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/**
 * Normalise a Ghanaian phone number to international format (233XXXXXXXXX)
 * Accepts: 0244123456, +233244123456, 233244123456
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('233') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return '233' + digits.slice(1)
  if (digits.length === 9) return '233' + digits // e.g. 244123456
  return null
}

/**
 * Build a sale confirmation SMS
 */
export function buildSaleConfirmationSms(params: {
  businessName: string
  customerName: string
  totalAmount: number
  paidAmount: number
  balance: number
}): string {
  const { businessName, customerName, totalAmount, paidAmount, balance } = params
  const creditLine = balance > 0
    ? ` Balance owed: GHS ${balance.toFixed(2)}.`
    : ''
  return `${businessName}: Dear ${customerName}, your purchase of GHS ${totalAmount.toFixed(2)} has been recorded. Paid: GHS ${paidAmount.toFixed(2)}.${creditLine} Thank you!`
}

/**
 * Build a payment received SMS
 */
export function buildPaymentReceivedSms(params: {
  businessName: string
  customerName: string
  amount: number
  balance: number
}): string {
  const { businessName, customerName, amount, balance } = params
  const balanceLine = balance > 0
    ? ` Outstanding balance: GHS ${balance.toFixed(2)}.`
    : ' Your account is fully cleared.'
  return `${businessName}: Dear ${customerName}, we received your payment of GHS ${amount.toFixed(2)}.${balanceLine} Thank you!`
}

/**
 * Build a balance reminder SMS
 */
export function buildBalanceReminderSms(params: {
  businessName: string
  customerName: string
  balance: number
}): string {
  const { businessName, customerName, balance } = params
  return `${businessName}: Dear ${customerName}, this is a friendly reminder that you have an outstanding balance of GHS ${balance.toFixed(2)}. Please settle at your earliest convenience. Thank you.`
}
