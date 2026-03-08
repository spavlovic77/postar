import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

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

  if (!userRole || !["superAdmin", "administrator"].includes(userRole.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: invitation } = await supabase
    .from("invitations")
    .select("*")
    .eq("id", id)
    .single()

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending invitations can be cancelled" },
      { status: 400 }
    )
  }

  // Administrators can only cancel their own invitations
  if (userRole.role === "administrator" && invitation.invitedBy !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabase
    .from("invitations")
    .update({ status: "cancelled" })
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAuditEvent({
    userId: user.id,
    action: "invitation.cancel",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "DELETE",
    requestPath: `/api/invitations/${id}`,
    responseStatus: 200,
    correlationId,
    details: { invitationId: id },
  })

  return NextResponse.json({ message: "Invitation cancelled" })
}
