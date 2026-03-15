"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Plus, Pencil, Trash2, Search, CheckCircle, RefreshCw, Cloud, CloudOff, Loader2, Mail, MailX, MailCheck, Send } from "lucide-react"
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
  const [retryingInviteId, setRetryingInviteId] = useState<string | null>(null)
  const [activatingIonApId, setActivatingIonApId] = useState<string | null>(null)
  const [form, setForm] = useState({
    dic: "",
    legalName: "",
    adminEmail: "",
    accessPointProviderId: "",
    pfsVerificationToken: "",
    status: "active" as CompanyStatus,
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
      accessPointProviderId: company.accessPointProviderId || "",
      pfsVerificationToken: company.pfsVerificationToken || "",
      status: (company.status as CompanyStatus) || "active",
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
      ? { 
          legalName: form.legalName, 
          adminEmail: form.adminEmail, 
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
      if (res.ok) {
        fetchCompanies()
      }
    } finally {
      setSyncingId(null)
    }
  }

  async function handleRetryInvitation(company: Company) {
    setRetryingInviteId(company.id)
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/retry-invitation`, {
        method: "POST",
      })
      if (res.ok) {
        fetchCompanies()
      }
    } finally {
      setRetryingInviteId(null)
    }
  }

  async function handleActivateIonAp(company: Company) {
    setActivatingIonApId(company.id)
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/activate-ionap`, {
        method: "POST",
      })
      if (res.ok) {
        fetchCompanies()
      }
    } finally {
      setActivatingIonApId(null)
    }
  }

  function getInvitationBadge(company: Company) {
    const status = company.invitationStatus
    const error = company.invitationError
    
    switch (status) {
      case "sent":
        return (
          <Badge variant="default" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
            <MailCheck size={12} />
            Odoslana
          </Badge>
        )
      case "accepted":
        return (
          <Badge variant="default" className="bg-green-50 text-green-700 border-green-200 gap-1">
            <MailCheck size={12} />
            Prijata
          </Badge>
        )
      case "failed":
        return (
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200 gap-1">
              <MailX size={12} />
              Zlyhala
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title={error || "Skusit znova odoslat pozvanie"}
              onClick={() => handleRetryInvitation(company)}
              disabled={retryingInviteId === company.id}
            >
              {retryingInviteId === company.id ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Send size={12} />
              )}
            </Button>
          </div>
        )
      case "pending":
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1">
            <Loader2 size={12} />
            Odosiela sa
          </Badge>
        )
      case "none":
      default:
        return company.adminEmail ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => handleRetryInvitation(company)}
            disabled={retryingInviteId === company.id}
          >
            {retryingInviteId === company.id ? (
              <Loader2 size={12} className="animate-spin mr-1" />
            ) : (
              <Mail size={12} className="mr-1" />
            )}
            Poslat
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">Chyba email</span>
        )
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
    // pending or null - show manual activation button
    return (
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-muted-foreground gap-1">
          <Loader2 size={12} />
          Caka
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Manualne aktivovat na ION AP"
          onClick={() => handleActivateIonAp(company)}
          disabled={activatingIonApId === company.id}
        >
          {activatingIonApId === company.id ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Cloud size={12} />
          )}
        </Button>
      </div>
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
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-2" />
          Pridat spolocnost
        </Button>
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
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
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
                <TableHead>Pozvanie</TableHead>
                <TableHead>ION AP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px]">Akcie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((company) => (
                <TableRow key={company.id} className={company.status === "draft" ? "bg-amber-50/50" : ""}>
                  <TableCell className="font-mono">{company.dic}</TableCell>
                  <TableCell>{company.legalName || <span className="text-muted-foreground italic">Nevyplnene</span>}</TableCell>
                  <TableCell>{company.adminEmail || "—"}</TableCell>
                  <TableCell>
                    {getInvitationBadge(company)}
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
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as CompanyStatus })}>
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
