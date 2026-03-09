import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  console.log("[v0] GET /api/invitations/accept - token:", token)
  
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  console.log("[v0] Accept invitation - user:", user?.id, user?.email, "authError:", authError?.message)

  if (!user) {
    console.log("[v0] Accept invitation - no user, returning 401")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Use admin client to bypass RLS
  const { data: invitation, error: invitationError } = await adminClient
    .from("invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single()

  console.log("[v0] Accept invitation - invitation lookup:", { 
    found: !!invitation, 
    id: invitation?.id,
    email: invitation?.email,
    role: invitation?.role,
    status: invitation?.status,
    error: invitationError?.message 
  })

  if (!invitation) {
    console.log("[v0] Accept invitation - invitation not found or not pending")
    return NextResponse.json(
      { error: "Invalid or expired invitation" },
      { status: 404 }
    )
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    console.log("[v0] Accept invitation - invitation expired, updating status")
    await adminClient
      .from("invitations")
      .update({ status: "expired" })
      .eq("id", invitation.id)
    return NextResponse.json(
      { error: "Invitation has expired" },
      { status: 410 }
    )
  }

  // Check if user already has a role
  const { data: existingRole, error: roleCheckError } = await adminClient
    .from("userRoles")
    .select("id, role")
    .eq("userId", user.id)
    .single()

  console.log("[v0] Accept invitation - existing role check:", { existingRole, error: roleCheckError?.message })

  if (!existingRole) {
    // Create user role
    console.log("[v0] Accept invitation - creating new userRole:", { userId: user.id, role: invitation.role })
    const { error: insertRoleError } = await adminClient.from("userRoles").insert({
      userId: user.id,
      role: invitation.role,
      isActive: true,
    })
    console.log("[v0] Accept invitation - userRole insert result:", { error: insertRoleError?.message })
  } else {
    console.log("[v0] Accept invitation - user already has role:", existingRole.role)
  }

  // Create company assignments
  const companyIds: string[] = invitation.companyIds || []
  console.log("[v0] Accept invitation - creating company assignments for:", companyIds)
  
  for (const companyId of companyIds) {
    const { data: existing } = await adminClient
      .from("companyAssignments")
      .select("id")
      .eq("userId", user.id)
      .eq("companyId", companyId)
      .single()

    if (!existing) {
      console.log("[v0] Accept invitation - inserting companyAssignment:", { userId: user.id, companyId })
      const { error: assignError } = await adminClient.from("companyAssignments").insert({
        userId: user.id,
        companyId,
        assignedById: invitation.invitedBy,
      })
      console.log("[v0] Accept invitation - companyAssignment insert result:", { error: assignError?.message })
    } else {
      console.log("[v0] Accept invitation - companyAssignment already exists for:", companyId)
    }
  }

  // Mark invitation as accepted
  console.log("[v0] Accept invitation - marking invitation as accepted")
  const { error: updateError } = await adminClient
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id)

  console.log("[v0] Accept invitation - update status result:", { error: updateError?.message })
  console.log("[v0] Accept invitation - SUCCESS, returning role:", invitation.role)

  return NextResponse.json({ success: true, role: invitation.role })
}
