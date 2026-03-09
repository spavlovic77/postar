import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { SapiSkClient } from "@/lib/sapiSk/client"
import { SapiSkError } from "@/lib/sapiSk/errors"
import { sendDocumentSchema } from "@/lib/validations/document"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import { ratelimit } from "@/lib/rateLimit"
import { validateCSRFTokenSimple } from "@/lib/csrf"
import {
  PEPPOL_DOCUMENT_TYPES,
  PEPPOL_PROCESS_ID,
} from "@/lib/sapiSk/types"
import crypto from "crypto"

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  const { success: rateLimitOk } = await ratelimit.limit(ip)
  if (!rateLimitOk) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const csrfToken = request.headers.get("x-csrf-token")
  if (!csrfToken || !(await validateCSRFTokenSimple(csrfToken))) {
    return NextResponse.json(
      { error: "Invalid CSRF token" },
      { status: 403 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()

    const validation = sendDocumentSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { companyId, documentType, payload, documentId, receiverParticipantId } =
      validation.data

    const { data: assignment } = await supabase
      .from("companyAssignments")
      .select("companyId")
      .eq("userId", user.id)
      .eq("companyId", companyId)
      .single()

    if (!assignment) {
      return NextResponse.json(
        { error: "Company access denied" },
        { status: 403 }
      )
    }

    const { data: company } = await supabase
      .from("companies")
      .select(
        `
        *,
        accessPointProvider:accessPointProviders(*)
      `
      )
      .eq("id", companyId)
      .single()

    if (!company?.accessPointProvider) {
      return NextResponse.json(
        { error: "No Access Point configured for this company" },
        { status: 400 }
      )
    }

    const client = new SapiSkClient({
      baseUrl: company.accessPointProvider.baseUrl,
      clientId: company.accessPointProvider.clientId,
      clientSecret: company.accessPointProvider.clientSecret,
    })

    const checksum = crypto
      .createHash("sha256")
      .update(payload)
      .digest("hex")
    const idempotencyKey = crypto.randomUUID()

    const result = await client.sendDocument(
      company.peppolParticipantId,
      {
        metadata: {
          documentId,
          documentTypeId: PEPPOL_DOCUMENT_TYPES[documentType],
          processId: PEPPOL_PROCESS_ID,
          senderParticipantId: company.peppolParticipantId,
          receiverParticipantId,
          creationDateTime: new Date().toISOString(),
        },
        payload,
        payloadFormat: "XML",
        checksum,
      },
      idempotencyKey
    )

    await supabase.from("documents").insert({
      companyId,
      providerDocumentId: result.providerDocumentId,
      documentId,
      documentTypeId: PEPPOL_DOCUMENT_TYPES[documentType],
      processId: PEPPOL_PROCESS_ID,
      senderParticipantId: company.peppolParticipantId,
      receiverParticipantId,
      direction: "sent",
      status: result.status,
      documentType,
      createdById: user.id,
    })

    await logAuditEvent({
      userId: user.id,
      companyId,
      action: "document.send",
      outcome: "success",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: "/api/sapiSk/documents/send",
      responseStatus: 202,
      correlationId,
      details: {
        documentId,
        documentType,
        providerDocumentId: result.providerDocumentId,
      },
    })

    return NextResponse.json(result, { status: 202 })
  } catch (error) {
    await logAuditEvent({
      userId: user.id,
      action: "document.send",
      outcome: "failure",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: "/api/sapiSk/documents/send",
      responseStatus: error instanceof SapiSkError ? 400 : 500,
      correlationId,
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    })

    if (error instanceof SapiSkError) {
      const statusMap: Record<string, number> = {
        AUTH: 401,
        VALIDATION: 400,
        PROCESSING: 500,
        TEMPORARY: 503,
        PERMANENT: 400,
      }
      return NextResponse.json(
        { error: { ...error, correlationId } },
        { status: statusMap[error.category] ?? 500 }
      )
    }

    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 }
    )
  }
}
