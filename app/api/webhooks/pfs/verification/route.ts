import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { syncCompanyToIonAp } from "@/lib/ionAp/sync"
import crypto from "crypto"

/**
 * PFS Webhook - Company Verification
 * 
 * Receives webhook notifications when a company completes verification in PFS.
 * Creates a draft company entry that can be completed manually by admin.
 * 
 * Security:
 * - HMAC-SHA256 signature validation
 * - Supports comma-delimited secrets for rotation
 * - Idempotent (skips duplicate verification tokens)
 */

interface PfsVerificationPayload {
  event_type: "company_verified"
  verification_token: string
  dic: string
  timestamp: string
}

/**
 * Validates HMAC-SHA256 signature against one or more secrets (comma-delimited)
 */
function validateSignature(payload: string, signature: string): boolean {
  const secrets = (process.env.PFS_WEBHOOK_SECRET || "").split(",").map(s => s.trim()).filter(Boolean)
  
  if (secrets.length === 0) {
    console.error("PFS_WEBHOOK_SECRET not configured")
    return false
  }

  for (const secret of secrets) {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex")

    // Constant-time comparison to prevent timing attacks
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return true
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

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  try {
    // Get signature from header
    const signature = request.headers.get("x-pfs-signature")
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
    
    // Validate signature
    if (!validateSignature(rawBody, signature)) {
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
    } catch {
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

    // Validate event type
    if (payload.event_type !== "company_verified") {
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
        details: { error: "Unknown event type", event_type: payload.event_type },
      })
      return NextResponse.json({ error: "Unknown event type" }, { status: 400 })
    }

    // Validate required fields
    if (!payload.verification_token || !payload.dic) {
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
        details: { error: "Missing required fields", hasToken: !!payload.verification_token, hasDic: !!payload.dic },
      })
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
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

    const adminClient = createAdminClient()

    // Check for idempotency - skip if verification token already exists
    const { data: existingByToken } = await adminClient
      .from("companies")
      .select("id")
      .eq("pfsVerificationToken", payload.verification_token)
      .single()

    if (existingByToken) {
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
    const { data: existingByDic } = await adminClient
      .from("companies")
      .select("id, status, pfsVerificationToken")
      .eq("dic", payload.dic)
      .single()

    if (existingByDic) {
      // Update existing company with verification token if not already set
      if (!existingByDic.pfsVerificationToken) {
        await adminClient
          .from("companies")
          .update({ pfsVerificationToken: payload.verification_token })
          .eq("id", existingByDic.id)

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
            message: "Updated existing company with verification token",
            companyId: existingByDic.id,
            dic: payload.dic,
            verification_token: payload.verification_token,
          },
        })
      }

      // Trigger ION AP sync (fire-and-forget, don't block webhook response)
      syncCompanyToIonAp(existingByDic.id).catch((err) =>
        console.error("ION AP sync failed for existing company:", err)
      )

      return NextResponse.json({
        success: true,
        message: "Company already exists",
        company_id: existingByDic.id,
      })
    }

    // Create new draft company
    const { data: newCompany, error: insertError } = await adminClient
      .from("companies")
      .insert({
        dic: payload.dic,
        pfsVerificationToken: payload.verification_token,
        status: "draft",
        isActive: false, // Draft companies are inactive until completed
      })
      .select()
      .single()

    if (insertError) {
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
        message: "Created draft company from webhook",
        companyId: newCompany.id,
        dic: payload.dic,
        verification_token: payload.verification_token,
      },
    })

    // Trigger ION AP registration (fire-and-forget, don't block webhook response)
    syncCompanyToIonAp(newCompany.id).catch((err) =>
      console.error("ION AP sync failed for new company:", err)
    )

    return NextResponse.json({
      success: true,
      message: "Company created",
      company_id: newCompany.id,
    }, { status: 201 })

  } catch (error) {
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
