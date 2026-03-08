import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types"

const rpName = "Postar"
const rpID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || "localhost"
const origin = process.env.NEXT_PUBLIC_APP_URL || `https://${rpID}`

// POST - Generate registration options
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
    const { action, name } = body

    const adminClient = createAdminClient()

    if (action === "generate") {
      // Get existing passkeys to exclude
      const { data: existingPasskeys } = await adminClient
        .from("passkeys")
        .select("credentialId")
        .eq("userId", user.id)

      const excludeCredentials = (existingPasskeys || []).map((p) => ({
        id: Buffer.from(p.credentialId, "base64url"),
        type: "public-key" as const,
      }))

      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: new TextEncoder().encode(user.id),
        userName: user.email || user.id,
        userDisplayName: user.email || "User",
        attestationType: "none",
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
          authenticatorAttachment: "platform",
        },
      })

      // Store challenge in a temporary way (in production, use Redis or session)
      // For now, we'll pass it back and verify it client-side
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

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      })

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json(
          { error: "Verification failed" },
          { status: 400 }
        )
      }

      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo

      // Store the passkey
      const { error } = await adminClient.from("passkeys").insert({
        userId: user.id,
        credentialId: Buffer.from(credential.id).toString("base64url"),
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: response.response.transports as AuthenticatorTransportFuture[],
        name: name || "Passkey",
      })

      if (error) {
        console.error("Error storing passkey:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Enable MFA for the user
      await adminClient
        .from("userRoles")
        .update({ mfaEnabled: true })
        .eq("userId", user.id)

      return NextResponse.json({ success: true, verified: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    console.error("Passkey registration error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
