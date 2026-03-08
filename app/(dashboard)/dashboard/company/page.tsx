"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Pencil } from "lucide-react"
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
import type { Company } from "@/types"

export default function AdminCompanyPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [editName, setEditName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const fetchCompanies = useCallback(async () => {
    const res = await fetch("/api/companies")
    const json = await res.json()
    setCompanies(json.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  function openEdit(company: Company) {
    setEditing(company)
    setEditName(company.name)
    setEditOpen(true)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSubmitting(true)
    await fetch(`/api/admin/companies/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    })
    setEditOpen(false)
    setSubmitting(false)
    fetchCompanies()
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Building2 size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">
          Moja spolocnost
        </h1>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Nacitavam...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {companies.map((company) => (
            <div
              key={company.id}
              className="rounded-lg border border-border bg-card p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {company.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{company.dic}</p>
                  {company.legalName && (
                    <p className="text-sm text-muted-foreground">
                      {company.legalName}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={company.isActive ? "success" : "secondary"}>
                    {company.isActive ? "Aktivna" : "Neaktivna"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(company)}
                  >
                    <Pencil size={14} />
                  </Button>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Peppol ID: {company.peppolParticipantId}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravit spolocnost</DialogTitle>
            <DialogDescription>
              Mozete zmenit zobrazovany nazov spolocnosti.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <Label htmlFor="editName">Zobrazovany nazov</Label>
              <Input
                id="editName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Ukladam..." : "Ulozit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
