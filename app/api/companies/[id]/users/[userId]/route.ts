import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { getUserRole, canRemoveFromCompany } from "@/lib/auth/permissions"
import type { UserRole } from "@/types"
import crypto from "crypto"

/**
 * DELETE /api/companies/[id]/users/[userId]
 * Remove a user from a company
 * Access: SuperAdmin (any), Administrator (their companies, accountants only)
 */
export async function DELETE(
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

  // Check permissions
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

  // Remove the user from the company
  const { error } = await adminClient
    .from("companyAssignments")
    .delete()
    .eq("userId", targetUserId)
    .eq("companyId", companyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  await logAuditEvent({
    userId: user.id,
    companyId,
    action: "company.user.remove",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "DELETE",
    requestPath: `/api/companies/${companyId}/users/${targetUserId}`,
    responseStatus: 200,
    correlationId,
    details: {
      targetUserId,
      targetRole: targetRoleData.role,
      actorRole: actorRoleData.role,
    },
  })

  return NextResponse.json({ message: "User removed from company" })
}
