import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { loginSchema } from "@/lib/validations/user"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { checkRateLimit, RATE_LIMITS, getClientIP, rateLimitHeaders } from "@/lib/rate-limit"
import crypto from "crypto"

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID()
  const ip = getClientIP(request)
  const userAgent = request.headers.get("user-agent") ?? ""

  // Rate limiting by IP
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMITS.login)
  
  if (!rateLimitResult.success) {
    await logAuditEvent({
      userId: null,
      action: "auth.login.rate_limited",
      outcome: "failure",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: "/api/auth/login",
      responseStatus: 429,
      correlationId,
      details: { reason: "rate_limit_exceeded" },
    })

    return NextResponse.json(
      { error: "Príliš veľa pokusov. Skúste to neskôr." },
      { 
        status: 429,
        headers: rateLimitHeaders(rateLimitResult),
      }
    )
  }

  const body = await request.json()
  const result = loginSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400, headers: rateLimitHeaders(rateLimitResult) }
    )
  }

  const adminClient = createAdminClient()

  // Authenticate user
  const { data: authData, error: authError } = await adminClient.auth.signInWithPassword({
    email: result.data.email,
    password: result.data.password,
  })

  if (authError || !authData.user) {
    await logAuditEvent({
      userId: null,
      action: "auth.login.failed",
      outcome: "failure",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: "/api/auth/login",
      responseStatus: 401,
      correlationId,
      details: { email: result.data.email, reason: authError?.message },
    })

    return NextResponse.json(
      { error: "Nesprávny e-mail alebo heslo" },
      { status: 401, headers: rateLimitHeaders(rateLimitResult) }
    )
  }

  // Check if user has MFA enabled
  const { data: userRole } = await adminClient
    .from("userRoles")
    .select("mfaEnabled")
    .eq("userId", authData.user.id)
    .single()

  // Check if user has passkeys registered
  const { data: passkeys } = await adminClient
    .from("passkeys")
    .select("id")
    .eq("userId", authData.user.id)
    .limit(1)

  const hasMfaEnabled = userRole?.mfaEnabled || (passkeys && passkeys.length > 0)

  if (hasMfaEnabled) {
    // User has MFA - return partial auth, require MFA verification
    await logAuditEvent({
      userId: authData.user.id,
      action: "auth.login.mfa_required",
      outcome: "pending",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: "/api/auth/login",
      responseStatus: 200,
      correlationId,
    })

    return NextResponse.json(
      { 
        requireMfa: true,
        userId: authData.user.id,
        // Return a temporary token for MFA verification
        mfaToken: crypto.randomUUID(),
      },
      { status: 200, headers: rateLimitHeaders(rateLimitResult) }
    )
  }

  // No MFA required - return session
  await logAuditEvent({
    userId: authData.user.id,
    action: "auth.login.success",
    outcome: "success",
    sourceIp: ip,
    userAgent,
    requestMethod: "POST",
    requestPath: "/api/auth/login",
    responseStatus: 200,
    correlationId,
  })

  return NextResponse.json(
    { 
      session: authData.session,
      user: authData.user,
    },
    { status: 200, headers: rateLimitHeaders(rateLimitResult) }
  )
}
