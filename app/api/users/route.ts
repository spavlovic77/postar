import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { inviteUserSchema } from "@/lib/validations/user"
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
    .from("userRoles")
    .select("*, user:userId(email)")
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

  const { data: currentUserRole } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (
    !currentUserRole ||
    !["superAdmin", "administrator"].includes(currentUserRole.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const result = inviteUserSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  await logAuditEvent({
    userId: user.id,
    action: "user.create",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: "/api/users",
    responseStatus: 201,
    correlationId,
    details: { email: result.data.email, role: result.data.role },
  })

  return NextResponse.json(
    { message: "User invitation sent" },
    { status: 201 }
  )
}
