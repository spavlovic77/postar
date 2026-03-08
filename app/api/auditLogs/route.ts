import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: userRole } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (userRole?.role !== "superAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get("page") ?? "1")
  const limit = parseInt(searchParams.get("limit") ?? "50")

  const { data, error, count } = await supabase
    .from("auditLogs")
    .select("*", { count: "exact" })
    .range((page - 1) * limit, page * limit - 1)
    .order("timestamp", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, meta: { page, limit, total: count } })
}
