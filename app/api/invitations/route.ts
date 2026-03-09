import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { inviteUserSchema } from "@/lib/validations/user"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { getUserRole, canInviteRole, canAssignCompanies } from "@/lib/auth/permissions"
import { checkRateLimit, RATE_LIMITS, getClientIP, rateLimitHeaders } from "@/lib/rate-limit"
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
  const filterStatus = searchParams.get("status")
  const filterScope = searchParams.get("scope")

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
      const { data: adminCompanies } = await adminClient
        .from("companyAssignments")
        .select("companyId")
        .eq("userId", user.id)

      const companyIds = adminCompanies?.map(c => c.companyId) || []
      
      const { data: allInvitations } = await adminClient
        .from("invitations")
        .select("*")
        .order("createdAt", { ascending: false })

      const filtered = allInvitations?.filter(inv => {
        const invCompanyIds = inv.companyIds || []
        return inv.invitedBy === user.id || 
          invCompanyIds.some((id: string) => companyIds.includes(id))
      }) || []

      const statusFiltered = filterStatus && filterStatus !== "all" 
        ? filtered.filter(inv => inv.status === filterStatus)
        : filtered

      return NextResponse.json({ data: statusFiltered })
    } else {
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
  const ip = getClientIP(request)
  const userAgent = request.headers.get("user-agent") ?? ""

  // Rate limiting
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMITS.invitation)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Príliš veľa pokusov. Skúste to neskôr." },
      { status: 429, headers: rateLimitHeaders(rateLimitResult) }
    )
  }

  try {
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
        invitedByRole: actorRoleData.role,
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

    // Send invitation via Admin API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "http://localhost:3000"
    const redirectUrl = `${baseUrl}/auth/callback?invitation_token=${token}`

    // Check if user already exists in Supabase Auth
    const { data: existingUsers } = await adminClient.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === result.data.email)

    if (existingUser) {
      // User already exists - send magic link via signInWithOtp
      const { error: otpError } = await adminClient.auth.signInWithOtp({
        email: result.data.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectUrl,
        },
      })

      if (otpError) {
        await adminClient.from("invitations").delete().eq("id", invitation.id)
        return NextResponse.json(
          { error: "Failed to send invitation email: " + otpError.message },
          { status: 500 }
        )
      }
    } else {
      // New user - use inviteUserByEmail
      const { error: emailError } = await adminClient.auth.admin.inviteUserByEmail(result.data.email, {
        redirectTo: redirectUrl,
      })

      if (emailError) {
        await adminClient.from("invitations").delete().eq("id", invitation.id)
        return NextResponse.json(
          { error: "Failed to send invitation email" },
          { status: 500 }
        )
      }
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
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
