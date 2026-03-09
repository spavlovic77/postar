import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { autoInviteAdministrator } from "@/lib/onboarding/autoInvite"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

/**
 * POST /api/admin/onboarding/[companyId]/invite
 *
 * Manually send/resend administrator invitation for a company.
 * Allows superAdmin to correct adminEmail before sending.
 * SuperAdmin only.
 *
 * Body: { adminEmail?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: role } = await adminClient
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (!role || role.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Parse optional body to update email
  let body: { adminEmail?: string } = {}
  try {
    body = await request.json()
  } catch {
    // No body is fine
  }

  // If email provided, update company first
  if (body.adminEmail) {
    const { error: updateError } = await adminClient
      .from("companies")
      .update({
        adminEmail: body.adminEmail,
        invitationStatus: null,
        invitationError: null,
      })
      .eq("id", companyId)

    if (updateError) {
      return NextResponse.json({ error: "Failed to update email" }, { status: 500 })
    }

    console.log(`[Manual Invite] Updated adminEmail for company=${companyId} to ${body.adminEmail}`)
  } else {
    // Reset invitation status for retry
    await adminClient
      .from("companies")
      .update({ invitationStatus: null, invitationError: null })
      .eq("id", companyId)
  }

  // Fetch company DIC for audit
  const { data: company } = await adminClient
    .from("companies")
    .select("dic, adminEmail")
    .eq("id", companyId)
    .single()

  await logAuditEvent({
    userId: user.id,
    companyId,
    action: "onboarding.invitation.manual.retry",
    outcome: "pending",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: `/api/admin/onboarding/${companyId}/invite`,
    responseStatus: 0,
    correlationId,
    details: {
      dic: company?.dic,
      email: body.adminEmail || company?.adminEmail,
      step: "invitation_manual_retry",
    },
  })

  // Run the auto-invite (synchronously so we can return the result)
  const result = await autoInviteAdministrator(companyId)

  if (result.success) {
    return NextResponse.json({
      success: true,
      invitationId: result.invitationId,
    })
  }

  return NextResponse.json(
    { error: result.error || "Failed to send invitation" },
    { status: 500 }
  )
}
