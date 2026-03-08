import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  const body = await request.json()
  const action = body.action as "approve" | "reject"

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  const status = action === "approve" ? "approved" : "rejected"

  const { data: reqData, error } = await adminClient
    .from("accountDeactivationRequests")
    .update({
      status,
      processedBy: user.id,
      processedAt: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If approved, deactivate the user
  if (action === "approve" && reqData) {
    await adminClient
      .from("userRoles")
      .update({ isActive: false })
      .eq("userId", reqData.userId)
  }

  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  await logAuditEvent({
    userId: user.id,
    action: `deactivation-request.${action}`,
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "PUT",
    requestPath: `/api/admin/deactivation-requests/${id}`,
    responseStatus: 200,
    correlationId,
    details: { requestId: id, action, targetUserId: reqData?.userId },
  })

  return NextResponse.json({ data: reqData })
}
