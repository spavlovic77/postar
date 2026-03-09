import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { companySchema } from "@/lib/validations/document"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

async function requireSuperAdmin() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized", status: 401 }

    // Use admin client to check role (bypasses RLS)
    const { data: userRole, error: roleError } = await adminClient
      .from("userRoles")
      .select("role")
      .eq("userId", user.id)
      .single()

    if (roleError) {
      console.error("requireSuperAdmin roleError:", roleError.message, "userId:", user.id)
      return { error: roleError.message, status: 500 }
    }

    if (!userRole || userRole.role !== "superAdmin") {
      return { error: "Forbidden", status: 403 }
    }

    // Return admin client for database operations
    return { user, supabase: adminClient }
  } catch (err) {
    console.error("requireSuperAdmin exception:", err)
    return { error: "Internal server error", status: 500 }
  }
}

export async function GET() {
  try {
    const auth = await requireSuperAdmin()
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { data, error } = await auth.supabase
      .from("companies")
      .select("*")
      .order("createdAt", { ascending: false })

    if (error) {
      console.error("GET companies error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err) {
    console.error("GET companies exception:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  const body = await request.json()
  const result = companySchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { data, error } = await auth.supabase
    .from("companies")
    .insert({
      dic: result.data.dic,
      legalName: result.data.legalName,
      adminEmail: result.data.adminEmail || null,
      accessPointProviderId: result.data.accessPointProviderId || null,
      pfsVerificationToken: result.data.pfsVerificationToken || null,
      status: result.data.status || "active",
      isActive: result.data.status !== "draft",
      createdById: auth.user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAuditEvent({
    userId: auth.user.id,
    companyId: data.id,
    action: "company.create",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: "/api/admin/companies",
    responseStatus: 201,
    correlationId,
    details: { companyId: data.id, dic: result.data.dic },
  })

  return NextResponse.json({ data }, { status: 201 })
}
