import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Use admin client to check role (bypasses RLS)
  const { data: userRole } = await adminClient
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (!userRole || userRole.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Get all user roles
  const { data: roles, error: rolesError } = await adminClient
    .from("userRoles")
    .select("*")
    .order("createdAt", { ascending: false })

  if (rolesError) {
    return NextResponse.json({ error: rolesError.message }, { status: 500 })
  }

  // Get all company assignments with company details
  const { data: assignments } = await adminClient
    .from("companyAssignments")
    .select("userId, companyId")

  const { data: companies } = await adminClient
    .from("companies")
    .select("id, name, dic")

  // Build a map of userId to companies
  const companyMap = new Map(companies?.map(c => [c.id, c]) || [])
  const userCompanies = new Map<string, Array<{ id: string; name: string; dic: string }>>()
  
  for (const assignment of assignments || []) {
    const company = companyMap.get(assignment.companyId)
    if (company) {
      const existing = userCompanies.get(assignment.userId) || []
      existing.push(company)
      userCompanies.set(assignment.userId, existing)
    }
  }

  // Combine roles with company assignments
  const data = roles?.map(role => ({
    ...role,
    companies: userCompanies.get(role.userId) || []
  }))

  return NextResponse.json({ data })
}
