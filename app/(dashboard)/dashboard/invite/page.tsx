"use client"

import { useState, useEffect, useCallback } from "react"
import { Mail, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Company, Invitation } from "@/types"

export default function InviteAccountantPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [email, setEmail] = useState("")
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const fetchData = useCallback(async () => {
    const [compRes, invRes] = await Promise.all([
      fetch("/api/companies"),
      fetch("/api/invitations"),
    ])
    const compJson = await compRes.json()
    const invJson = await invRes.json()
    setCompanies(compJson.data || [])
    setInvitations(invJson.data || [])
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function toggleCompany(id: string) {
    setSelectedCompanies((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSuccess(false)
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        role: "accountant",
        companyIds: selectedCompanies,
      }),
    })
    if (res.ok) {
      setEmail("")
      setSelectedCompanies([])
      setSuccess(true)
      fetchData()
    }
    setSubmitting(false)
  }

  async function cancelInvitation(id: string) {
    await fetch(`/api/invitations/${id}`, { method: "DELETE" })
    fetchData()
  }

  const pendingInvitations = invitations.filter(
    (inv) => inv.status === "pending"
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Mail size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">
          Pozvat uctovnika
        </h1>
      </div>

      <div className="max-w-xl">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail uctovnika</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@priklad.sk"
              required
            />
          </div>
          <div>
            <Label>Spolocnosti</Label>
            <div className="mt-2 space-y-2 rounded-md border border-border p-3">
              {companies.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCompanies.includes(c.id)}
                    onChange={() => toggleCompany(c.id)}
                    className="rounded border-input"
                  />
                  {c.name}{" "}
                  <span className="text-muted-foreground">({c.dic})</span>
                </label>
              ))}
            </div>
          </div>
          {success && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              Pozvanka bola uspesne odoslana.
            </div>
          )}
          <Button
            type="submit"
            disabled={submitting || selectedCompanies.length === 0}
          >
            <Send size={16} className="mr-2" />
            {submitting ? "Odosielam..." : "Odoslat pozvanku"}
          </Button>
        </form>
      </div>

      {pendingInvitations.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 font-semibold text-foreground">
            Cakajuce pozvanky
          </h2>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="w-[60px]">Akcia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">Cakajuca</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.createdAt).toLocaleDateString("sk-SK")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => cancelInvitation(inv.id)}
                      >
                        <X size={14} className="text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
