import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: invitation } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single()

  if (!invitation) {
    return NextResponse.json(
      { error: "Invalid or expired invitation" },
      { status: 404 }
    )
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    await supabase
      .from("invitations")
      .update({ status: "expired" })
      .eq("id", invitation.id)
    return NextResponse.json(
      { error: "Invitation has expired" },
      { status: 410 }
    )
  }

  // Check if user already has a role
  const { data: existingRole } = await supabase
    .from("userRoles")
    .select("id")
    .eq("userId", user.id)
    .single()

  if (!existingRole) {
    // Create user role
    await supabase.from("userRoles").insert({
      userId: user.id,
      role: invitation.role,
      isActive: true,
    })
  }

  // Create company assignments
  const companyIds: string[] = invitation.companyIds || []
  for (const companyId of companyIds) {
    const { data: existing } = await supabase
      .from("companyAssignments")
      .select("id")
      .eq("userId", user.id)
      .eq("companyId", companyId)
      .single()

    if (!existing) {
      await supabase.from("companyAssignments").insert({
        userId: user.id,
        companyId,
        assignedById: invitation.invitedBy,
      })
    }
  }

  // Mark invitation as accepted
  await supabase
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id)

  return NextResponse.json({ success: true, role: invitation.role })
}
