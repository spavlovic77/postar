/**
 * Send email via SMTP using nodemailer.
 *
 * Uses the same SMTP credentials configured in Supabase Dashboard.
 * Required env vars:
 *   SMTP_HOST     - e.g. smtp.resend.com, smtp.sendgrid.net
 *   SMTP_PORT     - e.g. 465 (SSL) or 587 (TLS)
 *   SMTP_USER     - SMTP username
 *   SMTP_PASS     - SMTP password / API key
 *   SMTP_FROM     - Sender address, e.g. "Postar <noreply@yourdomain.com>"
 */

import nodemailer from "nodemailer"

// Lazy-init transporter so env vars are available at runtime
let _transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    const host = process.env.SMTP_HOST
    const port = Number(process.env.SMTP_PORT || 587)
    const secure = port === 465

    console.log(`[Email] Creating SMTP transporter: host=${host}, port=${port}, secure=${secure}, user=${process.env.SMTP_USER ? process.env.SMTP_USER.substring(0, 3) + "***" : "NOT SET"}`)

    _transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }
  return _transporter
}

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const from = process.env.SMTP_FROM || "Postar <noreply@postar.sk>"

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("[Email] SMTP not configured — missing SMTP_HOST, SMTP_USER, or SMTP_PASS env vars")
    return { success: false, error: "SMTP not configured" }
  }

  try {
    const transporter = getTransporter()
    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    })

    console.log(`[Email] Sent to ${options.to}, messageId=${info.messageId}`)
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error(`[Email] Failed to send to ${options.to}: ${message}`)
    // Reset transporter on failure so next attempt creates a fresh connection
    _transporter = null
    return { success: false, error: message }
  }
}

/**
 * Build the HTML email body for an invitation magic link.
 */
export function buildInvitationEmailHtml(magicLink: string, companyName?: string): string {
  const companyLine = companyName
    ? `<p>Boli ste pozvaní ako administrátor spoločnosti <strong>${companyName}</strong> na platformu Postar.</p>`
    : `<p>Boli ste pozvaní na platformu Postar.</p>`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1a1a1a;">Pozvánka na Postar</h2>
  ${companyLine}
  <p>Pre prihlásenie kliknite na odkaz nižšie:</p>
  <p style="margin: 24px 0;">
    <a href="${magicLink}"
       style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
      Prihlásiť sa
    </a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">Tento odkaz je platný 24 hodín. Ak ste o pozvánku nežiadali, tento e-mail ignorujte.</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="color: #9ca3af; font-size: 12px;">Postar — SAPI SK Peppol Platform</p>
</body>
</html>`
}
