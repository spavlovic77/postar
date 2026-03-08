"use client"

import { useState, useEffect } from "react"
import { Settings, KeyRound, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { PasskeySettings } from "@/components/settings/passkey-settings"

export default function SettingsPage() {
  const [resetSent, setResetSent] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [existingRequest, setExistingRequest] = useState<{
    status: string
  } | null>(null)

  useEffect(() => {
    fetch("/api/account/request-deactivation")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setExistingRequest(json.data)
      })
  }, [])

  async function handleResetPassword() {
    setSubmitting(true)
    const res = await fetch("/api/account/reset-password", { method: "POST" })
    if (res.ok) setResetSent(true)
    setSubmitting(false)
  }

  async function handleDeactivation(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch("/api/account/request-deactivation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    })
    if (res.ok) {
      setDeactivateOpen(false)
      setExistingRequest({ status: "pending" })
    }
    setSubmitting(false)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Settings size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">Nastavenia</h1>
      </div>

      <div className="max-w-xl space-y-6">
        {/* Passkey / MFA Settings */}
        <PasskeySettings />

        {/* Password Reset */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <KeyRound size={20} className="text-primary" />
            <h2 className="font-semibold">Reset hesla</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Na vas e-mail bude odoslany odkaz na zmenu hesla.
          </p>
          {resetSent ? (
            <Badge variant="success">Odkaz bol odoslany</Badge>
          ) : (
            <Button onClick={handleResetPassword} disabled={submitting}>
              {submitting ? "Odosielam..." : "Odoslat odkaz na reset hesla"}
            </Button>
          )}
        </div>

        {/* Deactivation Request */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <UserX size={20} className="text-destructive" />
            <h2 className="font-semibold">Deaktivacia uctu</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Poziadate o deaktivaciu svojho uctu. Ziadost musi byt schvalena
            administratorom.
          </p>
          {existingRequest ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">Stav ziadosti:</span>
              <Badge
                variant={
                  existingRequest.status === "pending"
                    ? "secondary"
                    : existingRequest.status === "approved"
                      ? "success"
                      : "destructive"
                }
              >
                {existingRequest.status === "pending"
                  ? "Cakajuca"
                  : existingRequest.status === "approved"
                    ? "Schvalena"
                    : "Zamietnuta"}
              </Badge>
            </div>
          ) : (
            <Button
              variant="destructive"
              onClick={() => setDeactivateOpen(true)}
            >
              Poziadat o deaktivaciu
            </Button>
          )}
        </div>
      </div>

      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ziadost o deaktivaciu uctu</DialogTitle>
            <DialogDescription>
              Tato akcia vyzaduje schvalenie administratorom. Mozete uviest
              dovod (volitelne).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeactivation} className="space-y-4">
            <div>
              <Label htmlFor="reason">Dovod (volitelne)</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Sem zadajte dovod..."
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setDeactivateOpen(false)}
              >
                Zrusit
              </Button>
              <Button variant="destructive" type="submit" disabled={submitting}>
                {submitting ? "Odosielam..." : "Odoslat ziadost"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
