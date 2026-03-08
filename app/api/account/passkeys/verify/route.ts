import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server"

const rpID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || "localhost"
const origin = process.env.NEXT_PUBLIC_APP_URL || `https://${rpID}`

// POST - Generate authentication options or verify response
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    const adminClient = createAdminClient()

    if (action === "generate") {
      // Get user's passkeys
      const { data: passkeys } = await adminClient
        .from("passkeys")
        .select("credentialId, transports")
        .eq("userId", user.id)

      if (!passkeys || passkeys.length === 0) {
        return NextResponse.json(
          { error: "No passkeys registered" },
          { status: 400 }
        )
      }

      const allowCredentials = passkeys.map((p) => ({
        id: p.credentialId,
        transports: p.transports || [],
      }))

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: "preferred",
      })

      return NextResponse.json({
        options,
        challenge: options.challenge,
      })
    }

    if (action === "verify") {
      const { response, challenge } = body

      if (!response || !challenge) {
        return NextResponse.json(
          { error: "Missing response or challenge" },
          { status: 400 }
        )
      }

      // Find the passkey being used
      const credentialId = response.id
      const { data: passkey, error: fetchError } = await adminClient
        .from("passkeys")
        .select("*")
        .eq("credentialId", credentialId)
        .eq("userId", user.id)
        .single()

      if (fetchError || !passkey) {
        return NextResponse.json(
          { error: "Passkey not found" },
          { status: 404 }
        )
      }

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: Buffer.from(passkey.credentialId, "base64url"),
          publicKey: Buffer.from(passkey.publicKey, "base64url"),
          counter: passkey.counter,
        },
      })

      if (!verification.verified) {
        return NextResponse.json(
          { error: "Verification failed" },
          { status: 400 }
        )
      }

      // Update counter and last used timestamp
      await adminClient
        .from("passkeys")
        .update({
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date().toISOString(),
        })
        .eq("id", passkey.id)

      return NextResponse.json({ success: true, verified: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    console.error("Passkey verification error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
