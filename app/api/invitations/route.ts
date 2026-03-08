import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { inviteUserSchema } from "@/lib/validations/user"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { getUserRole, canInviteRole, canAssignCompanies } from "@/lib/auth/permissions"
import type { UserRole } from "@/types"
import crypto from "crypto"

export async function GET() {
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

  // SuperAdmin sees all invitations, Administrator sees only their own
  let query = adminClient
    .from("invitations")
    .select("*")
    .order("createdAt", { ascending: false })

  if (actorRoleData.role === "administrator") {
    query = query.eq("invitedBy", user.id)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get actor's role
  const actorRoleData = await getUserRole(adminClient, user.id)
  if (!actorRoleData || !["superAdmin", "administrator"].includes(actorRoleData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const result = inviteUserSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const invitedRole = result.data.role as UserRole

  // Check if actor can invite this role (hierarchy check)
  if (!canInviteRole(actorRoleData.role as UserRole, invitedRole)) {
    return NextResponse.json(
      { error: `You cannot invite users with ${invitedRole} role` },
      { status: 403 }
    )
  }

  // Check if actor can assign the requested companies
  const companyPermission = await canAssignCompanies(
    adminClient,
    user.id,
    actorRoleData.role as UserRole,
    result.data.companyIds || []
  )

  if (!companyPermission.allowed) {
    return NextResponse.json(
      { error: companyPermission.reason },
      { status: 403 }
    )
  }

  // Check if user is already invited or exists
  const { data: existingInvitation } = await adminClient
    .from("invitations")
    .select("id, status")
    .eq("email", result.data.email)
    .eq("status", "pending")
    .single()

  if (existingInvitation) {
    return NextResponse.json(
      { error: "An invitation is already pending for this email" },
      { status: 409 }
    )
  }

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: invitation, error: invError } = await adminClient
    .from("invitations")
    .insert({
      email: result.data.email,
      role: result.data.role,
      invitedBy: user.id,
      invitedByRole: actorRoleData.role, // Track who invited
      token,
      expiresAt,
      status: "pending",
      companyIds: result.data.companyIds || [],
    })
    .select()
    .single()

  if (invError) {
    return NextResponse.json({ error: invError.message }, { status: 500 })
  }

  // Send magic link via Supabase Auth
  const redirectUrl = `${request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL}/auth/callback?invitation_token=${token}`

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: result.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectUrl,
    },
  })

  if (otpError) {
    // Rollback invitation if OTP fails
    await adminClient.from("invitations").delete().eq("id", invitation.id)
    return NextResponse.json(
      { error: "Failed to send invitation email" },
      { status: 500 }
    )
  }

  await logAuditEvent({
    userId: user.id,
    action: "invitation.create",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: "/api/invitations",
    responseStatus: 201,
    correlationId,
    details: {
      invitationId: invitation.id,
      email: result.data.email,
      invitedRole: result.data.role,
      actorRole: actorRoleData.role,
      companyIds: result.data.companyIds,
    },
  })

  return NextResponse.json({ data: invitation }, { status: 201 })
}
