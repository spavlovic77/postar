import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

/**
 * GET /api/admin/onboarding
 *
 * Returns onboarding issues: companies with failed steps and user assignments with failed ION AP sync.
 * SuperAdmin only.
 */
export async function GET() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: role } = await adminClient
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (!role || role.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Fetch companies with any issues (failed ION AP, failed/skipped invitation, or pending states)
  const { data: companies } = await adminClient
    .from("companies")
    .select("id, dic, legalName, adminEmail, status, ionApStatus, ionApError, ionApOrgId, invitationStatus, invitationError, createdAt")
    .order("createdAt", { ascending: false })

  // Fetch failed/pending ION AP user assignments
  const { data: failedAssignments } = await adminClient
    .from("companyAssignments")
    .select("id, userId, companyId, ionApUserId, ionApUserStatus, ionApUserError")
    .in("ionApUserStatus", ["failed", "pending"])

  // Fetch user emails for failed assignments
  const userIds = [...new Set(failedAssignments?.map(a => a.userId) || [])]
  const userEmails: Record<string, string> = {}
  for (const uid of userIds) {
    const { data: { user: u } } = await adminClient.auth.admin.getUserById(uid)
    if (u?.email) userEmails[uid] = u.email
  }

  // Fetch company names for assignments
  const companyMap: Record<string, { dic: string; legalName: string | null }> = {}
  for (const c of companies || []) {
    companyMap[c.id] = { dic: c.dic, legalName: c.legalName }
  }

  // Build enriched assignments
  const enrichedAssignments = (failedAssignments || []).map(a => ({
    ...a,
    userEmail: userEmails[a.userId] || null,
    companyDic: companyMap[a.companyId]?.dic || null,
    companyName: companyMap[a.companyId]?.legalName || null,
  }))

  // Filter companies that have issues
  const issues = (companies || []).filter(c =>
    c.ionApStatus === "failed" ||
    c.invitationStatus === "failed" ||
    c.invitationStatus === "skipped" ||
    (c.ionApStatus === "success" && !c.invitationStatus)
  )

  return NextResponse.json({
    companies: issues,
    allCompanies: companies,
    failedUserAssignments: enrichedAssignments,
  })
}
