import { createClient } from "@/lib/supabase/server"

interface AuditLogEntry {
  userId: string | null
  companyId?: string
  action: string
  outcome: "success" | "failure" | "pending"
  sourceIp: string
  userAgent: string
  requestMethod: string
  requestPath: string
  responseStatus: number
  correlationId: string
  details?: Record<string, unknown>
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  const supabase = await createClient()

  const signatureId = mapActionToSignatureId(entry.action)
  const severity = entry.outcome === "success" ? 3 : 7

  await supabase.from("auditLogs").insert({
    userId: entry.userId,
    companyId: entry.companyId,
    action: entry.action,
    outcome: entry.outcome,
    sourceIp: entry.sourceIp,
    userAgent: entry.userAgent,
    requestMethod: entry.requestMethod,
    requestPath: entry.requestPath,
    responseStatus: entry.responseStatus,
    correlationId: entry.correlationId,
    details: entry.details,
    signatureId,
    severity,
  })
}

function mapActionToSignatureId(action: string): string {
  const mapping: Record<string, string> = {
    "auth.login": "AUTH-001",
    "auth.logout": "AUTH-002",
    "document.send": "DOC-001",
    "document.receive.list": "DOC-002",
    "document.receive.get": "DOC-003",
    "document.acknowledge": "DOC-004",
    "company.create": "ADMIN-001",
    "company.update": "ADMIN-002",
    "user.create": "ADMIN-003",
    "accessPoint.create": "ADMIN-004",
  }
  return mapping[action] ?? "UNKNOWN"
}

export function formatAsCef(
  entry: AuditLogEntry & { severity: number; signatureId: string }
): string {
  return [
    "CEF:0",
    "SAPI-SK-Client",
    "PeppolPlatform",
    "1.0",
    entry.signatureId,
    entry.action,
    entry.severity,
    `src=${entry.sourceIp}`,
    `duser=${entry.userId}`,
    `outcome=${entry.outcome}`,
    `requestMethod=${entry.requestMethod}`,
    `requestPath=${entry.requestPath}`,
  ].join("|")
}
