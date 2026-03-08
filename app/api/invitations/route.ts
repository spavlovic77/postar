import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { inviteUserSchema } from "@/lib/validations/user"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: userRole } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (!userRole || !["superAdmin", "administrator"].includes(userRole.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const query = supabase
    .from("invitations")
    .select("*")
    .order("createdAt", { ascending: false })

  if (userRole.role === "administrator") {
    query.eq("invitedBy", user.id)
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: userRole } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (!userRole || !["superAdmin", "administrator"].includes(userRole.role)) {
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

  // Administrators can only invite accountants
  if (userRole.role === "administrator" && result.data.role !== "accountant") {
    return NextResponse.json(
      { error: "Administrators can only invite accountants" },
      { status: 403 }
    )
  }

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: invitation, error: invError } = await supabase
    .from("invitations")
    .insert({
      email: result.data.email,
      role: result.data.role,
      invitedBy: user.id,
      token,
      expiresAt,
      status: "pending",
      companyIds: result.data.companyIds,
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
    await supabase.from("invitations").delete().eq("id", invitation.id)
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
      role: result.data.role,
    },
  })

  return NextResponse.json({ data: invitation }, { status: 201 })
}
