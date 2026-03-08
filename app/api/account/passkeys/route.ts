import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

// GET - List user's passkeys
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from("passkeys")
      .select("id, name, deviceType, createdAt, lastUsedAt")
      .eq("userId", user.id)
      .order("createdAt", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error("GET passkeys error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Remove a passkey
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { passkeyId } = await request.json()

    if (!passkeyId) {
      return NextResponse.json({ error: "Passkey ID required" }, { status: 400 })
    }

    const adminClient = createAdminClient()
    
    // Verify the passkey belongs to the user
    const { data: passkey, error: fetchError } = await adminClient
      .from("passkeys")
      .select("id")
      .eq("id", passkeyId)
      .eq("userId", user.id)
      .single()

    if (fetchError || !passkey) {
      return NextResponse.json({ error: "Passkey not found" }, { status: 404 })
    }

    const { error } = await adminClient
      .from("passkeys")
      .delete()
      .eq("id", passkeyId)
      .eq("userId", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Check if user has any remaining passkeys
    const { data: remainingPasskeys } = await adminClient
      .from("passkeys")
      .select("id")
      .eq("userId", user.id)

    // If no passkeys left, disable MFA
    if (!remainingPasskeys || remainingPasskeys.length === 0) {
      await adminClient
        .from("userRoles")
        .update({ mfaEnabled: false })
        .eq("userId", user.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("DELETE passkey error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
