import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { syncUserToIonAp } from "@/lib/ionAp/sync"

/**
 * POST /api/admin/assignments/[id]/ion-ap-user-sync
 *
 * Manually trigger ION AP user creation for a company assignment.
 * Resets ionApUserStatus to pending before sync so failed assignments can be retried.
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

  // Reset status so sync doesn't skip — allows retry after failure
  const adminClient = createAdminClient()
  await adminClient
    .from("companyAssignments")
    .update({
      ionApUserStatus: "pending",
      ionApUserError: null,
    })
    .eq("id", id)

  console.log(`[ION AP User Sync] Manual retry triggered for assignment=${id} by user=${user.id}`)

  const result = await syncUserToIonAp(id)

  if (result.success) {
    return NextResponse.json({
      success: true,
      userId: result.userId,
      authToken: result.authToken ? "(present)" : null,
    })
  }

  return NextResponse.json(
    { error: result.error || "ION AP user sync failed" },
    { status: 502 }
  )
}
