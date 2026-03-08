"use client"

import { useState, useEffect, useCallback } from "react"
import { Fingerprint, Plus, Trash2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser"

interface Passkey {
  id: string
  name: string
  deviceType: string | null
  createdAt: string
  lastUsedAt: string | null
}

export function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [passkeyName, setPasskeyName] = useState("")
  const [registering, setRegistering] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [supportsWebAuthn, setSupportsWebAuthn] = useState(false)

  const fetchPasskeys = useCallback(async () => {
    try {
      const res = await fetch("/api/account/passkeys")
      const json = await res.json()
      if (json.data) {
        setPasskeys(json.data)
      }
    } catch {
      console.error("Failed to fetch passkeys")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSupportsWebAuthn(browserSupportsWebAuthn())
    fetchPasskeys()
  }, [fetchPasskeys])

  async function handleRegister() {
    setRegistering(true)
    setError(null)

    try {
      // Step 1: Get registration options from server
      const optionsRes = await fetch("/api/account/passkeys/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      })

      if (!optionsRes.ok) {
        throw new Error("Failed to get registration options")
      }

      const { options, challenge } = await optionsRes.json()

      // Step 2: Start WebAuthn registration in browser
      const credential = await startRegistration({ optionsJSON: options })

      // Step 3: Verify with server
      const verifyRes = await fetch("/api/account/passkeys/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          response: credential,
          challenge,
          name: passkeyName || "Passkey",
        }),
      })

      if (!verifyRes.ok) {
        const data = await verifyRes.json()
        throw new Error(data.error || "Verification failed")
      }

      // Success - refresh list
      await fetchPasskeys()
      setRegisterOpen(false)
      setPasskeyName("")
    } catch (err) {
      console.error("Registration error:", err)
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setRegistering(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)

    try {
      const res = await fetch("/api/account/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkeyId: id }),
      })

      if (res.ok) {
        setPasskeys((prev) => prev.filter((p) => p.id !== id))
      }
    } catch {
      console.error("Failed to delete passkey")
    } finally {
      setDeleting(null)
    }
  }

  async function handleVerify() {
    setError(null)

    try {
      // Step 1: Get authentication options
      const optionsRes = await fetch("/api/account/passkeys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      })

      if (!optionsRes.ok) {
        throw new Error("Failed to get authentication options")
      }

      const { options, challenge } = await optionsRes.json()

      // Step 2: Start WebAuthn authentication
      const credential = await startAuthentication({ optionsJSON: options })

      // Step 3: Verify with server
      const verifyRes = await fetch("/api/account/passkeys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          response: credential,
          challenge,
        }),
      })

      if (!verifyRes.ok) {
        const data = await verifyRes.json()
        throw new Error(data.error || "Verification failed")
      }

      // Success
      alert("Passkey verified successfully!")
    } catch (err) {
      console.error("Verification error:", err)
      setError(err instanceof Error ? err.message : "Verification failed")
    }
  }

  if (!supportsWebAuthn) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Fingerprint size={20} className="text-muted-foreground" />
          <h2 className="font-semibold">Passkey / Biometricke prihlasenie</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Vas prehliadac nepodporuje WebAuthn. Skuste iny prehliadac pre
          pouzianie passkeys.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Fingerprint size={20} className="text-primary" />
          <h2 className="font-semibold">Passkey / Biometricke prihlasenie</h2>
          {passkeys.length > 0 && (
            <Badge variant="success" className="flex items-center gap-1">
              <ShieldCheck size={12} />
              MFA aktivne
            </Badge>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Passkeys su bezpecnejsie ako hesla. Pouzivaju biometriu (odtlacok prsta,
        Face ID) alebo hardverovy kluc.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Nacitavam...</p>
      ) : (
        <>
          {passkeys.length > 0 && (
            <div className="space-y-2 mb-4">
              {passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{passkey.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Vytvoreny:{" "}
                      {new Date(passkey.createdAt).toLocaleDateString("sk-SK")}
                      {passkey.lastUsedAt && (
                        <>
                          {" "}
                          | Naposledy pouzity:{" "}
                          {new Date(passkey.lastUsedAt).toLocaleDateString(
                            "sk-SK"
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(passkey.id)}
                    disabled={deleting === passkey.id}
                  >
                    <Trash2
                      size={16}
                      className={
                        deleting === passkey.id
                          ? "text-muted-foreground"
                          : "text-destructive"
                      }
                    />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => setRegisterOpen(true)} variant="outline">
              <Plus size={16} className="mr-2" />
              Pridat passkey
            </Button>
            {passkeys.length > 0 && (
              <Button onClick={handleVerify} variant="secondary">
                <ShieldCheck size={16} className="mr-2" />
                Otestovat passkey
              </Button>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
          )}
        </>
      )}

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pridat novy passkey</DialogTitle>
            <DialogDescription>
              Budete vyzyvani na overenie pomocou biometrie alebo bezpecnostneho
              kluca.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="passkeyName">Nazov passkey (volitelne)</Label>
              <Input
                id="passkeyName"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
                placeholder="napr. MacBook Touch ID"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRegisterOpen(false)}
              disabled={registering}
            >
              Zrusit
            </Button>
            <Button onClick={handleRegister} disabled={registering}>
              {registering ? "Registrujem..." : "Pokracovat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
