import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { companySchema } from "@/lib/validations/document"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("createdAt", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
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

  const body = await request.json()
  const result = companySchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  // Set defaults for new companies
  const companyData = {
    dic: result.data.dic,
    legalName: result.data.legalName,
    adminEmail: result.data.adminEmail || null,
    accessPointProviderId: result.data.accessPointProviderId || null,
    pfsVerificationToken: result.data.pfsVerificationToken || null,
    status: result.data.status || "active",
    isActive: result.data.status !== "draft",
    createdById: user.id,
  }

  const { data, error } = await supabase
    .from("companies")
    .insert(companyData)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-assign creating user to the company
  await supabase.from("companyAssignments").insert({
    userId: user.id,
    companyId: data.id,
    assignedById: user.id,
  })

  await logAuditEvent({
    userId: user.id,
    companyId: data.id,
    action: "company.create",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: "/api/companies",
    responseStatus: 201,
    correlationId,
    details: { companyId: data.id, dic: result.data.dic },
  })

  return NextResponse.json({ data }, { status: 201 })
}
