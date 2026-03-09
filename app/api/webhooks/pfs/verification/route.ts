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
  verification_token: string
  dic: string
  legalName?: string
  company_email?: string
  company_phone?: string
  created: string
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

  console.log(`[PFS Webhook] Received verification webhook. correlationId=${correlationId}, ip=${ip}`)

  try {
    // Get signature from header
    const signature = request.headers.get("x-pfs-signature")
    if (!signature) {
      console.warn(`[PFS Webhook] Missing X-PFS-Signature header. correlationId=${correlationId}`)
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
    console.log(`[PFS Webhook] Raw body (${rawBody.length} bytes): ${rawBody.substring(0, 500)}`)

    // Validate signature
    if (!validateSignature(rawBody, signature)) {
      console.warn(`[PFS Webhook] Invalid signature. correlationId=${correlationId}, signature=${signature}`)
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

    console.log(`[PFS Webhook] Signature valid. correlationId=${correlationId}`)

    // Parse payload
    let payload: PfsVerificationPayload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      console.error(`[PFS Webhook] Invalid JSON payload. correlationId=${correlationId}`)
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

    console.log(`[PFS Webhook] Parsed payload: dic=${payload.dic}, token=${payload.verification_token}, legalName=${payload.legalName}, email=${payload.company_email}, phone=${payload.company_phone}`)

    // Validate required fields
    if (!payload.verification_token || !payload.dic) {
      console.warn(`[PFS Webhook] Missing required fields. correlationId=${correlationId}, hasDic=${!!payload.dic}, hasToken=${!!payload.verification_token}`)
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
      console.warn(`[PFS Webhook] Invalid DIC format: "${payload.dic}". correlationId=${correlationId}`)
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
    console.log(`[PFS Webhook] Checking idempotency for token=${payload.verification_token}`)

    // Check for idempotency - skip if verification token already exists
    const { data: existingByToken } = await adminClient
      .from("companies")
      .select("id")
      .eq("pfsVerificationToken", payload.verification_token)
      .single()

    if (existingByToken) {
      console.log(`[PFS Webhook] Duplicate token found, already processed. companyId=${existingByToken.id}`)
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

    console.log(`[PFS Webhook] Checking if DIC=${payload.dic} already exists`)
    // Check if company with this DIC already exists
    const { data: existingByDic } = await adminClient
      .from("companies")
      .select("id, status, pfsVerificationToken")
      .eq("dic", payload.dic)
      .single()

    if (existingByDic) {
      console.log(`[PFS Webhook] Existing company found by DIC: companyId=${existingByDic.id}, status=${existingByDic.status}`)
      // Update existing company with verification token and contact info
      const updateFields: Record<string, unknown> = {}
      if (!existingByDic.pfsVerificationToken) {
        updateFields.pfsVerificationToken = payload.verification_token
      }
      if (payload.legalName) updateFields.legalName = payload.legalName
      if (payload.company_email) updateFields.adminEmail = payload.company_email
      if (payload.company_phone) updateFields.adminPhone = payload.company_phone

      if (Object.keys(updateFields).length > 0) {
        console.log(`[PFS Webhook] Updating existing company ${existingByDic.id} with fields:`, JSON.stringify(updateFields))
        await adminClient
          .from("companies")
          .update(updateFields)
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
      console.log(`[PFS Webhook] Triggering ION AP sync for existing company=${existingByDic.id}`)
      syncCompanyToIonAp(existingByDic.id).catch((err) =>
        console.error(`[PFS Webhook] ION AP sync failed for existing company=${existingByDic.id}:`, err)
      )

      return NextResponse.json({
        success: true,
        message: "Company already exists",
        company_id: existingByDic.id,
      })
    }

    console.log(`[PFS Webhook] Creating new draft company: dic=${payload.dic}, legalName=${payload.legalName}`)
    // Create new draft company
    const { data: newCompany, error: insertError } = await adminClient
      .from("companies")
      .insert({
        dic: payload.dic,
        legalName: payload.legalName || null,
        pfsVerificationToken: payload.verification_token,
        adminEmail: payload.company_email || null,
        adminPhone: payload.company_phone || null,
        status: "draft",
        isActive: false, // Draft companies are inactive until completed
      })
      .select()
      .single()

    if (insertError) {
      console.error(`[PFS Webhook] DB insert failed: ${insertError.message}. correlationId=${correlationId}`)
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

    console.log(`[PFS Webhook] Draft company created: companyId=${newCompany.id}, dic=${payload.dic}`)

    // Trigger ION AP registration (fire-and-forget, don't block webhook response)
    console.log(`[PFS Webhook] Triggering ION AP sync for new company=${newCompany.id}`)
    syncCompanyToIonAp(newCompany.id).catch((err) =>
      console.error(`[PFS Webhook] ION AP sync failed for new company=${newCompany.id}:`, err)
    )

    return NextResponse.json({
      success: true,
      message: "Company created",
      company_id: newCompany.id,
    }, { status: 201 })

  } catch (error) {
    console.error(`[PFS Webhook] Unexpected error. correlationId=${correlationId}`, error instanceof Error ? error.message : error)
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
