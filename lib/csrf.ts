import { cookies } from "next/headers"

export async function generateCSRFToken(): Promise<string> {
  const token = crypto.randomUUID()
  const cookieStore = await cookies()
  cookieStore.set("csrf_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  })
  return token
}

export async function validateCSRFToken(token: string): Promise<boolean> {
  const cookieStore = await cookies()
  const storedToken = cookieStore.get("csrf_token")?.value
  return storedToken === token
}
