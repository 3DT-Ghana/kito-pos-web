import nodemailer from 'nodemailer'

/**
 * Nodemailer transporter
 * Uses SMTP credentials from environment variables.
 * For development / testing use Mailtrap or Gmail App Password.
 *
 * Required env vars:
 *   SMTP_HOST      - e.g. smtp.gmail.com  or  smtp.mailtrap.io
 *   SMTP_PORT      - e.g. 587
 *   SMTP_USER      - your email / mailtrap username
 *   SMTP_PASS      - app password / mailtrap password
 *   SMTP_FROM      - "My Business <noreply@yourdomain.com>"
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',   // true only for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export interface MailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

/**
 * Send an email. Silently catches errors so a mail failure
 * never breaks the calling API response.
 */
export async function sendMail(opts: MailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Business Management <noreply@example.com>',
      to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
    return true
  } catch (err) {
    // Log but never throw — email failure must not break the API
    console.error('[mailer] Failed to send email:', err)
    return false
  }
}
