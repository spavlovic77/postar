import type {
  SendDocumentRequest,
  SendDocumentResponse,
  ReceivedDocumentListResponse,
  ReceivedDocumentDetailResponse,
  AcknowledgeResponse,
  TokenResponse,
  SapiError,
} from "./types"
import { SapiSkError } from "./errors"
import { fetchWithRetry } from "./retry"

interface AccessPointConfig {
  baseUrl: string
  clientId: string
  clientSecret: string
}

export class SapiSkClient {
  private config: AccessPointConfig
  private accessToken: string | null = null

  constructor(config: AccessPointConfig) {
    this.config = config
  }

  private async getAccessToken(): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/sapi/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "client_credentials",
        scope: "document:send document:receive",
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new SapiSkError(error.error)
    }

    const data: TokenResponse = await response.json()
    return data.accessToken
  }

  private async request<T>(
    path: string,
    options: RequestInit & {
      peppolParticipantId?: string
      idempotencyKey?: string
    }
  ): Promise<T> {
    const token = await this.getAccessToken()

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    }

    if (options.peppolParticipantId) {
      headers["X-Peppol-Participant-Id"] = options.peppolParticipantId
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey
    }

    const response = await fetchWithRetry(
      `${this.config.baseUrl}/sapi${path}`,
      {
        ...options,
        headers,
      },
      {
        maxRetries: 3,
        onRetry: async (attempt, error) => {
          if (error.status === 401 && attempt === 1) {
            this.accessToken = await this.getAccessToken()
            return true
          }
          return error.retryable
        },
      }
    )

    if (!response.ok) {
      const error = (await response.json()) as { error: SapiError }
      throw new SapiSkError(error.error)
    }

    return response.json() as Promise<T>
  }

  async sendDocument(
    peppolParticipantId: string,
    request: SendDocumentRequest,
    idempotencyKey: string
  ): Promise<SendDocumentResponse> {
    return this.request<SendDocumentResponse>("/document/send", {
      method: "POST",
      body: JSON.stringify(request),
      peppolParticipantId,
      idempotencyKey,
    })
  }

  async listReceivedDocuments(
    peppolParticipantId: string,
    options?: {
      pageToken?: string
      limit?: number
      status?: "RECEIVED" | "ACKNOWLEDGED"
    }
  ): Promise<ReceivedDocumentListResponse> {
    const params = new URLSearchParams()
    if (options?.pageToken) params.set("pageToken", options.pageToken)
    if (options?.limit) params.set("limit", options.limit.toString())
    if (options?.status) params.set("status", options.status)

    const query = params.toString() ? `?${params.toString()}` : ""

    return this.request<ReceivedDocumentListResponse>(
      `/document/receive${query}`,
      {
        method: "GET",
        peppolParticipantId,
      }
    )
  }

  async getReceivedDocument(
    peppolParticipantId: string,
    documentId: string
  ): Promise<ReceivedDocumentDetailResponse> {
    return this.request<ReceivedDocumentDetailResponse>(
      `/document/receive/${documentId}`,
      { method: "GET", peppolParticipantId }
    )
  }

  async acknowledgeDocument(
    peppolParticipantId: string,
    documentId: string
  ): Promise<AcknowledgeResponse> {
    return this.request<AcknowledgeResponse>(
      `/document/receive/${documentId}/acknowledge`,
      { method: "POST", peppolParticipantId }
    )
  }
}
