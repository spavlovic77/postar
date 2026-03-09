import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { syncUserToIonAp } from "@/lib/ionAp/sync"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

/**
 * POST /api/admin/assignments/[id]/ion-ap-user-sync
 *
 * Manually trigger ION AP user creation for a company assignment.
 * Resets ionApUserStatus to pending before sync so failed assignments can be retried.
 * SuperAdmin only.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""
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

  // Fetch assignment + company DIC for audit correlation
  const adminClient = createAdminClient()
  const { data: assignment } = await adminClient
    .from("companyAssignments")
    .select("companyId, userId")
    .eq("id", id)
    .single()

  let dic: string | null = null
  if (assignment) {
    const { data: company } = await adminClient
      .from("companies")
      .select("dic")
      .eq("id", assignment.companyId)
      .single()
    dic = company?.dic || null
  }

  // Reset status so sync doesn't skip — allows retry after failure
  await adminClient
    .from("companyAssignments")
    .update({
      ionApUserStatus: "pending",
      ionApUserError: null,
    })
    .eq("id", id)

  console.log(`[ION AP User Sync] [DIC=${dic}] Manual retry triggered for assignment=${id} by user=${user.id}, correlationId=${correlationId}`)

  // Audit: manual retry
  await logAuditEvent({
    userId: user.id,
    companyId: assignment?.companyId,
    action: "onboarding.ionap.user.retry",
    outcome: "pending",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: `/api/admin/assignments/${id}/ion-ap-user-sync`,
    responseStatus: 0,
    correlationId,
    details: { dic, assignmentId: id, targetUserId: assignment?.userId, step: "ionap_user_manual_retry" },
  })

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
