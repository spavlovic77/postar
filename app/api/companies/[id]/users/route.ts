import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getUserRole, canRemoveFromCompany } from "@/lib/auth/permissions"
import type { UserRole } from "@/types"

/**
 * GET /api/companies/[id]/users
 * List all users (accountants) assigned to a company
 * Access: SuperAdmin (any company), Administrator (their companies only)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params
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

  // Only SuperAdmin and Administrator can view company users
  if (actorRoleData.role === "accountant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // If Administrator, verify they have access to this company
  if (actorRoleData.role === "administrator") {
    const { data: assignment } = await adminClient
      .from("companyAssignments")
      .select("id")
      .eq("userId", user.id)
      .eq("companyId", companyId)
      .single()

    if (!assignment) {
      return NextResponse.json(
        { error: "You don't have access to this company" },
        { status: 403 }
      )
    }
  }

  // Get all users assigned to this company with their roles
  const { data: assignments, error } = await adminClient
    .from("companyAssignments")
    .select(`
      id,
      userId,
      createdAt,
      assignedById
    `)
    .eq("companyId", companyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get user details and roles for each assignment
  const userIds = assignments?.map((a) => a.userId) ?? []
  
  const { data: userRoles } = await adminClient
    .from("userRoles")
    .select("userId, role, isActive")
    .in("userId", userIds)

  // Combine the data
  const users = assignments?.map((assignment) => {
    const roleData = userRoles?.find((r) => r.userId === assignment.userId)
    return {
      assignmentId: assignment.id,
      userId: assignment.userId,
      role: roleData?.role ?? "unknown",
      isActive: roleData?.isActive ?? false,
      assignedAt: assignment.createdAt,
      assignedById: assignment.assignedById,
    }
  }) ?? []

  // For Administrator, only show accountants (not other admins)
  const filteredUsers = actorRoleData.role === "administrator"
    ? users.filter((u) => u.role === "accountant")
    : users

  return NextResponse.json({ data: filteredUsers })
}
