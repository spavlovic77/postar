import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { companyUpdateSchema } from "@/lib/validations/document"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

async function requireSuperAdmin() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Unauthorized", status: 401 }

  // Use admin client to check role (bypasses RLS)
  const { data: userRole } = await adminClient
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (!userRole || userRole.role !== "superAdmin") {
    return { error: "Forbidden", status: 403 }
  }

  return { user, supabase: adminClient }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireSuperAdmin()
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { data, error } = await auth.supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 })
  }

  return NextResponse.json({ data })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireSuperAdmin()
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  const body = await request.json()
  const result = companyUpdateSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  // Build update object, converting empty strings to null for nullable fields
  const updateData: Record<string, unknown> = { ...result.data }

  // Empty strings → null for optional/nullable fields
  const nullableFields = ["adminEmail", "adminPhone", "accessPointProviderId", "pfsVerificationToken"]
  for (const field of nullableFields) {
    if (updateData[field] === "") {
      updateData[field] = null
    }
  }

  if (result.data.status) {
    updateData.isActive = result.data.status !== "draft"
  }

  const { data, error } = await auth.supabase
    .from("companies")
    .update(updateData)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAuditEvent({
    userId: auth.user.id,
    companyId: id,
    action: "company.update",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "PUT",
    requestPath: `/api/admin/companies/${id}`,
    responseStatus: 200,
    correlationId,
    details: { updates: result.data },
  })

  return NextResponse.json({ data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireSuperAdmin()
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  const { error } = await auth.supabase
    .from("companies")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAuditEvent({
    userId: auth.user.id,
    companyId: id,
    action: "company.delete",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "DELETE",
    requestPath: `/api/admin/companies/${id}`,
    responseStatus: 200,
    correlationId,
    details: { companyId: id },
  })

  return NextResponse.json({ message: "Company deleted" })
}
