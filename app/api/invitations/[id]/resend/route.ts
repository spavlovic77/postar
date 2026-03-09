import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth/permissions"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const actorRoleData = await getUserRole(adminClient, user.id)
  if (!actorRoleData || !["superAdmin", "administrator"].includes(actorRoleData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Get invitation
  const { data: invitation, error: invError } = await adminClient
    .from("invitations")
    .select("*")
    .eq("id", id)
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
  }

  // Administrator can only resend their own invitations
  if (actorRoleData.role === "administrator" && invitation.invitedBy !== user.id) {
    return NextResponse.json({ error: "You can only resend your own invitations" }, { status: 403 })
  }

  // Can only resend pending or expired invitations
  if (!["pending", "expired"].includes(invitation.status)) {
    return NextResponse.json(
      { error: "Can only resend pending or expired invitations" },
      { status: 400 }
    )
  }

  // Generate new token and extend expiry
  const newToken = crypto.randomUUID()
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Update invitation with new token and expiry
  const { error: updateError } = await adminClient
    .from("invitations")
    .update({
      token: newToken,
      expiresAt: newExpiresAt,
      status: "pending",
    })
    .eq("id", id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Send the invitation email
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "http://localhost:3000"
  const redirectUrl = `${baseUrl}/auth/callback?invitation_token=${newToken}`

  // Check if user already exists in Supabase Auth
  const { data: existingUsers } = await adminClient.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === invitation.email)

  console.log(`[Invitation Resend] User lookup for ${invitation.email}: existingUser=${existingUser ? `yes (id=${existingUser.id})` : "no"}, method=${existingUser ? "signInWithOtp" : "inviteUserByEmail"}`)
  console.log(`[Invitation Resend] Redirect URL: ${redirectUrl}`)

  if (existingUser) {
    // User exists - send magic link
    const { data: otpData, error: otpError } = await adminClient.auth.signInWithOtp({
      email: invitation.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectUrl,
      },
    })

    console.log(`[Invitation Resend] signInWithOtp response:`, JSON.stringify({ data: otpData, error: otpError }))

    if (otpError) {
      console.error(`[Invitation Resend] signInWithOtp FAILED for ${invitation.email}:`, otpError.message)
      return NextResponse.json(
        { error: "Failed to send invitation email: " + otpError.message },
        { status: 500 }
      )
    }
  } else {
    // New user - send invite
    const { data: inviteData, error: emailError } = await adminClient.auth.admin.inviteUserByEmail(invitation.email, {
      redirectTo: redirectUrl,
    })

    console.log(`[Invitation Resend] inviteUserByEmail response:`, JSON.stringify({ data: inviteData, error: emailError }))

    if (emailError) {
      console.error(`[Invitation Resend] inviteUserByEmail FAILED for ${invitation.email}:`, emailError.message)
      return NextResponse.json(
        { error: "Failed to send invitation email" },
        { status: 500 }
      )
    }
  }

  console.log(`[Invitation Resend] Email sent successfully to ${invitation.email}, invitationId=${id}`)

  // Log audit event
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""
  
  await logAuditEvent({
    userId: user.id,
    action: "invitation.resend",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: `/api/invitations/${id}/resend`,
    responseStatus: 200,
    correlationId: crypto.randomUUID(),
    details: {
      invitationId: id,
      email: invitation.email,
      actorRole: actorRoleData.role,
    },
  })

  return NextResponse.json({ success: true, message: "Invitation resent" })
}
