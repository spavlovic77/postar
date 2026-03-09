"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Mail,
  MoreHorizontal,
  RefreshCw,
  XCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Filter,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/feedback/emptyState"

interface Invitation {
  id: string
  email: string
  role: string
  status: "pending" | "accepted" | "expired" | "cancelled"
  invitedBy: string
  invitedByRole: string
  createdAt: string
  expiresAt: string
  companyIds: string[]
}

const statusLabels: Record<string, { label: string; variant: "default" | "success" | "destructive" | "secondary" | "outline" }> = {
  pending: { label: "Cakajuca", variant: "secondary" },
  accepted: { label: "Prijata", variant: "success" },
  expired: { label: "Expirovana", variant: "destructive" },
  cancelled: { label: "Zrusena", variant: "outline" },
}

const roleLabels: Record<string, string> = {
  superAdmin: "Super administrator",
  administrator: "Administrator",
  accountant: "Uctovnik",
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function isExpired(expiresAt: string) {
  return new Date(expiresAt) < new Date()
}

export default function AdminInvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchInvitations = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== "all") params.set("status", statusFilter)
    
    const res = await fetch(`/api/invitations?${params.toString()}`)
    const json = await res.json()
    setInvitations(json.data || [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  const filtered = invitations.filter((inv) =>
    inv.email.toLowerCase().includes(search.toLowerCase())
  )

  async function handleResend(id: string) {
    setActionLoading(id)
    const res = await fetch(`/api/invitations/${id}/resend`, { method: "POST" })
    if (res.ok) {
      fetchInvitations()
    } else {
      const data = await res.json()
      alert(data.error || "Nepodarilo sa znovu odoslat pozvanku")
    }
    setActionLoading(null)
  }

  async function handleCancel(id: string) {
    if (!confirm("Naozaj chcete zrusit tuto pozvanku?")) return
    setActionLoading(id)
    const res = await fetch(`/api/invitations/${id}/cancel`, { method: "POST" })
    if (res.ok) {
      fetchInvitations()
    } else {
      const data = await res.json()
      alert(data.error || "Nepodarilo sa zrusit pozvanku")
    }
    setActionLoading(null)
  }

  function openDetail(invitation: Invitation) {
    setSelectedInvitation(invitation)
    setDetailOpen(true)
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "pending":
        return <Clock size={14} className="text-muted-foreground" />
      case "accepted":
        return <CheckCircle size={14} className="text-green-600" />
      case "expired":
        return <AlertCircle size={14} className="text-destructive" />
      case "cancelled":
        return <XCircle size={14} className="text-muted-foreground" />
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail size={24} className="text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Pozvanky
          </h1>
        </div>
        <Button variant="outline" onClick={fetchInvitations} disabled={loading}>
          <RefreshCw size={16} className={`mr-2 ${loading ? "animate-spin" : ""}`} />
          Obnovit
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Input
            placeholder="Hladat podla e-mailu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Vsetky stavy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vsetky stavy</SelectItem>
              <SelectItem value="pending">Cakajuce</SelectItem>
              <SelectItem value="accepted">Prijate</SelectItem>
              <SelectItem value="expired">Expirovane</SelectItem>
              <SelectItem value="cancelled">Zrusene</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Nacitavam...</div>
      ) : filtered.length > 0 ? (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vytvorena</TableHead>
                <TableHead>Expiracia</TableHead>
                <TableHead className="w-[60px]">Akcie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => {
                const expired = isExpired(inv.expiresAt) && inv.status === "pending"
                const displayStatus = expired ? "expired" : inv.status
                const statusInfo = statusLabels[displayStatus] || { label: displayStatus, variant: "secondary" as const }
                
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {roleLabels[inv.role] ?? inv.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(displayStatus)}
                        <Badge variant={statusInfo.variant}>
                          {statusInfo.label}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(inv.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(inv.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            disabled={actionLoading === inv.id}
                          >
                            <MoreHorizontal size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDetail(inv)}>
                            <Eye size={14} className="mr-2" />
                            Zobrazit detail
                          </DropdownMenuItem>
                          {(inv.status === "pending" || expired) && (
                            <DropdownMenuItem 
                              onClick={() => handleResend(inv.id)}
                              disabled={actionLoading === inv.id}
                            >
                              <RefreshCw size={14} className="mr-2" />
                              Znovu odoslat
                            </DropdownMenuItem>
                          )}
                          {inv.status === "pending" && !expired && (
                            <DropdownMenuItem 
                              onClick={() => handleCancel(inv.id)}
                              className="text-destructive"
                              disabled={actionLoading === inv.id}
                            >
                              <XCircle size={14} className="mr-2" />
                              Zrusit pozvanku
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Mail size={48} />}
          title="Ziadne pozvanky"
          description="Zatial neboli odoslane ziadne pozvanky."
        />
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail pozvanky</DialogTitle>
            <DialogDescription>
              Informacie o pozvanke
            </DialogDescription>
          </DialogHeader>
          {selectedInvitation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">E-mail</p>
                  <p>{selectedInvitation.email}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Rola</p>
                  <p>{roleLabels[selectedInvitation.role] ?? selectedInvitation.role}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusIcon(selectedInvitation.status)}
                    <Badge variant={statusLabels[selectedInvitation.status]?.variant || "secondary"}>
                      {statusLabels[selectedInvitation.status]?.label || selectedInvitation.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Pozval</p>
                  <p>{roleLabels[selectedInvitation.invitedByRole] ?? selectedInvitation.invitedByRole}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Vytvorena</p>
                  <p>{formatDate(selectedInvitation.createdAt)}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Expiracia</p>
                  <p>{formatDate(selectedInvitation.expiresAt)}</p>
                </div>
              </div>
              {selectedInvitation.companyIds && selectedInvitation.companyIds.length > 0 && (
                <div>
                  <p className="font-medium text-muted-foreground text-sm mb-2">Priradene spolocnosti</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedInvitation.companyIds.map((id) => (
                      <Badge key={id} variant="outline">{id}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
