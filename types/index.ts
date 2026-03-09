export type UserRole = "superAdmin" | "administrator" | "accountant"

export interface User {
  id: string
  email: string
  role: UserRole
  isActive: boolean
  createdAt: string
}

export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled"

export interface Invitation {
  id: string
  email: string
  role: "administrator" | "accountant"
  invitedBy: string
  token: string
  expiresAt: string
  status: InvitationStatus
  companyIds: string[]
  createdAt: string
}

export type DeactivationRequestStatus = "pending" | "approved" | "rejected"

export interface DeactivationRequest {
  id: string
  userId: string
  reason: string | null
  status: DeactivationRequestStatus
  processedBy: string | null
  processedAt: string | null
  createdAt: string
}

export type CompanyStatus = "draft" | "active" | "suspended"
export type IonApStatus = "pending" | "success" | "failed"
export type InvitationSyncStatus = "pending" | "success" | "failed" | "skipped"

export interface Company {
  id: string
  dic: string
  legalName: string | null
  adminEmail: string | null
  adminPhone: string | null
  peppolParticipantId: string | null
  accessPointProviderId: string | null
  isActive: boolean
  status: CompanyStatus
  pfsVerificationToken: string | null
  ionApOrgId: number | null
  ionApIdentifierId: number | null
  ionApStatus: IonApStatus | null
  ionApError: string | null
  invitationStatus: InvitationSyncStatus | null
  invitationError: string | null
  createdById: string | null
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
  outcome: "success" | "failure" | "pending"
  sourceIp: string
  userAgent: string
  requestMethod: string
  requestPath: string
  responseStatus: number
  correlationId: string
  signatureId: string | null
  severity: number | null
  details: Record<string, unknown> | null
}

export type IonApUserStatus = "pending" | "success" | "failed"

export interface CompanyAssignment {
  id: string
  userId: string
  companyId: string
  assignedById: string
  ionApUserId: number | null
  ionApAuthToken: string | null
  ionApUserStatus: IonApUserStatus | null
  ionApUserError: string | null
  createdAt: string
}
