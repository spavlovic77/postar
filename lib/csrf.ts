import { cookies } from "next/headers"
import { Redis } from "@upstash/redis"
import crypto from "crypto"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const CSRF_COOKIE_NAME = "__csrf"
const CSRF_HEADER_NAME = "x-csrf-token"
const CSRF_TOKEN_TTL = 3600 // 1 hour

/**
 * Generate a new CSRF token and store it in Redis and cookies
 */
export async function generateCSRFToken(userId?: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex")
  const key = userId ? `csrf:${userId}:${token}` : `csrf:anon:${token}`
  
  // Store token in Redis with TTL
  await redis.set(key, "1", { ex: CSRF_TOKEN_TTL })
  
  // Set cookie
  const cookieStore = await cookies()
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: CSRF_TOKEN_TTL,
    path: "/",
  })
  
  return token
}

/**
 * Validate a CSRF token from the request header against Redis
 */
export async function validateCSRFToken(
  request: Request,
  userId?: string
): Promise<{ valid: boolean; error?: string }> {
  // Get token from header
  const headerToken = request.headers.get(CSRF_HEADER_NAME)
  
  if (!headerToken) {
    // Fallback: check cookie for double-submit pattern
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value
    
    if (!cookieToken) {
      return { valid: false, error: "Missing CSRF token" }
    }
    
    // Verify cookie token exists in Redis
    const key = userId ? `csrf:${userId}:${cookieToken}` : `csrf:anon:${cookieToken}`
    const exists = await redis.exists(key)
    
    if (!exists) {
      return { valid: false, error: "Invalid or expired CSRF token" }
    }
    
    return { valid: true }
  }
  
  // Verify header token exists in Redis
  const key = userId ? `csrf:${userId}:${headerToken}` : `csrf:anon:${headerToken}`
  const exists = await redis.exists(key)
  
  if (!exists) {
    return { valid: false, error: "Invalid or expired CSRF token" }
  }
  
  return { valid: true }
}

/**
 * Simple validation against cookie (legacy support)
 */
export async function validateCSRFTokenSimple(token: string): Promise<boolean> {
  const cookieStore = await cookies()
  const storedToken = cookieStore.get(CSRF_COOKIE_NAME)?.value
  return storedToken === token
}

/**
 * Get the current CSRF token from cookies
 */
export async function getCSRFToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(CSRF_COOKIE_NAME)?.value || null
}

/**
 * Check if the request method requires CSRF validation
 */
export function requiresCSRFCheck(method: string): boolean {
  const stateMethods = ["POST", "PUT", "PATCH", "DELETE"]
  return stateMethods.includes(method.toUpperCase())
}

/**
 * Response headers with CSRF token
 */
export function csrfHeaders(token: string): Record<string, string> {
  return {
    "X-CSRF-Token": token,
  }
}
