import { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "@/types"

/**
 * Role hierarchy - higher number = more privileges
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  superAdmin: 3,
  administrator: 2,
  accountant: 1,
}

/**
 * Check if actor's role is higher than target's role
 */
export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole]
}

/**
 * Check if actor can invite a user with the given role
 * - SuperAdmin can invite any role
 * - Administrator can only invite accountants
 * - Accountant cannot invite anyone
 */
export function canInviteRole(actorRole: UserRole, invitedRole: UserRole): boolean {
  if (actorRole === "superAdmin") return true
  if (actorRole === "administrator" && invitedRole === "accountant") return true
  return false
}

/**
 * Get shared companies between two users
 */
export async function getSharedCompanies(
  supabase: SupabaseClient,
  actorUserId: string,
  targetUserId: string
): Promise<string[]> {
  const { data: actorAssignments } = await supabase
    .from("companyAssignments")
    .select("companyId")
    .eq("userId", actorUserId)

  const { data: targetAssignments } = await supabase
    .from("companyAssignments")
    .select("companyId")
    .eq("userId", targetUserId)

  if (!actorAssignments || !targetAssignments) return []

  const actorCompanyIds = new Set(actorAssignments.map((a) => a.companyId))
  return targetAssignments
    .filter((t) => actorCompanyIds.has(t.companyId))
    .map((t) => t.companyId)
}

/**
 * Check if actor can manage a specific user
 * @param action - The action being performed
 * @returns { allowed: boolean, reason?: string }
 */
export async function canManageUser(
  supabase: SupabaseClient,
  actorId: string,
  actorRole: UserRole,
  targetUserId: string,
  targetRole: UserRole,
  action: "deactivate" | "reactivate" | "resetPassword" | "removeFromCompany"
): Promise<{ allowed: boolean; reason?: string }> {
  // Can't manage self for deactivation (use request-deactivation instead)
  if (actorId === targetUserId && action === "deactivate") {
    return { allowed: false, reason: "Cannot deactivate yourself. Use request deactivation instead." }
  }

  // Can't manage users at same or higher level
  if (!canManageRole(actorRole, targetRole)) {
    return { allowed: false, reason: `Cannot manage users with ${targetRole} role` }
  }

  // SuperAdmin can manage anyone below them
  if (actorRole === "superAdmin") {
    return { allowed: true }
  }

  // Administrator can only manage accountants in their companies
  if (actorRole === "administrator") {
    // Administrators can only remove from company, not fully deactivate
    if (action === "deactivate" || action === "reactivate") {
      return { allowed: false, reason: "Administrators cannot deactivate users. Remove them from your company instead." }
    }

    const sharedCompanies = await getSharedCompanies(supabase, actorId, targetUserId)
    if (sharedCompanies.length === 0) {
      return { allowed: false, reason: "User is not in any of your companies" }
    }

    return { allowed: true }
  }

  return { allowed: false, reason: "Insufficient permissions" }
}

/**
 * Check if actor can remove a user from a specific company
 */
export async function canRemoveFromCompany(
  supabase: SupabaseClient,
  actorId: string,
  actorRole: UserRole,
  targetUserId: string,
  targetRole: UserRole,
  companyId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // SuperAdmin can remove anyone from any company
  if (actorRole === "superAdmin") {
    return { allowed: true }
  }

  // Can't manage users at same or higher level
  if (!canManageRole(actorRole, targetRole)) {
    return { allowed: false, reason: `Cannot manage users with ${targetRole} role` }
  }

  // Administrator must be assigned to the company
  if (actorRole === "administrator") {
    const { data: actorAssignment } = await supabase
      .from("companyAssignments")
      .select("id")
      .eq("userId", actorId)
      .eq("companyId", companyId)
      .single()

    if (!actorAssignment) {
      return { allowed: false, reason: "You are not assigned to this company" }
    }

    return { allowed: true }
  }

  return { allowed: false, reason: "Insufficient permissions" }
}

/**
 * Check if this is the last superAdmin (prevent self-lockout)
 */
export async function isLastSuperAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("userRoles")
    .select("userId")
    .eq("role", "superAdmin")
    .eq("isActive", true)

  if (error || !data) return true // Assume last if query fails (safety)
  
  // If only one superAdmin exists and it's this user, they're the last one
  if (data.length === 1 && data[0].userId === userId) {
    return true
  }

  return false
}

/**
 * Get user's role from database
 */
export async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<{ role: UserRole; isActive: boolean } | null> {
  const { data, error } = await supabase
    .from("userRoles")
    .select("role, isActive")
    .eq("userId", userId)
    .single()

  if (error || !data) return null
  return { role: data.role as UserRole, isActive: data.isActive }
}

/**
 * Validate company access for invitation
 * - SuperAdmin can assign any company
 * - Administrator can only assign companies they're assigned to
 */
export async function canAssignCompanies(
  supabase: SupabaseClient,
  actorId: string,
  actorRole: UserRole,
  companyIds: string[]
): Promise<{ allowed: boolean; reason?: string }> {
  if (companyIds.length === 0) {
    return { allowed: true } // No companies to assign
  }

  // SuperAdmin can assign any company
  if (actorRole === "superAdmin") {
    return { allowed: true }
  }

  // Administrator can only assign their own companies
  if (actorRole === "administrator") {
    const { data: assignments } = await supabase
      .from("companyAssignments")
      .select("companyId")
      .eq("userId", actorId)

    if (!assignments) {
      return { allowed: false, reason: "Could not verify company access" }
    }

    const actorCompanyIds = new Set(assignments.map((a) => a.companyId))
    const invalidCompanies = companyIds.filter((id) => !actorCompanyIds.has(id))

    if (invalidCompanies.length > 0) {
      return { allowed: false, reason: "You can only assign companies you have access to" }
    }

    return { allowed: true }
  }

  return { allowed: false, reason: "Insufficient permissions" }
}
