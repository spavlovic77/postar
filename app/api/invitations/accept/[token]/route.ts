import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { syncUserToIonAp } from "@/lib/ionAp/sync"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log(`[Invitation] Accepting invitation token=${token} for user=${user.id} (${user.email})`)

  // Use admin client to bypass RLS
  const { data: invitation } = await adminClient
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

  // Verify the authenticated user matches the invitation email
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    console.error(`[Invitation] Email mismatch: authenticated as ${user.email}, but invitation is for ${invitation.email}`)
    return NextResponse.json(
      { error: "This invitation was sent to a different email address" },
      { status: 403 }
    )
  }

  if (new Date(invitation.expiresAt) < new Date()) {
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
  const { data: existingRole } = await adminClient
    .from("userRoles")
    .select("id, role")
    .eq("userId", user.id)
    .single()

  const effectiveRole = existingRole?.role || invitation.role

  if (!existingRole) {
    // Create user role
    await adminClient.from("userRoles").insert({
      userId: user.id,
      role: invitation.role,
      isActive: true,
    })
    console.log(`[Invitation] Created role=${invitation.role} for user=${user.id}`)
  }

  // Create company assignments and collect new assignment IDs
  const companyIds: string[] = invitation.companyIds || []
  const newAssignmentIds: string[] = []

  for (const companyId of companyIds) {
    const { data: existing } = await adminClient
      .from("companyAssignments")
      .select("id")
      .eq("userId", user.id)
      .eq("companyId", companyId)
      .single()

    if (!existing) {
      const { data: newAssignment } = await adminClient
        .from("companyAssignments")
        .insert({
          userId: user.id,
          companyId,
          assignedById: invitation.invitedBy,
        })
        .select("id")
        .single()

      if (newAssignment) {
        newAssignmentIds.push(newAssignment.id)
        console.log(`[Invitation] Created assignment=${newAssignment.id} for user=${user.id}, company=${companyId}`)
      }
    } else {
      // Existing assignment — still need to sync user if not done yet
      newAssignmentIds.push(existing.id)
    }
  }

  // Mark invitation as accepted
  await adminClient
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id)

  // Fetch DICs for all assigned companies (for audit correlation)
  let companyDics: string[] = []
  if (companyIds.length > 0) {
    const { data: companyData } = await adminClient
      .from("companies")
      .select("dic")
      .in("id", companyIds)
    companyDics = companyData?.map((c: { dic: string }) => c.dic) || []
  }

  const acceptCorrelationId = crypto.randomUUID()
  console.log(`[Invitation] Invitation accepted: invitationId=${invitation.id}, role=${effectiveRole}, dics=${companyDics.join(",")}, correlationId=${acceptCorrelationId}`)

  // Audit: invitation accepted
  await logAuditEvent({
    userId: user.id,
    action: "onboarding.invitation.accept",
    outcome: "success",
    sourceIp: request.headers.get("x-forwarded-for") ?? "127.0.0.1",
    userAgent: request.headers.get("user-agent") ?? "",
    requestMethod: "GET",
    requestPath: `/api/invitations/accept/${token}`,
    responseStatus: 200,
    correlationId: acceptCorrelationId,
    details: {
      invitationId: invitation.id,
      email: user.email,
      role: effectiveRole,
      companyIds,
      dics: companyDics,
      assignmentIds: newAssignmentIds,
      step: "invitation_accepted",
    },
  })

  // Fire-and-forget: create ION AP users for administrators
  if (effectiveRole === "administrator" && newAssignmentIds.length > 0) {
    console.log(`[Invitation] [DICs=${companyDics.join(",")}] Triggering ION AP user sync for ${newAssignmentIds.length} assignments: ${newAssignmentIds.join(", ")}`)
    for (const assignmentId of newAssignmentIds) {
      syncUserToIonAp(assignmentId).catch((err) =>
        console.error(`[Invitation] ION AP user sync failed for assignment=${assignmentId}:`, err)
      )
    }
  }

  return NextResponse.json({ success: true, role: effectiveRole })
}
