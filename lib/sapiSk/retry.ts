interface RetryOptions {
  maxRetries: number
  baseDelayMs?: number
  maxDelayMs?: number
  onRetry?: (attempt: number, error: RetryableError) => Promise<boolean>
}

interface RetryableError {
  status: number
  retryable: boolean
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: RetryOptions
): Promise<Response> {
  const {
    maxRetries,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry,
  } = retryOptions

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      if (response.ok || !isRetryableStatus(response.status)) {
        return response
      }

      const error: RetryableError = {
        status: response.status,
        retryable: isRetryableStatus(response.status),
      }

      if (onRetry) {
        const shouldRetry = await onRetry(attempt, error)
        if (!shouldRetry) return response
      }

      if (attempt < maxRetries) {
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelayMs
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error as Error

      if (attempt < maxRetries) {
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelayMs
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

function isRetryableStatus(status: number): boolean {
  return [429, 502, 503, 504].includes(status)
}
