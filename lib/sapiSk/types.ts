export type SapiErrorCategory =
  | "AUTH"
  | "VALIDATION"
  | "PROCESSING"
  | "TEMPORARY"
  | "PERMANENT"

export interface SapiError {
  category: SapiErrorCategory
  code: string
  message: string
  details?: Array<{
    field?: string
    issue?: string
    value?: string
  }>
  retryable: boolean
  correlationId: string
}

export interface TokenResponse {
  accessToken: string
  tokenType: "Bearer"
  expiresIn: number
  scope?: string
}

export interface TokenStatus {
  valid: boolean
  tokenType: "access"
  clientId: string
  issuedAt: string
  expiresAt: string
  expiresInSeconds: number
  shouldRefresh: boolean
  refreshRecommendedAt: string
}

export interface DocumentMetadata {
  documentId: string
  documentTypeId: string
  processId: string
  senderParticipantId: string
  receiverParticipantId: string
  creationDateTime: string
}

export interface SendDocumentRequest {
  metadata: DocumentMetadata
  payload: string
  payloadFormat: "XML"
  payloadEncoding?: string
  checksum?: string
}

export interface SendDocumentResponse {
  providerDocumentId: string
  status: "ACCEPTED" | "REJECTED"
  receivedAt?: string
  timestamp: string
}

export interface ReceivedDocumentListResponse {
  documents: DocumentMetadata[]
  nextPageToken?: string
}

export interface ReceivedDocumentDetailResponse {
  metadata: DocumentMetadata
  payload: string
  payloadFormat: string
}

export interface AcknowledgeResponse {
  documentId: string
  status: "ACKNOWLEDGED"
  acknowledgedDateTime: string
}

export type DocumentType = "invoice" | "creditNote"

export const PEPPOL_DOCUMENT_TYPES = {
  invoice:
    "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1",
  creditNote:
    "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1",
} as const

export const PEPPOL_PROCESS_ID =
  "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"
