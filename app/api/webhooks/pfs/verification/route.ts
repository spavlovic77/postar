import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

/**
 * PFS Webhook - Company Verification
 * 
 * Receives webhook notifications when a company completes verification in PFS.
 * Creates a draft company entry and automatically sends an invitation to the admin.
 * 
 * Flow:
 * 1. Validate HMAC signature
 * 2. Create company with status "draft"
 * 3. Send invitation to company_email as administrator
 * 4. ION AP registration happens lazily on first document send/receive
 * 
 * Security:
 * - HMAC-SHA256 signature validation
 * - Supports comma-delimited secrets for rotation
 * - Idempotent (skips duplicate verification tokens)
 */

interface PfsVerificationPayload {
  verification_token: string
  dic: string
  legal_name: string
  company_email: string
  company_phone?: string
  created?: string
}

/**
 * Validates HMAC-SHA256 signature against one or more secrets (comma-delimited)
 */
function validateSignature(payload: string, signature: string): boolean {
  const secrets = (process.env.PFS_WEBHOOK_SECRET || "").split(",").map(s => s.trim()).filter(Boolean)
  
  if (secrets.length === 0) {
    console.error("[v0] PFS_WEBHOOK_SECRET not configured")
    return false
  }

  for (const secret of secrets) {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex")

    // Constant-time comparison to prevent timing attacks
    try {
      if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return true
      }
    } catch {
      // Different lengths, continue to next secret
    }
  }

  return false
}

/**
 * Validates DIC format: exactly 10 digits
 */
function isValidDic(dic: string): boolean {
  return /^\d{10}$/.test(dic)
}

/**
 * Sends invitation to the company admin email
 * Returns the invitation ID or null if failed
 */
async function sendAdminInvitation(
  adminClient: ReturnType<typeof createAdminClient>,
  companyId: string,
  email: string,
  correlationId: string
): Promise<{ success: boolean; invitationId?: string; error?: string }> {
  console.log("[v0] Sending admin invitation to:", email)
  
  try {
    // Generate invitation token
    const invitationToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

    // Create invitation record
    const { data: invitation, error: invitationError } = await adminClient
      .from("invitations")
      .insert({
        email,
        role: "administrator",
        token: invitationToken,
        status: "pending",
        invitedBy: null, // System-generated
        invitedByRole: "system",
        companyIds: [companyId],
        expiresAt: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (invitationError) {
      console.error("[v0] Failed to create invitation record:", invitationError)
      return { success: false, error: `Failed to create invitation: ${invitationError.message}` }
    }

    console.log("[v0] Invitation record created:", invitation.id)

    // Send invitation email via Supabase Auth
    const { error: emailError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || "https://postar-six.vercel.app"}/auth/callback?invitation_token=${invitationToken}`,
    })

    if (emailError) {
      console.error("[v0] Failed to send invitation email:", emailError)
      // Update invitation status to failed but keep the record
      await adminClient
        .from("invitations")
        .update({ status: "pending" }) // Keep pending, admin can resend
        .eq("id", invitation.id)
      
      return { success: false, invitationId: invitation.id, error: `Failed to send email: ${emailError.message}` }
    }

    console.log("[v0] Invitation email sent successfully")
    return { success: true, invitationId: invitation.id }
    
  } catch (err) {
    console.error("[v0] Unexpected error sending invitation:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  console.log("[v0] ========== PFS WEBHOOK START ==========")
  console.log("[v0] Correlation ID:", correlationId)
  console.log("[v0] IP:", ip)

  try {
    // Get signature from header
    const signature = request.headers.get("x-pfs-signature")
    console.log("[v0] Signature header present:", !!signature)
    
    if (!signature) {
      await logAuditEvent({
        userId: null,
        action: "webhook.pfs.verification",
        outcome: "failure",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/webhooks/pfs/verification",
        responseStatus: 401,
        correlationId,
        details: { error: "Missing signature header" },
      })
      return NextResponse.json({ error: "Missing signature" }, { status: 401 })
    }

    // Get raw body for signature validation
    const rawBody = await request.text()
    console.log("[v0] Raw body length:", rawBody.length)
    console.log("[v0] Raw body preview:", rawBody.substring(0, 300))
    
    // Validate signature
    const signatureValid = validateSignature(rawBody, signature)
    console.log("[v0] Signature valid:", signatureValid)
    
    if (!signatureValid) {
      await logAuditEvent({
        userId: null,
        action: "webhook.pfs.verification",
        outcome: "failure",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/webhooks/pfs/verification",
        responseStatus: 401,
        correlationId,
        details: { error: "Invalid signature" },
      })
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    // Parse payload
    let payload: PfsVerificationPayload
    try {
      payload = JSON.parse(rawBody)
      console.log("[v0] Parsed payload:", JSON.stringify(payload, null, 2))
    } catch (parseErr) {
      console.error("[v0] JSON parse error:", parseErr)
      await logAuditEvent({
        userId: null,
        action: "webhook.pfs.verification",
        outcome: "failure",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/webhooks/pfs/verification",
        responseStatus: 400,
        correlationId,
        details: { error: "Invalid JSON payload" },
      })
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    // Validate required fields
    if (!payload.verification_token || !payload.dic || !payload.legal_name || !payload.company_email) {
      await logAuditEvent({
        userId: null,
        action: "webhook.pfs.verification",
        outcome: "failure",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/webhooks/pfs/verification",
        responseStatus: 400,
        correlationId,
        details: { 
          error: "Missing required fields", 
          hasToken: !!payload.verification_token, 
          hasDic: !!payload.dic,
          hasLegalName: !!payload.legal_name,
          hasEmail: !!payload.company_email,
        },
      })
      return NextResponse.json({ 
        error: "Missing required fields. Required: verification_token, dic, legal_name, company_email" 
      }, { status: 400 })
    }

    // Validate DIC format (exactly 10 digits, no SK prefix)
    if (!isValidDic(payload.dic)) {
      await logAuditEvent({
        userId: null,
        action: "webhook.pfs.verification",
        outcome: "failure",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/webhooks/pfs/verification",
        responseStatus: 400,
        correlationId,
        details: { error: "Invalid DIC format", dic: payload.dic },
      })
      return NextResponse.json({ error: "Invalid DIC format. Must be exactly 10 digits." }, { status: 400 })
    }

    console.log("[v0] Creating admin client...")
    const adminClient = createAdminClient()

    // Check for idempotency - skip if verification token already exists
    console.log("[v0] Checking for existing company by token:", payload.verification_token)
    const { data: existingByToken } = await adminClient
      .from("companies")
      .select("id, invitationStatus")
      .eq("pfsVerificationToken", payload.verification_token)
      .single()

    if (existingByToken) {
      console.log("[v0] Duplicate webhook - company already exists:", existingByToken.id)
      await logAuditEvent({
        userId: null,
        action: "webhook.pfs.verification",
        outcome: "success",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/webhooks/pfs/verification",
        responseStatus: 200,
        correlationId,
        details: { 
          message: "Duplicate webhook - already processed",
          companyId: existingByToken.id,
          verification_token: payload.verification_token,
        },
      })
      return NextResponse.json({ 
        success: true, 
        message: "Already processed",
        company_id: existingByToken.id,
      })
    }

    // Check if company with this DIC already exists
    console.log("[v0] Checking for existing company by DIC:", payload.dic)
    const { data: existingByDic } = await adminClient
      .from("companies")
      .select("id, pfsVerificationToken, invitationStatus")
      .eq("dic", payload.dic)
      .single()

    if (existingByDic) {
      console.log("[v0] Company with DIC exists:", existingByDic.id)
      
      // Update existing company with new data
      const updateFields: Record<string, unknown> = {
        legalName: payload.legal_name,
        adminEmail: payload.company_email,
        updatedAt: new Date().toISOString(),
      }
      if (!existingByDic.pfsVerificationToken) {
        updateFields.pfsVerificationToken = payload.verification_token
      }
      if (payload.company_phone) {
        updateFields.adminPhone = payload.company_phone
      }

      await adminClient
        .from("companies")
        .update(updateFields)
        .eq("id", existingByDic.id)

      // Send invitation if not already sent
      if (existingByDic.invitationStatus === "none" || existingByDic.invitationStatus === "failed") {
        const inviteResult = await sendAdminInvitation(adminClient, existingByDic.id, payload.company_email, correlationId)
        
        await adminClient
          .from("companies")
          .update({
            invitationStatus: inviteResult.success ? "sent" : "failed",
            invitationError: inviteResult.error || null,
            invitationId: inviteResult.invitationId || null,
          })
          .eq("id", existingByDic.id)
      }

      await logAuditEvent({
        userId: null,
        action: "webhook.pfs.verification",
        outcome: "success",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/webhooks/pfs/verification",
        responseStatus: 200,
        correlationId,
        details: {
          message: "Updated existing company",
          companyId: existingByDic.id,
          dic: payload.dic,
        },
      })

      return NextResponse.json({
        success: true,
        message: "Company updated",
        company_id: existingByDic.id,
      })
    }

    // Create new draft company
    console.log("[v0] Creating new draft company...")
    const { data: newCompany, error: insertError } = await adminClient
      .from("companies")
      .insert({
        dic: payload.dic,
        legalName: payload.legal_name,
        pfsVerificationToken: payload.verification_token,
        adminEmail: payload.company_email,
        adminPhone: payload.company_phone || null,
        status: "draft",
        isActive: false,
        invitationStatus: "pending",
        ionApStatus: "pending",
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Database insert failed:", insertError)
      await logAuditEvent({
        userId: null,
        action: "webhook.pfs.verification",
        outcome: "failure",
        sourceIp: ip,
        userAgent,
        requestMethod: "POST",
        requestPath: "/api/webhooks/pfs/verification",
        responseStatus: 500,
        correlationId,
        details: { error: "Database insert failed", message: insertError.message },
      })
      return NextResponse.json({ error: "Failed to create company" }, { status: 500 })
    }

    console.log("[v0] Company created:", newCompany.id)

    // Send invitation to company admin
    const inviteResult = await sendAdminInvitation(adminClient, newCompany.id, payload.company_email, correlationId)
    
    // Update company with invitation status
    await adminClient
      .from("companies")
      .update({
        invitationStatus: inviteResult.success ? "sent" : "failed",
        invitationError: inviteResult.error || null,
        invitationId: inviteResult.invitationId || null,
      })
      .eq("id", newCompany.id)

    await logAuditEvent({
      userId: null,
      action: "webhook.pfs.verification",
      outcome: "success",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: "/api/webhooks/pfs/verification",
      responseStatus: 201,
      correlationId,
      details: {
        message: "Created draft company and sent invitation",
        companyId: newCompany.id,
        dic: payload.dic,
        legalName: payload.legal_name,
        invitationSent: inviteResult.success,
        invitationError: inviteResult.error,
      },
    })

    console.log("[v0] ========== PFS WEBHOOK END ==========")

    return NextResponse.json({
      success: true,
      message: inviteResult.success ? "Company created and invitation sent" : "Company created, invitation failed (can retry)",
      company_id: newCompany.id,
      invitation_sent: inviteResult.success,
      invitation_error: inviteResult.error,
    }, { status: 201 })

  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    await logAuditEvent({
      userId: null,
      action: "webhook.pfs.verification",
      outcome: "failure",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: "/api/webhooks/pfs/verification",
      responseStatus: 500,
      correlationId,
      details: { error: "Unexpected error", message: error instanceof Error ? error.message : "Unknown" },
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
