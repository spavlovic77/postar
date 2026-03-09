/**
 * Shared helper for sending invitation emails via Supabase Admin API.
 *
 * Strategy:
 * 1. Always try inviteUserByEmail first — works for new users and
 *    unconfirmed existing users (re-sends the invite).
 * 2. If it fails (confirmed existing user), fall back to generateLink
 *    (type: magiclink) to get the action URL. generateLink does NOT
 *    send email, so we return the link for the caller to handle
 *    (e.g., store it, show it to superAdmin).
 *
 * NOTE: signInWithOtp does NOT work on the service-role client
 *       (returns unexpected_failure), so we avoid it entirely.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface SendInvitationResult {
  success: boolean
  method: "inviteUserByEmail" | "generateLink"
  /** Magic link URL — only set when generateLink fallback is used (email NOT sent) */
  magicLink?: string
  error?: string
}

export async function sendInvitationEmail(
  adminClient: SupabaseClient,
  email: string,
  redirectUrl: string,
  logPrefix: string
): Promise<SendInvitationResult> {
  // Step 1: Try inviteUserByEmail (works for new users + unconfirmed existing)
  console.log(`${logPrefix} Attempting inviteUserByEmail for ${email}`)
  console.log(`${logPrefix} Redirect URL: ${redirectUrl}`)

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectUrl,
  })

  console.log(`${logPrefix} inviteUserByEmail response:`, JSON.stringify({
    data: inviteData?.user ? { id: inviteData.user.id, email: inviteData.user.email } : null,
    error: inviteError ? { message: inviteError.message, status: inviteError.status } : null,
  }))

  if (!inviteError) {
    console.log(`${logPrefix} inviteUserByEmail SUCCESS — email sent to ${email}`)
    return { success: true, method: "inviteUserByEmail" }
  }

  // Step 2: inviteUserByEmail failed (likely "already registered" for confirmed user)
  // Fall back to generateLink to get magic link URL
  console.warn(`${logPrefix} inviteUserByEmail failed: ${inviteError.message}. Falling back to generateLink...`)

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: redirectUrl,
    },
  })

  const actionLink = linkData?.properties?.action_link

  console.log(`${logPrefix} generateLink response:`, JSON.stringify({
    data: actionLink ? { action_link: "***generated***", hashed_token: linkData?.properties?.hashed_token ? "***present***" : "missing" } : null,
    error: linkError ? { message: linkError.message, status: linkError.status } : null,
  }))

  if (linkError || !actionLink) {
    const errorMsg = linkError?.message || "generateLink returned no action_link"
    console.error(`${logPrefix} generateLink FAILED for ${email}: ${errorMsg}`)
    return { success: false, method: "generateLink", error: errorMsg }
  }

  // generateLink succeeded — link is available but email was NOT sent
  console.log(`${logPrefix} generateLink SUCCESS for ${email} — magic link generated (email NOT sent by Supabase, link available for manual sharing)`)

  return { success: true, method: "generateLink", magicLink: actionLink }
}
