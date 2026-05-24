/**
 * Admin notification email sent to ee.wilson@outlook.com
 * when a new tenant/company registers on the platform.
 */
export function onboardingNotificationHtml(data: {
  businessName: string
  ownerName: string
  ownerEmail: string
  createdAt: Date
}): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(data.createdAt)

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Company Onboarded</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:32px;">🏪</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                New Company Onboarded
              </h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">
                Business Management
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
                A new business has just signed up and completed onboarding. Here are the details:
              </p>

              <!-- Info card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#f0f4ff;border-radius:10px;border:1px solid #dbeafe;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <table width="100%" cellpadding="0" cellspacing="8">
                      <tr>
                        <td style="width:140px;color:#6b7280;font-size:13px;font-weight:600;padding:6px 0;">Business Name</td>
                        <td style="color:#111827;font-size:14px;font-weight:700;padding:6px 0;">${data.businessName}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;font-size:13px;font-weight:600;padding:6px 0;">Owner Name</td>
                        <td style="color:#111827;font-size:14px;font-weight:600;padding:6px 0;">${data.ownerName}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;font-size:13px;font-weight:600;padding:6px 0;">Owner Email</td>
                        <td style="padding:6px 0;">
                          <a href="mailto:${data.ownerEmail}" style="color:#2563eb;font-size:14px;text-decoration:none;font-weight:600;">
                            ${data.ownerEmail}
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;font-size:13px;font-weight:600;padding:6px 0;">Registered At</td>
                        <td style="color:#111827;font-size:14px;padding:6px 0;">${date}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;font-size:13px;font-weight:600;padding:6px 0;">Status</td>
                        <td style="padding:6px 0;">
                          <span style="background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px;">
                            TRIAL
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
                The account starts on a <strong>Trial</strong> plan. You can update their status from the admin panel.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                This is an automated notification from
                <strong style="color:#6b7280;">Business Management</strong>
                &middot; Developed by EYO Solutions
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

export function onboardingNotificationText(data: {
  businessName: string
  ownerName: string
  ownerEmail: string
  createdAt: Date
}): string {
  return `
New Company Onboarded

Business Name : ${data.businessName}
Owner Name    : ${data.ownerName}
Owner Email   : ${data.ownerEmail}
Registered At : ${data.createdAt.toISOString()}
Status        : TRIAL

This is an automated notification.
  `.trim()
}
