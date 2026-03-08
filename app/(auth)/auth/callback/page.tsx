"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    async function handleCallback() {
      const supabase = createClient()

      // Check for code parameter (from magic link email)
      const code = searchParams.get("code")
      
      if (code) {
        // Exchange the code for a session
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        
        if (exchangeError) {
          console.error("Exchange code error:", exchangeError)
          setStatus("error")
          setErrorMsg("Nepodarilo sa overiť odkaz. Odkaz mohol vypršať alebo už bol použitý.")
          return
        }
      }

      // Get the session after exchange
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        setStatus("error")
        setErrorMsg("Nepodarilo sa overiť odkaz. Skúste to znova.")
        return
      }

      // Check if there's an invitation token
      const invitationToken = searchParams.get("invitation_token")

      if (invitationToken) {
        const res = await fetch(`/api/invitations/accept/${invitationToken}`)

        if (!res.ok) {
          const data = await res.json()
          setStatus("error")
          setErrorMsg(data.error || "Nepodarilo sa prijať pozvánku.")
          return
        }
      }

      router.push("/")
      router.refresh()
    }

    handleCallback()
  }, [router, searchParams])

  if (status === "error") {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold text-foreground">Chyba overenia</h1>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <a href="/login" className="text-primary hover:underline">
          Späť na prihlásenie
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">Overovanie...</h1>
      <p className="text-sm text-muted-foreground">
        Počkajte prosím, overujeme váš odkaz.
      </p>
    </div>
  )
}
