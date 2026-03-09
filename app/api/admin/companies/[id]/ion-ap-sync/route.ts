import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { syncCompanyToIonAp } from "@/lib/ionAp/sync"

/**
 * POST /api/admin/companies/[id]/ion-ap-sync
 *
 * Manually trigger ION AP registration for a company.
 * SuperAdmin only.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Role check - superAdmin only
  const { data: role } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .eq("isActive", true)
    .single()

  if (role?.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await syncCompanyToIonAp(id)

  if (result.success) {
    return NextResponse.json({
      success: true,
      orgId: result.orgId,
      identifierId: result.identifierId,
    })
  }

  return NextResponse.json(
    { error: result.error || "ION AP sync failed" },
    { status: 502 }
  )
}
