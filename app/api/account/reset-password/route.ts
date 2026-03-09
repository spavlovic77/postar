import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { checkRateLimit, RATE_LIMITS, getClientIP, rateLimitHeaders } from "@/lib/rate-limit"
import crypto from "crypto"

export async function POST(request: Request) {
  const ip = getClientIP(request)
  
  // Rate limiting
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMITS.passwordReset)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Príliš veľa pokusov. Skúste to neskôr." },
      { status: 429, headers: rateLimitHeaders(rateLimitResult) }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: user.email!,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "http://localhost:3000"}/auth/callback`,
    },
  })

  if (error) {
    return NextResponse.json(
      { error: "Failed to send reset link" },
      { status: 500 }
    )
  }

  const correlationId = crypto.randomUUID()
  const userAgent = request.headers.get("user-agent") ?? ""

  await logAuditEvent({
    userId: user.id,
    action: "account.reset-password",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: "/api/account/reset-password",
    responseStatus: 200,
    correlationId,
  })

  return NextResponse.json({ message: "Password reset link sent" })
}
