import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { accessPointSchema } from "@/lib/validations/document"
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

  const { data: userRole } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (userRole?.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("accessPointProviders")
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

  const { data: userRole } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (userRole?.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const result = accessPointSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("accessPointProviders")
    .insert(result.data)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAuditEvent({
    userId: user.id,
    action: "accessPoint.create",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: "/api/sapiSk/accessPoints",
    responseStatus: 201,
    correlationId,
    details: { accessPointId: data.id },
  })

  return NextResponse.json({ data }, { status: 201 })
}
