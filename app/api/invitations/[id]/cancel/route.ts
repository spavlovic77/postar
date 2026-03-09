import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth/permissions"

export async function POST(
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

  const actorRoleData = await getUserRole(adminClient, user.id)
  if (!actorRoleData || !["superAdmin", "administrator"].includes(actorRoleData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Get invitation
  const { data: invitation, error: invError } = await adminClient
    .from("invitations")
    .select("*")
    .eq("id", id)
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
  }

  // Administrator can only cancel their own invitations
  if (actorRoleData.role === "administrator" && invitation.invitedBy !== user.id) {
    return NextResponse.json({ error: "You can only cancel your own invitations" }, { status: 403 })
  }

  // Can only cancel pending invitations
  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: "Can only cancel pending invitations" },
      { status: 400 }
    )
  }

  // Update invitation status to cancelled
  const { error: updateError } = await adminClient
    .from("invitations")
    .update({ status: "cancelled" })
    .eq("id", id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: "Invitation cancelled" })
}
