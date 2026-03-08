"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Plus, Pencil, Trash2, Search } from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/feedback/emptyState"
import type { Company } from "@/types"

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [deleting, setDeleting] = useState<Company | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: "",
    dic: "",
    legalName: "",
    adminEmail: "",
    accessPointProviderId: "",
  })

  const fetchCompanies = useCallback(async () => {
    const res = await fetch("/api/admin/companies")
    const json = await res.json()
    setCompanies(json.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  const filtered = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dic.toLowerCase().includes(search.toLowerCase()) ||
      (c.legalName || "").toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() {
    setEditing(null)
    setForm({ name: "", dic: "", legalName: "", adminEmail: "", accessPointProviderId: "" })
    setDialogOpen(true)
  }

  function openEdit(company: Company) {
    setEditing(company)
    setForm({
      name: company.name,
      dic: company.dic,
      legalName: company.legalName || "",
      adminEmail: company.adminEmail || "",
      accessPointProviderId: company.accessPointProviderId || "",
    })
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const url = editing
      ? `/api/admin/companies/${editing.id}`
      : "/api/admin/companies"
    const method = editing ? "PUT" : "POST"

    const payload = editing
      ? { name: form.name, legalName: form.legalName, adminEmail: form.adminEmail, accessPointProviderId: form.accessPointProviderId }
      : form

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setDialogOpen(false)
      fetchCompanies()
    }

    setSubmitting(false)
  }

  async function handleDelete() {
    if (!deleting) return
    setSubmitting(true)

    const res = await fetch(`/api/admin/companies/${deleting.id}`, {
      method: "DELETE",
    })

    if (res.ok) {
      setDeleteDialogOpen(false)
      setDeleting(null)
      fetchCompanies()
    }

    setSubmitting(false)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 size={24} className="text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Spolocnosti
          </h1>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-2" />
          Pridat spolocnost
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Hladat podla nazvu alebo DIC..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Nacitavam...</div>
      ) : filtered.length > 0 ? (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DIC</TableHead>
                <TableHead>Obchodne meno</TableHead>
                <TableHead>Nazov</TableHead>
                <TableHead>Admin e-mail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Akcie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-mono">{company.dic}</TableCell>
                  <TableCell>{company.legalName || "—"}</TableCell>
                  <TableCell>{company.name}</TableCell>
                  <TableCell>{company.adminEmail || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={company.isActive ? "success" : "secondary"}>
                      {company.isActive ? "Aktivna" : "Neaktivna"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(company)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDeleting(company)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Building2 size={48} />}
          title="Ziadne spolocnosti"
          description="Pridajte spolocnost pomocou tlacidla vyssie."
        />
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Upravit spolocnost" : "Nova spolocnost"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Upravte udaje spolocnosti."
                : "Vyplnte udaje novej spolocnosti."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editing && (
              <div>
                <Label htmlFor="dic">DIC</Label>
                <Input
                  id="dic"
                  placeholder="SK1234567890"
                  value={form.dic}
                  onChange={(e) => setForm({ ...form, dic: e.target.value })}
                  required
                />
              </div>
            )}
            <div>
              <Label htmlFor="legalName">Obchodne meno</Label>
              <Input
                id="legalName"
                value={form.legalName}
                onChange={(e) =>
                  setForm({ ...form, legalName: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="name">Zobrazovany nazov</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="adminEmail">Admin e-mail</Label>
              <Input
                id="adminEmail"
                type="email"
                value={form.adminEmail}
                onChange={(e) =>
                  setForm({ ...form, adminEmail: e.target.value })
                }
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Ukladam..."
                  : editing
                    ? "Ulozit zmeny"
                    : "Vytvorit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vymazat spolocnost</DialogTitle>
            <DialogDescription>
              Naozaj chcete vymazat spolocnost{" "}
              <strong>{deleting?.name}</strong>? Tato akcia sa neda vratit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Zrusit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? "Mazem..." : "Vymazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
