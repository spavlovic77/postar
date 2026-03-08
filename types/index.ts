export type UserRole = "superAdmin" | "administrator" | "accountant"

export interface User {
  id: string
  email: string
  role: UserRole
  createdAt: string
}

export interface Company {
  id: string
  name: string
  dic: string
  peppolParticipantId: string
  accessPointProviderId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AccessPointProvider {
  id: string
  name: string
  baseUrl: string
  clientId: string
  clientSecret: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Document {
  id: string
  companyId: string
  providerDocumentId: string
  documentId: string
  documentTypeId: string
  processId: string
  senderParticipantId: string
  receiverParticipantId: string
  direction: "sent" | "received"
  status: "ACCEPTED" | "RECEIVED" | "ACKNOWLEDGED"
  documentType: "invoice" | "creditNote"
  createdAt: string
  acknowledgedAt: string | null
  createdById: string
}

export interface AuditLog {
  id: string
  timestamp: string
  userId: string
  companyId: string | null
  action: string
  outcome: "success" | "failure"
  sourceIp: string
  userAgent: string
  requestMethod: string
  requestPath: string
  responseStatus: number
  correlationId: string
  details: Record<string, unknown> | null
}

export interface CompanyAssignment {
  id: string
  userId: string
  companyId: string
  assignedById: string
  createdAt: string
}
