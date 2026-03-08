import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { deactivationRequestSchema } from "@/lib/validations/user"
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

  const { data } = await supabase
    .from("accountDeactivationRequests")
    .select("*")
    .eq("userId", user.id)
    .order("createdAt", { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Check if there's already a pending request
  const { data: existing } = await supabase
    .from("accountDeactivationRequests")
    .select("id")
    .eq("userId", user.id)
    .eq("status", "pending")
    .single()

  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending deactivation request" },
      { status: 409 }
    )
  }

  const body = await request.json()
  const result = deactivationRequestSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("accountDeactivationRequests")
    .insert({
      userId: user.id,
      reason: result.data.reason || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  await logAuditEvent({
    userId: user.id,
    action: "account.request-deactivation",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: "/api/account/request-deactivation",
    responseStatus: 201,
    correlationId,
    details: { requestId: data.id },
  })

  return NextResponse.json({ data }, { status: 201 })
}
