/**
 * Meta WhatsApp Business Cloud API integration.
 *
 * Uses free-form text messages (conversations initiated within a 24-hour window).
 * For messages outside the 24-hour window, Meta requires pre-approved templates.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages
 *
 * Environment setup:
 *   - Create a Meta App at https://developers.facebook.com
 *   - Add WhatsApp product → create a WABA (WhatsApp Business Account)
 *   - Get a System User Token (permanent) from Business Settings → System Users
 *   - Get the Phone Number ID from WhatsApp → API Setup in the Meta App dashboard
 *   - Store them per-tenant in: metaWabaToken, metaWabaPhoneNumberId
 */

const META_API_VERSION = 'v20.0'

export interface WhatsAppConfig {
  token: string         // System user access token
  phoneNumberId: string // WhatsApp Phone Number ID (not the actual phone number)
}

export interface WhatsAppSendResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send a plain text WhatsApp message via Meta Cloud API.
 * Works within the 24-hour customer-initiated window OR for marketing
 * templates approved by Meta. For receipts/notifications we use
 * the utility / authentication conversation category which is lower cost.
 */
export async function sendWhatsApp(
  config: WhatsAppConfig,
  to: string,
  message: string,
): Promise<WhatsAppSendResult> {
  try {
    const normalised = normaliseGhanaPhone(to)
    if (!normalised) {
      return { success: false, error: `Invalid phone number: ${to}` }
    }

    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalised,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
      },
    )

    const data = await res.json()

    if (!res.ok) {
      const errMsg =
        data?.error?.message ||
        data?.error?.error_data?.details ||
        `HTTP ${res.status}`
      return { success: false, error: errMsg }
    }

    return {
      success: true,
      messageId: data?.messages?.[0]?.id,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/**
 * Normalise a Ghanaian phone number to international format (233XXXXXXXXX).
 * Meta requires full international format without the leading +.
 */
export function normaliseGhanaPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('233') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return '233' + digits.slice(1)
  if (digits.length === 9) return '233' + digits
  return null
}

// ── Message builders ──────────────────────────────────────────────────────

export function buildWhatsAppPaymentReceipt(params: {
  businessName: string
  customerName: string
  amount: number
  balance: number
  paymentMethod?: string
}): string {
  const { businessName, customerName, amount, balance, paymentMethod } = params
  const method = paymentMethod ? ` via ${paymentMethod}` : ''
  const balanceLine =
    balance > 0
      ? `\n💳 *Outstanding balance:* GHS ${balance.toFixed(2)}`
      : `\n✅ Your account is fully cleared.`

  return (
    `🧾 *Payment Receipt — ${businessName}*\n\n` +
    `Dear *${customerName}*,\n\n` +
    `We have received your payment${method}:\n` +
    `💰 *Amount Paid:* GHS ${amount.toFixed(2)}` +
    balanceLine +
    `\n\nThank you for your business! 🙏`
  )
}

export function buildWhatsAppSaleConfirmation(params: {
  businessName: string
  customerName: string
  totalAmount: number
  paidAmount: number
  balance: number
  itemCount?: number
}): string {
  const { businessName, customerName, totalAmount, paidAmount, balance, itemCount } = params
  const items = itemCount ? `\n🛍️ *Items:* ${itemCount}` : ''
  const balanceLine =
    balance > 0
      ? `\n⚠️ *Balance owed:* GHS ${balance.toFixed(2)}`
      : `\n✅ Fully paid`

  return (
    `🛒 *Sale Confirmation — ${businessName}*\n\n` +
    `Dear *${customerName}*,\n\n` +
    `Your purchase has been recorded.` +
    items +
    `\n💵 *Total:* GHS ${totalAmount.toFixed(2)}` +
    `\n💰 *Paid:* GHS ${paidAmount.toFixed(2)}` +
    balanceLine +
    `\n\nThank you for shopping with us! 🙏`
  )
}

export function buildWhatsAppBalanceReminder(params: {
  businessName: string
  customerName: string
  balance: number
}): string {
  const { businessName, customerName, balance } = params
  return (
    `📢 *Balance Reminder — ${businessName}*\n\n` +
    `Dear *${customerName}*,\n\n` +
    `This is a friendly reminder that you have an outstanding balance of:\n\n` +
    `💳 *GHS ${balance.toFixed(2)}*\n\n` +
    `Please settle at your earliest convenience.\n\n` +
    `Thank you! 🙏`
  )
}

export function buildWhatsAppWaybillDispatch(params: {
  businessName: string
  consigneeName: string
  waybillNumber: string
  itemCount: number
  driverName?: string | null
  vehicleNumber?: string | null
  consigneeAddress: string
}): string {
  const { businessName, consigneeName, waybillNumber, itemCount, driverName, vehicleNumber, consigneeAddress } = params
  const driverLine = driverName ? `\n🚗 *Driver:* ${driverName}` : ''
  const vehicleLine = vehicleNumber ? `\n🚘 *Vehicle:* ${vehicleNumber}` : ''

  return (
    `🚚 *Delivery Dispatch — ${businessName}*\n\n` +
    `Dear *${consigneeName}*,\n\n` +
    `Your delivery is on the way!\n\n` +
    `📄 *Waybill:* ${waybillNumber}\n` +
    `📦 *Items:* ${itemCount}` +
    driverLine +
    vehicleLine +
    `\n📍 *Delivery to:* ${consigneeAddress}\n\n` +
    `Please be available to receive your goods. Thank you! 🙏`
  )
}
