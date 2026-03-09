/**
 * Send email via Resend HTTP API.
 *
 * Required env vars:
 *   RESEND_API_KEY  - Resend API key (re_...)
 *   EMAIL_FROM      - Sender address, e.g. "Postar <noreply@yourdomain.com>"
 *                     Must be a verified domain in Resend, or use "onboarding@resend.dev" for testing.
 */

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || "Postar <onboarding@resend.dev>"

  if (!apiKey) {
    console.error("[Email] RESEND_API_KEY not configured")
    return { success: false, error: "Email service not configured" }
  }

  console.log(`[Email] Sending via Resend to ${options.to}, from=${from}`)

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      const errorMsg = data?.message || data?.error || JSON.stringify(data)
      console.error(`[Email] Resend API error (${res.status}): ${errorMsg}`)
      return { success: false, error: errorMsg }
    }

    console.log(`[Email] Sent to ${options.to}, id=${data.id}`)
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error(`[Email] Failed to send to ${options.to}: ${message}`)
    return { success: false, error: message }
  }
}

/**
 * Build the HTML email body for an invitation.
 * Differentiates between new users (set password) and existing users (magic link login).
 */
export function buildInvitationEmailHtml(
  magicLink: string,
  companyName?: string,
  isNewUser?: boolean
): string {
  const companyLine = companyName
    ? `<p>Boli ste pozvaní ako administrátor spoločnosti <strong>${companyName}</strong> na platformu Postar.</p>`
    : `<p>Boli ste pozvaní na platformu Postar.</p>`

  const buttonText = isNewUser ? "Vytvoriť účet" : "Prihlásiť sa"
  const instruction = isNewUser
    ? `<p>Pre vytvorenie účtu a nastavenie hesla kliknite na odkaz nižšie:</p>`
    : `<p>Pre prihlásenie kliknite na odkaz nižšie:</p>`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1a1a1a;">Pozvánka na Postar</h2>
  ${companyLine}
  ${instruction}
  <p style="margin: 24px 0;">
    <a href="${magicLink}"
       style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
      ${buttonText}
    </a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">Tento odkaz je platný 24 hodín. Ak ste o pozvánku nežiadali, tento e-mail ignorujte.</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="color: #9ca3af; font-size: 12px;">Postar — SAPI SK Peppol Platform</p>
</body>
</html>`
}
