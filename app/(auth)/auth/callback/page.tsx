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

      const code = searchParams.get("code")
      const invitationToken = searchParams.get("invitation_token")

      // Sign out any existing session first to ensure clean session switch
      await supabase.auth.signOut()

      if (code) {
        // PKCE flow: exchange code for session
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError) {
          setStatus("error")
          setErrorMsg(`Nepodarilo sa overiť odkaz: ${exchangeError.message}`)
          return
        }
      } else {
        // Implicit flow: access_token is in the hash fragment
        // Parse hash fragment manually (not available in searchParams)
        const hash = window.location.hash.substring(1)
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get("access_token")
        const refreshToken = hashParams.get("refresh_token")

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (sessionError) {
            setStatus("error")
            setErrorMsg(`Nepodarilo sa overiť odkaz: ${sessionError.message}`)
            return
          }
        }
      }

      // Verify we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        setStatus("error")
        setErrorMsg("Nepodarilo sa overiť odkaz. Skúste to znova.")
        return
      }

      // Accept invitation if token present
      if (invitationToken) {
        const res = await fetch(`/api/invitations/accept/${invitationToken}`)
        const data = await res.json()

        if (!res.ok) {
          setStatus("error")
          setErrorMsg(data.error || "Nepodarilo sa prijať pozvánku.")
          return
        }

        // New users need to set a password
        if (data.isNewUser) {
          router.push("/setup-password")
          router.refresh()
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
