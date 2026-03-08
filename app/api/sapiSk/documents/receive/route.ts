import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { SapiSkClient } from "@/lib/sapiSk/client"
import { logAuditEvent } from "@/lib/sapiSk/auditLog"
import crypto from "crypto"

export async function GET(request: Request) {
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
  const direction = searchParams.get("direction") ?? "received"

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

    // Return local documents from DB
    const query = supabase
      .from("documents")
      .select("*")
      .eq("companyId", companyId)
      .eq("direction", direction === "sent" ? "sent" : "received")
      .order("createdAt", { ascending: false })

    const search = searchParams.get("search")
    if (search) {
      query.ilike("documentId", `%${search}%`)
    }

    const sortField = searchParams.get("sortField") ?? "createdAt"
    const sortOrder = searchParams.get("sortOrder") ?? "desc"
    if (sortField === "documentId" || sortField === "createdAt") {
      query.order(sortField, { ascending: sortOrder === "asc" })
    }

    const { data: documents, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await logAuditEvent({
      userId: user.id,
      companyId,
      action: "document.receive.list",
      outcome: "success",
      sourceIp: ip,
      userAgent,
      requestMethod: "GET",
      requestPath: "/api/sapiSk/documents/receive",
      responseStatus: 200,
      correlationId,
    })

    return NextResponse.json({ documents })
  } catch {
    return NextResponse.json(
      { error: "Internal server error", correlationId },
      { status: 500 }
    )
  }
}
