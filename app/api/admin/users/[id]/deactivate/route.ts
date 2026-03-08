import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { canManageUser, getUserRole, isLastSuperAdmin } from "@/lib/auth/permissions"
import type { UserRole } from "@/types"
import crypto from "crypto"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await params
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

  // Only SuperAdmin can deactivate users
  if (actorRoleData.role !== "superAdmin") {
    return NextResponse.json(
      { error: "Only SuperAdmin can deactivate users" },
      { status: 403 }
    )
  }

  // Get target user's role
  const targetRoleData = await getUserRole(adminClient, targetUserId)
  if (!targetRoleData) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 })
  }

  // Check if this is the last superAdmin
  if (targetRoleData.role === "superAdmin") {
    const isLast = await isLastSuperAdmin(adminClient, targetUserId)
    if (isLast) {
      return NextResponse.json(
        { error: "Cannot deactivate the last SuperAdmin" },
        { status: 400 }
      )
    }
  }

  // Check hierarchy permissions
  const permission = await canManageUser(
    adminClient,
    user.id,
    actorRoleData.role as UserRole,
    targetUserId,
    targetRoleData.role as UserRole,
    "deactivate"
  )

  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 403 })
  }

  // Deactivate the user
  const { error } = await adminClient
    .from("userRoles")
    .update({ isActive: false })
    .eq("userId", targetUserId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  await logAuditEvent({
    userId: user.id,
    action: "user.deactivate",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "PUT",
    requestPath: `/api/admin/users/${targetUserId}/deactivate`,
    responseStatus: 200,
    correlationId,
    details: { targetUserId, targetRole: targetRoleData.role },
  })

  return NextResponse.json({ message: "User deactivated successfully" })
}
