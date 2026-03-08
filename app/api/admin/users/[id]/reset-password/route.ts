import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  if (!userRole || userRole.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Get the target user's email from userRoles join
  const { data: targetRole } = await supabase
    .from("userRoles")
    .select("userId")
    .eq("userId", id)
    .single()

  if (!targetRole) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // We need the admin Supabase client to get user email
  // For now, use signInWithOtp which works with email
  // The target user's email is stored in auth.users
  const body = await request.json().catch(() => ({}))
  const email = body.email

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 })
  }

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (otpError) {
    return NextResponse.json(
      { error: "Failed to send reset link" },
      { status: 500 }
    )
  }

  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  await logAuditEvent({
    userId: user.id,
    action: "user.reset-password",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: `/api/admin/users/${id}/reset-password`,
    responseStatus: 200,
    correlationId,
    details: { targetUserId: id },
  })

  return NextResponse.json({ message: "Password reset link sent" })
}
