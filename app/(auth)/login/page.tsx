"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { loginSchema, type LoginInput } from "@/lib/validations/user"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { startAuthentication } from "@simplewebauthn/browser"
import { Fingerprint } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type LoginStep = "credentials" | "mfa"

interface MfaData {
  mfaRequired: boolean
  mfaToken: string
  challenge: any
}

export default function LoginPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [step, setStep] = useState<LoginStep>("credentials")
  const [mfaData, setMfaData] = useState<MfaData | null>(null)
  const [mfaLoading, setMfaLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginInput) => {
    setServerError(null)

    try {
      // Use Supabase client directly for authentication (sets cookies properly)
      const supabase = createClient()
      
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError || !authData.user) {
        setServerError(authError?.message || "Nesprávny e-mail alebo heslo")
        return
      }

      // Check if user has MFA enabled via API
      const res = await fetch("/api/auth/check-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authData.user.id }),
      })

      const mfaResult = await res.json()

      if (mfaResult.mfaRequired) {
        setMfaData({
          mfaRequired: true,
          mfaToken: mfaResult.mfaToken,
          challenge: mfaResult.challenge,
        })
        setStep("mfa")
        return
      }

      // No MFA - redirect to home
      router.push("/")
      router.refresh()
    } catch {
      setServerError("Chyba pri prihlasovaní. Skúste to znova.")
    }
  }

  const handleMfaVerify = async () => {
    if (!mfaData) return

    setMfaLoading(true)
    setServerError(null)

    try {
      // Start WebAuthn authentication
      const authResponse = await startAuthentication({
        optionsJSON: mfaData.challenge,
      })

      // Send verification to server
      const res = await fetch("/api/auth/login/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mfaToken: mfaData.mfaToken,
          response: authResponse,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          setServerError("Príliš veľa pokusov. Skúste to neskôr.")
        } else {
          setServerError(result.error || "Overenie zlyhalo")
        }
        return
      }

      // MFA verified - redirect to home
      router.push("/")
      router.refresh()
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setServerError("Overenie bolo zrušené")
      } else {
        setServerError("Overenie zlyhalo. Skúste to znova.")
      }
    } finally {
      setMfaLoading(false)
    }
  }

  if (step === "mfa") {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Overenie totožnosti</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Použite svoj bezpečnostný kľúč alebo biometrické overenie
          </p>
        </div>

        {serverError && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {serverError}
          </div>
        )}

        <div className="flex flex-col items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Fingerprint className="h-10 w-10 text-primary" />
          </div>

          <Button
            onClick={handleMfaVerify}
            disabled={mfaLoading}
            className="w-full"
            aria-busy={mfaLoading}
          >
            {mfaLoading ? "Overujem..." : "Overiť pomocou passkey"}
          </Button>

          <button
            type="button"
            onClick={() => {
              setStep("credentials")
              setMfaData(null)
              setServerError(null)
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Späť na prihlásenie
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Postar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Prihláste sa do svojho účtu
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {serverError}
          </div>
        )}

        <div>
          <Label htmlFor="email">E-mailová adresa</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="password">Heslo</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          {errors.password && (
            <p id="password-error" className="mt-1 text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full"
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Prihlasovanie..." : "Prihlásiť sa"}
        </Button>
      </form>
    </div>
  )
}
