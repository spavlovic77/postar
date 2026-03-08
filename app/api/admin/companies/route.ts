import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { companySchema } from "@/lib/validations/document"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Unauthorized", status: 401 }

  const { data: userRole } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (!userRole || userRole.role !== "superAdmin") {
    return { error: "Forbidden", status: 403 }
  }

  return { user, supabase }
}

export async function GET() {
  const auth = await requireSuperAdmin()
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { data, error } = await auth.supabase
    .from("companies")
    .select("*")
    .order("createdAt", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
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

  // Generate Peppol Participant ID from DIC
  const peppolParticipantId = `0245:${result.data.dic.replace("SK", "")}`

  const { data, error } = await auth.supabase
    .from("companies")
    .insert({
      ...result.data,
      peppolParticipantId,
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
