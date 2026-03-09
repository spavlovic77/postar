/**
 * Shared helper for sending invitation emails.
 *
 * Strategy (always uses our branded email via Resend):
 * 1. New users      → generateLink(type: "invite") — creates user + returns link
 * 2. Existing users → generateLink(type: "magiclink") — returns login link
 *
 * Neither method sends an email — we always send ourselves via Resend.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendEmail, buildInvitationEmailHtml } from "@/lib/email/sendEmail"

export interface SendInvitationResult {
  success: boolean
  method: "invite" | "magiclink"
  error?: string
}

export async function sendInvitationEmail(
  adminClient: SupabaseClient,
  email: string,
  redirectUrl: string,
  logPrefix: string,
  companyName?: string
): Promise<SendInvitationResult> {
  console.log(`${logPrefix} Sending invitation to ${email}`)
  console.log(`${logPrefix} Redirect URL: ${redirectUrl}`)

  // Step 1: Try generateLink with type "invite" (creates new user if needed)
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: redirectUrl,
    },
  })

  let actionLink = inviteData?.properties?.action_link
  let method: "invite" | "magiclink" = "invite"

  if (inviteError || !actionLink) {
    // User likely already exists and is confirmed — fall back to magiclink
    console.log(`${logPrefix} generateLink(invite) failed: ${inviteError?.message}. Trying magiclink...`)

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: redirectUrl,
      },
    })

    actionLink = linkData?.properties?.action_link
    method = "magiclink"

    if (linkError || !actionLink) {
      const errorMsg = linkError?.message || "generateLink returned no action_link"
      console.error(`${logPrefix} generateLink(magiclink) FAILED for ${email}: ${errorMsg}`)
      return { success: false, method: "magiclink", error: errorMsg }
    }
  }

  console.log(`${logPrefix} generateLink(${method}) SUCCESS — sending branded email via Resend`)

  // Step 2: Send our branded email via Resend
  const isNewUser = method === "invite"
  const html = buildInvitationEmailHtml(actionLink, companyName, isNewUser)
  const emailResult = await sendEmail({
    to: email,
    subject: "Pozvánka na Postar",
    html,
  })

  if (!emailResult.success) {
    console.error(`${logPrefix} Resend send FAILED for ${email}: ${emailResult.error}`)
    return { success: false, method, error: `Email send failed: ${emailResult.error}` }
  }

  console.log(`${logPrefix} Branded email sent to ${email} via ${method}`)
  return { success: true, method }
}
