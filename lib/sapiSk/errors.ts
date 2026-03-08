import type { SapiError } from "./types"

export class SapiSkError extends Error {
  public readonly category: string
  public readonly code: string
  public readonly retryable: boolean
  public readonly correlationId: string
  public readonly details?: SapiError["details"]

  constructor(error: SapiError) {
    super(error.message)
    this.name = "SapiSkError"
    this.category = error.category
    this.code = error.code
    this.retryable = error.retryable
    this.correlationId = error.correlationId
    this.details = error.details
  }
}
