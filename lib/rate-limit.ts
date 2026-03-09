import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number
  /** Time window in seconds */
  window: number
  /** Identifier prefix for the rate limit key */
  prefix: string
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

/**
 * Check rate limit for a given identifier
 * Uses sliding window algorithm with Redis
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = `ratelimit:${config.prefix}:${identifier}`
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - config.window

  try {
    // Use a pipeline for atomic operations
    const pipeline = redis.pipeline()
    
    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart)
    
    // Count current entries in window
    pipeline.zcard(key)
    
    // Add current request with score as timestamp
    pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` })
    
    // Set expiry on the key
    pipeline.expire(key, config.window)
    
    const results = await pipeline.exec()
    
    // zcard result is at index 1
    const currentCount = (results[1] as number) || 0
    
    const remaining = Math.max(0, config.limit - currentCount - 1)
    const reset = now + config.window

    if (currentCount >= config.limit) {
      // Over limit - remove the request we just added
      await redis.zremrangebyscore(key, now, now + 1)
      
      return {
        success: false,
        limit: config.limit,
        remaining: 0,
        reset,
      }
    }

    return {
      success: true,
      limit: config.limit,
      remaining,
      reset,
    }
  } catch (error) {
    console.error("Rate limit check failed:", error)
    // Fail open - allow request if Redis is unavailable
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit,
      reset: now + config.window,
    }
  }
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  // Auth endpoints - strict limits
  login: { limit: 5, window: 60, prefix: "login" }, // 5 per minute
  signup: { limit: 3, window: 60, prefix: "signup" }, // 3 per minute
  passwordReset: { limit: 3, window: 300, prefix: "pwd-reset" }, // 3 per 5 minutes
  invitation: { limit: 10, window: 60, prefix: "invite" }, // 10 per minute
  
  // MFA endpoints
  mfaVerify: { limit: 5, window: 60, prefix: "mfa-verify" }, // 5 per minute
  mfaRegister: { limit: 3, window: 300, prefix: "mfa-register" }, // 3 per 5 minutes
  
  // API endpoints - moderate limits
  apiRead: { limit: 100, window: 60, prefix: "api-read" }, // 100 per minute
  apiWrite: { limit: 30, window: 60, prefix: "api-write" }, // 30 per minute
} as const

/**
 * Helper to get client IP from request
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0].trim()
  }
  return request.headers.get("x-real-ip") || "127.0.0.1"
}

/**
 * Create rate limit headers for response
 */
export function rateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers()
  headers.set("X-RateLimit-Limit", result.limit.toString())
  headers.set("X-RateLimit-Remaining", result.remaining.toString())
  headers.set("X-RateLimit-Reset", result.reset.toString())
  return headers
}
