import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { SapiSkClient } from "@/lib/sapiSk/client"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params
  const correlationId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") ?? ""

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { companyId } = body

  try {
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

    const { data: assignment } = await supabase
      .from("companyAssignments")
      .select("companyId")
      .eq("userId", user.id)
      .eq("companyId", companyId)
      .single()

    if (!assignment || !company?.accessPointProvider) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const client = new SapiSkClient({
      baseUrl: company.accessPointProvider.baseUrl,
      clientId: company.accessPointProvider.clientId,
      clientSecret: company.accessPointProvider.clientSecret,
    })

    const result = await client.acknowledgeDocument(
      company.peppolParticipantId,
      documentId
    )

    await supabase
      .from("documents")
      .update({
        status: "ACKNOWLEDGED",
        acknowledgedAt: result.acknowledgedDateTime,
      })
      .eq("providerDocumentId", documentId)
      .eq("companyId", companyId)

    await logAuditEvent({
      userId: user.id,
      companyId,
      action: "document.acknowledge",
      outcome: "success",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: `/api/sapiSk/documents/${documentId}/acknowledge`,
      responseStatus: 200,
      correlationId,
      details: { documentId },
    })

    return NextResponse.json(result)
  } catch {
    await logAuditEvent({
      userId: user.id,
      companyId,
      action: "document.acknowledge",
      outcome: "failure",
      sourceIp: ip,
      userAgent,
      requestMethod: "POST",
      requestPath: `/api/sapiSk/documents/${documentId}/acknowledge`,
      responseStatus: 500,
      correlationId,
    })

    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 }
    )
  }
}
