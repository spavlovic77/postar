import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { inviteUserSchema } from "@/lib/validations/user"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { getUserRole, canInviteRole, canAssignCompanies } from "@/lib/auth/permissions"
import type { UserRole } from "@/types"
import crypto from "crypto"

export async function GET(request: Request) {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { searchParams } = new URL(request.url)

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

  // Filter options
  const filterStatus = searchParams.get("status") // pending, accepted, expired, cancelled, all
  const filterScope = searchParams.get("scope") // own, all (only for superAdmin/admin with company access)

  // Build query
  let query = adminClient
    .from("invitations")
    .select("*")
    .order("createdAt", { ascending: false })

  // Status filter
  if (filterStatus && filterStatus !== "all") {
    query = query.eq("status", filterStatus)
  }

  // Scope filter for administrators
  if (actorRoleData.role === "administrator") {
    if (filterScope === "all") {
      // Get companies the admin has access to
      const { data: adminCompanies } = await adminClient
        .from("companyAssignments")
        .select("companyId")
        .eq("userId", user.id)

      const companyIds = adminCompanies?.map(c => c.companyId) || []
      
      // Get invitations for those companies OR invitations they created
      // Using containedBy for array overlap
      const { data: allInvitations } = await adminClient
        .from("invitations")
        .select("*")
        .order("createdAt", { ascending: false })

      // Filter client-side for array overlap
      const filtered = allInvitations?.filter(inv => {
        const invCompanyIds = inv.companyIds || []
        return inv.invitedBy === user.id || 
          invCompanyIds.some((id: string) => companyIds.includes(id))
      }) || []

      // Apply status filter if needed
      const statusFiltered = filterStatus && filterStatus !== "all" 
        ? filtered.filter(inv => inv.status === filterStatus)
        : filtered

      return NextResponse.json({ data: statusFiltered })
    } else {
      // Default: only own invitations
      query = query.eq("invitedBy", user.id)
    }
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

  try {
    console.log("[v0] POST /api/invitations - starting")
    
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    console.log("[v0] User:", user?.id)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get actor's role
    const actorRoleData = await getUserRole(adminClient, user.id)
    console.log("[v0] Actor role data:", actorRoleData)
    
    if (!actorRoleData || !["superAdmin", "administrator"].includes(actorRoleData.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

  const body = await request.json()
  console.log("[v0] Request body:", JSON.stringify(body))
  
  const result = inviteUserSchema.safeParse(body)

  if (!result.success) {
    console.log("[v0] Validation failed:", result.error.flatten().fieldErrors)
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  console.log("[v0] Validated data:", result.data)
  const invitedRole = result.data.role as UserRole

  // Check if actor can invite this role (hierarchy check)
  console.log("[v0] Checking canInviteRole:", actorRoleData.role, "->", invitedRole)
  if (!canInviteRole(actorRoleData.role as UserRole, invitedRole)) {
    console.log("[v0] canInviteRole DENIED")
    return NextResponse.json(
      { error: `You cannot invite users with ${invitedRole} role` },
      { status: 403 }
    )
  }
  console.log("[v0] canInviteRole ALLOWED")

  // Check if actor can assign the requested companies
  console.log("[v0] Checking canAssignCompanies for companyIds:", result.data.companyIds)
  const companyPermission = await canAssignCompanies(
    adminClient,
    user.id,
    actorRoleData.role as UserRole,
    result.data.companyIds || []
  )
  console.log("[v0] canAssignCompanies result:", companyPermission)

  if (!companyPermission.allowed) {
    return NextResponse.json(
      { error: companyPermission.reason },
      { status: 403 }
    )
  }

  // Check if user is already invited or exists
  console.log("[v0] Checking for existing invitation for email:", result.data.email)
  const { data: existingInvitation, error: existingError } = await adminClient
    .from("invitations")
    .select("id, status")
    .eq("email", result.data.email)
    .eq("status", "pending")
    .single()

  console.log("[v0] Existing invitation check:", { existingInvitation, existingError: existingError?.message })

  if (existingInvitation) {
    return NextResponse.json(
      { error: "An invitation is already pending for this email" },
      { status: 409 }
    )
  }

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  console.log("[v0] Generated invitation token:", token, "expires:", expiresAt)

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

  console.log("[v0] Invitation insert result:", { invitationId: invitation?.id, error: invError?.message })

  if (invError) {
    return NextResponse.json({ error: invError.message }, { status: 500 })
  }

  // Send invitation via Admin API (no PKCE, server-to-server)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "http://localhost:3000"
  const redirectUrl = `${baseUrl}/auth/callback?invitation_token=${token}`
  console.log("[v0] Invitation URLs - baseUrl:", baseUrl, "redirectUrl:", redirectUrl)

  // Check if user already exists in Supabase Auth
  const { data: existingUsers } = await adminClient.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === result.data.email)
  console.log("[v0] Existing user check:", { exists: !!existingUser, userId: existingUser?.id })

  if (existingUser) {
    // User already exists - send magic link via signInWithOtp
    // Note: generateLink with type "invite" fails for existing users with "email_exists"
    // signInWithOtp with shouldCreateUser: false sends a magic link to existing users
    console.log("[v0] User exists, sending magic link via signInWithOtp...")
    
    const { error: otpError } = await adminClient.auth.signInWithOtp({
      email: result.data.email,
      options: {
        shouldCreateUser: false, // User already exists
        emailRedirectTo: redirectUrl,
      },
    })

    console.log("[v0] signInWithOtp result:", { error: otpError?.message })

    if (otpError) {
      await adminClient.from("invitations").delete().eq("id", invitation.id)
      console.error("[v0] Failed to send OTP email - rolling back invitation:", otpError)
      return NextResponse.json(
        { error: "Failed to send invitation email: " + otpError.message },
        { status: 500 }
      )
    }
    
    console.log("[v0] Magic link email sent to existing user successfully")
    
  } else {
    // New user - use inviteUserByEmail
    console.log("[v0] New user, sending invitation email via inviteUserByEmail...")
    const { data: emailData, error: emailError } = await adminClient.auth.admin.inviteUserByEmail(result.data.email, {
      redirectTo: redirectUrl,
    })

    console.log("[v0] inviteUserByEmail result:", { hasData: !!emailData, error: emailError?.message })

    if (emailError) {
      await adminClient.from("invitations").delete().eq("id", invitation.id)
      console.error("[v0] Failed to send invitation email - rolling back invitation:", emailError)
      return NextResponse.json(
        { error: "Failed to send invitation email" },
        { status: 500 }
      )
    }
  }
  
  console.log("[v0] Invitation email sent successfully")

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

  console.log("[v0] Invitation created successfully:", invitation.id)
  return NextResponse.json({ data: invitation }, { status: 201 })
  } catch (err) {
    console.error("[v0] POST /api/invitations - unhandled error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
