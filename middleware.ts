import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const protectedRoutes = ["/dashboard", "/documents", "/companies", "/users", "/admin", "/settings"]
const authRoutes = ["/login"]

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            })
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  if (
    protectedRoutes.some((route) => pathname.startsWith(route)) &&
    !user
  ) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (authRoutes.some((route) => pathname.startsWith(route)) && user) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
