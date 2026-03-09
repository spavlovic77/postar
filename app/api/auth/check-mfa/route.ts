import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { generateAuthenticationOptions } from "@simplewebauthn/server"
import crypto from "crypto"

const rpID = process.env.NEXT_PUBLIC_RP_ID || "localhost"

export async function POST(request: Request) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { userId } = body

  // Ensure the userId matches the authenticated user
  if (userId !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Check if user has MFA enabled
  const { data: userRole } = await adminClient
    .from("userRoles")
    .select("mfaEnabled")
    .eq("userId", userId)
    .single()

  // Check if user has passkeys registered
  const { data: passkeys } = await adminClient
    .from("passkeys")
    .select("id, credentialId, transports")
    .eq("userId", userId)

  const hasMfaEnabled = userRole?.mfaEnabled || (passkeys && passkeys.length > 0)

  if (!hasMfaEnabled) {
    return NextResponse.json({ mfaRequired: false })
  }

  // Generate WebAuthn authentication options
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys?.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports || [],
    })) || [],
    userVerification: "preferred",
  })

  // Store challenge temporarily
  const mfaToken = crypto.randomUUID()
  
  await adminClient
    .from("mfa_challenges")
    .upsert({
      userId,
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min
    })

  return NextResponse.json({
    mfaRequired: true,
    mfaToken,
    challenge: options,
  })
}
