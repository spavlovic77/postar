import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { SapiSkClient } from "@/lib/sapiSk/client"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function GET(
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

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get("companyId")

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    )
  }

  try {
    const { data: assignment } = await supabase
      .from("companyAssignments")
      .select("companyId")
      .eq("userId", user.id)
      .eq("companyId", companyId)
      .single()

    if (!assignment) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const { data: document } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("companyId", companyId)
      .single()

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      )
    }

    // Fetch full document from AP if needed
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

    let fullDocument = document
    if (company?.accessPointProvider && document.direction === "received") {
      const client = new SapiSkClient({
        baseUrl: company.accessPointProvider.baseUrl,
        clientId: company.accessPointProvider.clientId,
        clientSecret: company.accessPointProvider.clientSecret,
      })

      const apDocument = await client.getReceivedDocument(
        company.peppolParticipantId,
        document.providerDocumentId
      )

      fullDocument = { ...document, payload: apDocument.payload }
    }

    await logAuditEvent({
      userId: user.id,
      companyId,
      action: "document.receive.get",
      outcome: "success",
      sourceIp: ip,
      userAgent,
      requestMethod: "GET",
      requestPath: `/api/sapiSk/documents/${documentId}`,
      responseStatus: 200,
      correlationId,
      details: { documentId },
    })

    return NextResponse.json(fullDocument)
  } catch {
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 }
    )
  }
}
