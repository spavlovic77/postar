import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth/permissions"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { syncCompanyToIonAp } from "@/lib/ionAp/sync"
import crypto from "crypto"

/**
 * POST /api/admin/companies/[id]/activate-ionap
 * 
 * Manually triggers ION AP registration for a company.
 * Normally this happens lazily on first document send/receive,
 * but this endpoint allows manual activation when needed.
 * 
 * Only accessible by superAdmin.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is superAdmin
    const roleData = await getUserRole(supabase, user.id)
    if (!roleData || roleData.role !== "superAdmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const adminClient = createAdminClient()

    // Get company
    const { data: company, error: fetchError } = await adminClient
      .from("companies")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    // Check if already registered
    if (company.ionApStatus === "success" && company.ionApOrgId) {
      return NextResponse.json({
        success: true,
        message: "Company already registered on ION AP",
        ionApOrgId: company.ionApOrgId,
        ionApIdentifierId: company.ionApIdentifierId,
      })
    }

    // Trigger ION AP sync
    console.log("[v0] Manually triggering ION AP registration for company:", id)
    const result = await syncCompanyToIonAp(id)

    await logAuditEvent({
      userId: user.id,
      action: "company.activate_ionap",
      outcome: result.success ? "success" : "failure",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: `/api/admin/companies/${id}/activate-ionap`,
      responseStatus: result.success ? 200 : 500,
      correlationId,
      details: {
        companyId: id,
        ionApOrgId: result.orgId,
        ionApIdentifierId: result.identifierId,
        error: result.error,
      },
    })

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 500 })
    }

    // If successful, update company status to active
    await adminClient
      .from("companies")
      .update({
        status: "active",
        isActive: true,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", id)

    return NextResponse.json({
      success: true,
      message: "Company activated on ION AP",
      ionApOrgId: result.orgId,
      ionApIdentifierId: result.identifierId,
    })

  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
