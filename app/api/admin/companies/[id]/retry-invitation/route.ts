import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth/permissions"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

/**
 * POST /api/admin/companies/[id]/retry-invitation
 * 
 * Retries sending an invitation to the company admin.
 * Only accessible by superAdmin.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is superAdmin
    const roleData = await getUserRole(supabase, user.id)
    if (!roleData || roleData.role !== "superAdmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const adminClient = createAdminClient()

    // Get company
    const { data: company, error: fetchError } = await adminClient
      .from("companies")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    if (!company.adminEmail) {
      return NextResponse.json({ error: "Company has no admin email" }, { status: 400 })
    }

    // Check if there's an existing invitation that's still valid
    if (company.invitationId) {
      const { data: existingInvitation } = await adminClient
        .from("invitations")
        .select("*")
        .eq("id", company.invitationId)
        .single()

      if (existingInvitation && existingInvitation.status === "accepted") {
        return NextResponse.json({ error: "Invitation already accepted" }, { status: 400 })
      }

      // Cancel existing invitation if pending
      if (existingInvitation && existingInvitation.status === "pending") {
        await adminClient
          .from("invitations")
          .update({ status: "cancelled" })
          .eq("id", existingInvitation.id)
      }
    }

    // Create new invitation
    const invitationToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data: invitation, error: invitationError } = await adminClient
      .from("invitations")
      .insert({
        email: company.adminEmail,
        role: "administrator",
        token: invitationToken,
        status: "pending",
        invitedBy: user.id,
        invitedByRole: "superAdmin",
        companyIds: [id],
        expiresAt: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (invitationError) {
      console.error("[v0] Failed to create invitation:", invitationError)
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 })
    }

    // Send invitation email
    const { error: emailError } = await adminClient.auth.admin.inviteUserByEmail(company.adminEmail, {
      redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || "https://postar-six.vercel.app"}/auth/callback?invitation_token=${invitationToken}`,
    })

    let invitationStatus = "sent"
    let invitationError2 = null

    if (emailError) {
      console.error("[v0] Failed to send invitation email:", emailError)
      invitationStatus = "failed"
      invitationError2 = emailError.message
    }

    // Update company
    await adminClient
      .from("companies")
      .update({
        invitationStatus,
        invitationError: invitationError2,
        invitationId: invitation.id,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", id)

    await logAuditEvent({
      userId: user.id,
      action: "company.retry_invitation",
      outcome: invitationStatus === "sent" ? "success" : "failure",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: `/api/admin/companies/${id}/retry-invitation`,
      responseStatus: invitationStatus === "sent" ? 200 : 500,
      correlationId,
      details: {
        companyId: id,
        email: company.adminEmail,
        invitationId: invitation.id,
        error: invitationError2,
      },
    })

    if (emailError) {
      return NextResponse.json({
        success: false,
        error: "Failed to send invitation email",
        message: emailError.message,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Invitation sent",
      invitationId: invitation.id,
    })

  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
