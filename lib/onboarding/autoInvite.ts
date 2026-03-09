/**
 * Auto-invitation: sends an administrator invitation to a company's adminEmail
 * after successful ION AP company registration.
 *
 * Called from syncCompanyToIonAp (fire-and-forget).
 * Tracks status on the company record (invitationStatus, invitationError).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logAuditEventAdmin } from "@/lib/sapiSk/auditLog"
import { sendInvitationEmail } from "@/lib/auth/sendInvitationEmail"
import crypto from "crypto"

export interface AutoInviteResult {
  success: boolean
  invitationId?: string
  error?: string
}

export async function autoInviteAdministrator(companyId: string): Promise<AutoInviteResult> {
  const correlationId = crypto.randomUUID()
  const supabase = createAdminClient()

  // Fetch company
  const { data: company } = await supabase
    .from("companies")
    .select("id, dic, legalName, adminEmail, invitationStatus")
    .eq("id", companyId)
    .single()

  if (!company) {
    console.error(`[Auto Invite] Company not found: companyId=${companyId}`)
    return { success: false, error: "Company not found" }
  }

  const dic = company.dic
  console.log(`[Auto Invite] [DIC=${dic}] Starting auto-invite for companyId=${companyId}, adminEmail=${company.adminEmail}`)

  // Skip if already invited successfully
  if (company.invitationStatus === "success") {
    console.log(`[Auto Invite] [DIC=${dic}] Already invited, skipping.`)
    return { success: true }
  }

  // Skip if no email
  if (!company.adminEmail || !company.adminEmail.includes("@")) {
    const error = company.adminEmail
      ? `Invalid email format: ${company.adminEmail}`
      : "No adminEmail on company"
    console.warn(`[Auto Invite] [DIC=${dic}] ${error}`)

    await supabase
      .from("companies")
      .update({ invitationStatus: "skipped", invitationError: error })
      .eq("id", companyId)

    await logAuditEventAdmin({
      userId: null,
      companyId,
      action: "onboarding.invitation.auto.skipped",
      outcome: "failure",
      sourceIp: "system",
      userAgent: "auto-invite",
      requestMethod: "POST",
      requestPath: "/system/auto-invite",
      responseStatus: 0,
      correlationId,
      details: { dic, error, step: "auto_invitation" },
    })

    return { success: false, error }
  }

  // Mark as pending
  await supabase
    .from("companies")
    .update({ invitationStatus: "pending", invitationError: null })
    .eq("id", companyId)

  try {
    // Find a superAdmin to be the inviter
    const { data: superAdmin } = await supabase
      .from("userRoles")
      .select("userId")
      .eq("role", "superAdmin")
      .eq("isActive", true)
      .limit(1)
      .single()

    if (!superAdmin) {
      throw new Error("No active superAdmin found to attribute invitation")
    }

    // Check if invitation already exists for this email + company
    const { data: existingInvitations } = await supabase
      .from("invitations")
      .select("id, status, companyIds")
      .eq("email", company.adminEmail)
      .in("status", ["pending", "accepted"])

    const alreadyInvited = existingInvitations?.some((inv) => {
      const ids: string[] = inv.companyIds || []
      return ids.includes(companyId)
    })

    if (alreadyInvited) {
      console.log(`[Auto Invite] [DIC=${dic}] Invitation already exists for ${company.adminEmail}, marking success`)
      await supabase
        .from("companies")
        .update({ invitationStatus: "success", invitationError: null })
        .eq("id", companyId)
      return { success: true }
    }

    // Create invitation record
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: invitation, error: invError } = await supabase
      .from("invitations")
      .insert({
        email: company.adminEmail,
        role: "administrator",
        invitedBy: superAdmin.userId,
        invitedByRole: "superAdmin",
        token,
        expiresAt,
        status: "pending",
        companyIds: [companyId],
      })
      .select("id")
      .single()

    if (invError || !invitation) {
      throw new Error(`Failed to create invitation: ${invError?.message || "unknown"}`)
    }

    console.log(`[Auto Invite] [DIC=${dic}] Invitation created: id=${invitation.id}, token=${token}`)

    // Send invitation email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const redirectUrl = `${baseUrl}/auth/callback?invitation_token=${token}`

    const emailResult = await sendInvitationEmail(
      supabase,
      company.adminEmail!,
      redirectUrl,
      `[Auto Invite] [DIC=${dic}]`
    )

    if (!emailResult.success) {
      throw new Error(`Failed to send invitation email: ${emailResult.error}`)
    }

    if (emailResult.magicLink) {
      // generateLink fallback was used — email was NOT sent by Supabase
      console.log(`[Auto Invite] [DIC=${dic}] Magic link generated (email not sent). Link must be shared manually.`)
    }

    // Mark success
    await supabase
      .from("companies")
      .update({ invitationStatus: "success", invitationError: null })
      .eq("id", companyId)

    await logAuditEventAdmin({
      userId: superAdmin.userId,
      companyId,
      action: "onboarding.invitation.auto.success",
      outcome: "success",
      sourceIp: "system",
      userAgent: "auto-invite",
      requestMethod: "POST",
      requestPath: "/system/auto-invite",
      responseStatus: 200,
      correlationId,
      details: {
        dic,
        email: company.adminEmail,
        invitationId: invitation.id,
        step: "auto_invitation",
      },
    })

    return { success: true, invitationId: invitation.id }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    console.error(`[Auto Invite] [DIC=${dic}] Failed: ${errorMessage}`)

    await supabase
      .from("companies")
      .update({ invitationStatus: "failed", invitationError: errorMessage })
      .eq("id", companyId)

    await logAuditEventAdmin({
      userId: null,
      companyId,
      action: "onboarding.invitation.auto.failed",
      outcome: "failure",
      sourceIp: "system",
      userAgent: "auto-invite",
      requestMethod: "POST",
      requestPath: "/system/auto-invite",
      responseStatus: 500,
      correlationId,
      details: { dic, email: company.adminEmail, error: errorMessage, step: "auto_invitation" },
    })

    return { success: false, error: errorMessage }
  }
}
