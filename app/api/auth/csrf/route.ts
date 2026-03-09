import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateCSRFToken, getCSRFToken } from "@/lib/csrf"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get existing token or generate new one
  let token = await getCSRFToken()
  
  if (!token) {
    token = await generateCSRFToken(user?.id)
  }

  return NextResponse.json({ csrfToken: token })
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Always generate a new token on POST
  const token = await generateCSRFToken(user?.id)

  return NextResponse.json({ csrfToken: token })
}
