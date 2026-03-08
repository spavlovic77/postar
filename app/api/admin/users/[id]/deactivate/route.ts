import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: userRole } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (!userRole || userRole.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabase
    .from("userRoles")
    .update({ isActive: false })
    .eq("userId", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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
    requestPath: `/api/admin/users/${id}/deactivate`,
    responseStatus: 200,
    correlationId,
    details: { targetUserId: id },
  })

  return NextResponse.json({ message: "User deactivated" })
}
