"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Plus, Pencil, Trash2, Search, CheckCircle, RefreshCw, Cloud, CloudOff, Loader2, RotateCw } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/feedback/emptyState"
import type { Company } from "@/types"

type CompanyStatus = "draft" | "active" | "suspended"

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | CompanyStatus>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [deleting, setDeleting] = useState<Company | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [form, setForm] = useState({
    dic: "",
    legalName: "",
    adminEmail: "",
    adminPhone: "",
    accessPointProviderId: "",
    pfsVerificationToken: "",
    status: "active" as CompanyStatus,
  })

  const fetchCompanies = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    const res = await fetch("/api/admin/companies")
    const json = await res.json()
    setCompanies(json.data || [])
    setLoading(false)
    if (showRefresh) setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  const filtered = companies.filter((c) => {
    const matchesSearch =
      c.dic.toLowerCase().includes(search.toLowerCase()) ||
      (c.legalName || "").toLowerCase().includes(search.toLowerCase())
    
    const matchesStatus = statusFilter === "all" || c.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  // Count draft companies for badge
  const draftCount = companies.filter(c => c.status === "draft").length

  function openCreate() {
    setEditing(null)
    setForm({
      dic: "",
      legalName: "",
      adminEmail: "",
      adminPhone: "",
      accessPointProviderId: "",
      pfsVerificationToken: "",
      status: "active",
    })
    setDialogOpen(true)
  }

  function openEdit(company: Company) {
    setEditing(company)
    setForm({
      dic: company.dic,
      legalName: company.legalName || "",
      adminEmail: company.adminEmail || "",
      adminPhone: company.adminPhone || "",
      accessPointProviderId: company.accessPointProviderId || "",
      pfsVerificationToken: company.pfsVerificationToken || "",
      status: (company.status as CompanyStatus) || "active",
    })
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)

    const url = editing
      ? `/api/admin/companies/${editing.id}`
      : "/api/admin/companies"
    const method = editing ? "PUT" : "POST"

    const payload = editing
      ? {
          legalName: form.legalName,
          adminEmail: form.adminEmail,
          adminPhone: form.adminPhone,
          accessPointProviderId: form.accessPointProviderId,
          pfsVerificationToken: form.pfsVerificationToken,
          status: form.status,
        }
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

  async function activateCompany(company: Company) {
    const res = await fetch(`/api/admin/companies/${company.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    })

    if (res.ok) {
      fetchCompanies()
    }
  }

  async function handleIonApSync(company: Company) {
    setSyncingId(company.id)
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/ion-ap-sync`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        alert(`ION AP sync zlyhalo: ${json.error || "Neznama chyba"}`)
      }
      fetchCompanies()
    } finally {
      setSyncingId(null)
    }
  }

  async function handleSaveAndResubmit() {
    if (!editing) return
    setSubmitting(true)

    // First save the company data
    const payload = {
      legalName: form.legalName,
      adminEmail: form.adminEmail,
      adminPhone: form.adminPhone,
      accessPointProviderId: form.accessPointProviderId,
      pfsVerificationToken: form.pfsVerificationToken,
      status: form.status,
    }

    const res = await fetch(`/api/admin/companies/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      setSubmitting(false)
      return
    }

    setDialogOpen(false)

    // Then trigger ION AP sync
    setSyncingId(editing.id)
    try {
      const syncRes = await fetch(`/api/admin/companies/${editing.id}/ion-ap-sync`, {
        method: "POST",
      })
      const json = await syncRes.json()
      if (!syncRes.ok) {
        alert(`ION AP sync zlyhalo: ${json.error || "Neznama chyba"}`)
      }
    } finally {
      setSyncingId(null)
      setSubmitting(false)
      fetchCompanies()
    }
  }

  function getIonApBadge(company: Company) {
    if (company.ionApStatus === "success") {
      return (
        <Badge variant="default" className="bg-green-50 text-green-700 border-green-200 gap-1">
          <Cloud size={12} />
          ION #{company.ionApOrgId}
        </Badge>
      )
    }
    if (company.ionApStatus === "failed") {
      return (
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200 gap-1">
            <CloudOff size={12} />
            Zlyhalo
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title={company.ionApError || "Skusit znova"}
            onClick={() => handleIonApSync(company)}
            disabled={syncingId === company.id}
          >
            {syncingId === company.id ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
          </Button>
        </div>
      )
    }
    // pending or null
    return (
      <Badge variant="outline" className="text-muted-foreground gap-1">
        <Loader2 size={12} />
        Caka
      </Badge>
    )
  }

  function getStatusBadge(status: string | undefined) {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Koncept</Badge>
      case "active":
        return <Badge variant="default" className="bg-green-50 text-green-700 border-green-200">Aktivna</Badge>
      case "suspended":
        return <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">Pozastavena</Badge>
      default:
        return <Badge variant="secondary">Neznamy</Badge>
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 size={24} className="text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Spolocnosti
          </h1>
          {draftCount > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700">
              {draftCount} na dokoncenie
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchCompanies(true)}
            disabled={refreshing}
            title="Obnovit zoznam"
          >
            <RotateCw size={16} className={refreshing ? "animate-spin" : ""} />
          </Button>
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-2" />
            Pridat spolocnost
          </Button>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative max-w-sm flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Hladat podla DIC alebo obchodneho mena..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Vsetky statusy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vsetky statusy</SelectItem>
            <SelectItem value="draft">Koncept</SelectItem>
            <SelectItem value="active">Aktivne</SelectItem>
            <SelectItem value="suspended">Pozastavene</SelectItem>
          </SelectContent>
        </Select>
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
                <TableHead>Admin e-mail</TableHead>
                <TableHead>PFS Token</TableHead>
                <TableHead>ION AP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[140px]">Akcie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((company) => (
                <TableRow key={company.id} className={company.status === "draft" ? "bg-amber-50/50" : ""}>
                  <TableCell className="font-mono">{company.dic}</TableCell>
                  <TableCell>{company.legalName || <span className="text-muted-foreground italic">Nevyplnene</span>}</TableCell>
                  <TableCell>{company.adminEmail || "—"}</TableCell>
                  <TableCell>
                    {company.pfsVerificationToken ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {company.pfsVerificationToken.substring(0, 12)}...
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {getIonApBadge(company)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(company.status)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {company.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Aktivovat spolocnost"
                          onClick={() => openEdit(company)}
                        >
                          <CheckCircle size={14} className="text-green-600" />
                        </Button>
                      )}
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
                ? editing.status === "draft" 
                  ? "Dokoncite registraciu spolocnosti vyplnenim udajov."
                  : "Upravte udaje spolocnosti."
                : "Vyplnte udaje novej spolocnosti."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editing && (
              <div>
                <Label htmlFor="dic">DIC</Label>
                <Input
                  id="dic"
                  placeholder="2020123456"
                  value={form.dic}
                  onChange={(e) => setForm({ ...form, dic: e.target.value })}
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Presne 10 cislic, bez SK prefixu
                </p>
              </div>
            )}
            {editing && (
              <div>
                <Label>DIC</Label>
                <p className="font-mono text-sm py-2">{form.dic}</p>
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
            <div>
              <Label htmlFor="adminPhone">Admin telefon</Label>
              <Input
                id="adminPhone"
                type="tel"
                value={form.adminPhone}
                onChange={(e) =>
                  setForm({ ...form, adminPhone: e.target.value })
                }
                placeholder="+421..."
              />
            </div>
            <div>
              <Label htmlFor="pfsVerificationToken">PFS Verifikacny token</Label>
              <Input
                id="pfsVerificationToken"
                value={form.pfsVerificationToken}
                onChange={(e) =>
                  setForm({ ...form, pfsVerificationToken: e.target.value })
                }
                placeholder="Automaticky z webhooku alebo zadajte manualne"
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(v: string) => setForm({ ...form, status: v as CompanyStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Koncept</SelectItem>
                  <SelectItem value="active">Aktivna</SelectItem>
                  <SelectItem value="suspended">Pozastavena</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editing && editing.ionApStatus === "failed" && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                <p className="font-medium">ION AP registracia zlyhala</p>
                <p className="text-xs mt-1 text-red-600">{editing.ionApError}</p>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              {editing && (editing.ionApStatus === "failed" || editing.ionApStatus === "pending") && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={handleSaveAndResubmit}
                  className="border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <Cloud size={14} className="mr-2" />
                  {submitting ? "Ukladam..." : "Ulozit a odoslat do ION AP"}
                </Button>
              )}
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
              <strong>{deleting?.legalName || deleting?.dic}</strong>? Tato akcia sa neda vratit.
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
