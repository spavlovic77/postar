import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { getUserRole, canRemoveFromCompany } from "@/lib/auth/permissions"
import type { UserRole } from "@/types"
import crypto from "crypto"

/**
 * POST /api/companies/[id]/users/[userId]/reset-password
 * Reset password for a user in a company (sends magic link)
 * Access: SuperAdmin (any), Administrator (their companies, accountants only)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: companyId, userId: targetUserId } = await params
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
  if (!actorRoleData) {
    return NextResponse.json({ error: "User role not found" }, { status: 403 })
  }

  // Get target user's role
  const targetRoleData = await getUserRole(adminClient, targetUserId)
  if (!targetRoleData) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 })
  }

  // Check permissions (reuse canRemoveFromCompany logic for company-scoped actions)
  const permission = await canRemoveFromCompany(
    adminClient,
    user.id,
    actorRoleData.role as UserRole,
    targetUserId,
    targetRoleData.role as UserRole,
    companyId
  )

  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 403 })
  }

  // Get email from request body
  const body = await request.json().catch(() => ({}))
  const email = body.email

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 })
  }

  // Send password reset link via magic link
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "http://localhost:3000"}/auth/callback`,
    },
  })

  if (otpError) {
    return NextResponse.json(
      { error: "Failed to send reset link" },
      { status: 500 }
    )
  }

  // Audit log
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  await logAuditEvent({
    userId: user.id,
    companyId,
    action: "company.user.reset-password",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: `/api/companies/${companyId}/users/${targetUserId}/reset-password`,
    responseStatus: 200,
    correlationId,
    details: {
      targetUserId,
      targetRole: targetRoleData.role,
      actorRole: actorRoleData.role,
    },
  })

  return NextResponse.json({ message: "Password reset link sent" })
}
