import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { checkRateLimit, RATE_LIMITS, getClientIP, rateLimitHeaders } from "@/lib/rate-limit"
import {
  verifyAuthenticationResponse,
  generateAuthenticationOptions,
} from "@simplewebauthn/server"
import crypto from "crypto"

const rpID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || "localhost"
const origin = process.env.NEXT_PUBLIC_APP_URL || `https://${rpID}`

// Generate MFA challenge
export async function POST(request: Request) {
  const ip = getClientIP(request)
  const userAgent = request.headers.get("user-agent") ?? ""
  const correlationId = crypto.randomUUID()

  // Rate limiting
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMITS.mfaVerify)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Príliš veľa pokusov. Skúste to neskôr." },
      { status: 429, headers: rateLimitHeaders(rateLimitResult) }
    )
  }

  const body = await request.json()
  const { userId, action } = body

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Get user's passkeys
  const { data: passkeys, error: passkeysError } = await adminClient
    .from("passkeys")
    .select("credentialId, transports")
    .eq("userId", userId)

  if (passkeysError || !passkeys || passkeys.length === 0) {
    return NextResponse.json(
      { error: "No passkeys registered" },
      { status: 400 }
    )
  }

  if (action === "generate") {
    // Generate authentication options
    const allowCredentials = passkeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports || [],
    }))

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "preferred",
    })

    // Store challenge temporarily (5 minutes)
    await adminClient.from("mfa_challenges").upsert({
      userId,
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })

    return NextResponse.json({ options })
  }

  if (action === "verify") {
    const { response } = body

    if (!response) {
      return NextResponse.json(
        { error: "Authentication response required" },
        { status: 400 }
      )
    }

    // Get stored challenge
    const { data: challengeData } = await adminClient
      .from("mfa_challenges")
      .select("challenge")
      .eq("userId", userId)
      .single()

    if (!challengeData) {
      return NextResponse.json(
        { error: "No pending challenge" },
        { status: 400 }
      )
    }

    // Find the matching passkey
    const passkey = passkeys.find(
      (p) => p.credentialId === response.id
    )

    if (!passkey) {
      await logAuditEvent({
        userId,
        action: "auth.mfa.verify_failed",
        outcome: "failure",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/auth/login/mfa",
        responseStatus: 401,
        correlationId,
        details: { reason: "passkey_not_found" },
      })

      return NextResponse.json(
        { error: "Passkey not found" },
        { status: 401 }
      )
    }

    // Get full passkey data for verification
    const { data: fullPasskey } = await adminClient
      .from("passkeys")
      .select("*")
      .eq("credentialId", response.id)
      .single()

    if (!fullPasskey) {
      return NextResponse.json(
        { error: "Passkey data not found" },
        { status: 401 }
      )
    }

    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: fullPasskey.credentialId,
          publicKey: fullPasskey.publicKey,
          counter: fullPasskey.counter,
        },
      })

      if (!verification.verified) {
        await logAuditEvent({
          userId,
          action: "auth.mfa.verify_failed",
          outcome: "failure",
          sourceIp: ip,
          userAgent,
          requestMethod: "POST",
          requestPath: "/api/auth/login/mfa",
          responseStatus: 401,
          correlationId,
          details: { reason: "verification_failed" },
        })

        return NextResponse.json(
          { error: "Verification failed" },
          { status: 401 }
        )
      }

      // Update passkey counter
      await adminClient
        .from("passkeys")
        .update({
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date().toISOString(),
        })
        .eq("id", fullPasskey.id)

      // Delete the used challenge
      await adminClient
        .from("mfa_challenges")
        .delete()
        .eq("userId", userId)

      // Get user data to return session
      const { data: userData } = await adminClient.auth.admin.getUserById(userId)

      await logAuditEvent({
        userId,
        action: "auth.mfa.verify_success",
        outcome: "success",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/auth/login/mfa",
        responseStatus: 200,
        correlationId,
      })

      return NextResponse.json({
        verified: true,
        user: userData?.user,
      })
    } catch (error) {
      await logAuditEvent({
        userId,
        action: "auth.mfa.verify_error",
        outcome: "failure",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/auth/login/mfa",
        responseStatus: 500,
        correlationId,
        details: { error: String(error) },
      })

      return NextResponse.json(
        { error: "Verification error" },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
