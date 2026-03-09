"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Users,
  Plus,
  MoreHorizontal,
  UserX,
  UserCheck,
  KeyRound,
  Mail,
} from "lucide-react"
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
  DialogFooter,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/feedback/emptyState"
import type { Company } from "@/types"

interface UserEntry {
  id: string
  userId: string
  role: string
  isActive: boolean
  createdAt: string
  user?: { email: string } | null
  companyAssignments?: { company: { id: string; legalName: string | null; dic: string } }[]
}

const roleLabels: Record<string, string> = {
  superAdmin: "Super administrator",
  administrator: "Administrator",
  accountant: "Uctovnik",
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserEntry[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "accountant" as "administrator" | "accountant",
    companyIds: [] as string[],
  })

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users")
    const json = await res.json()
    setUsers(json.data || [])
    setLoading(false)
  }, [])

  const fetchCompanies = useCallback(async () => {
    const res = await fetch("/api/admin/companies")
    const json = await res.json()
    setCompanies(json.data || [])
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchCompanies()
  }, [fetchUsers, fetchCompanies])

  const filtered = users.filter((u) =>
    (u.user?.email || "").toLowerCase().includes(search.toLowerCase())
  )

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inviteForm),
    })
    if (res.ok) {
      setInviteOpen(false)
      setInviteForm({ email: "", role: "accountant", companyIds: [] })
      fetchUsers()
    }
    setSubmitting(false)
  }

  async function deactivateUser(userId: string) {
    await fetch(`/api/admin/users/${userId}/deactivate`, { method: "PUT" })
    fetchUsers()
  }

  async function reactivateUser(userId: string) {
    await fetch(`/api/admin/users/${userId}/reactivate`, { method: "PUT" })
    fetchUsers()
  }

  async function resetPassword(userId: string, email: string) {
    await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
  }

  function toggleCompany(companyId: string) {
    setInviteForm((prev) => ({
      ...prev,
      companyIds: prev.companyIds.includes(companyId)
        ? prev.companyIds.filter((id) => id !== companyId)
        : [...prev.companyIds, companyId],
    }))
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={24} className="text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Pouzivatelia
          </h1>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus size={16} className="mr-2" />
          Pozvat pouzivatela
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Input
          placeholder="Hladat podla e-mailu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-3"
        />
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
                <TableHead>Spolocnosti</TableHead>
                <TableHead className="w-[60px]">Akcie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.user?.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {roleLabels[entry.role] ?? entry.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={entry.isActive !== false ? "success" : "destructive"}
                    >
                      {entry.isActive !== false ? "Aktivny" : "Neaktivny"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {entry.companyAssignments?.map((ca) => (
                        <Badge key={ca.company.id} variant="outline">
                          {ca.company.legalName || ca.company.dic}
                        </Badge>
                      )) || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {entry.role !== "superAdmin" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              resetPassword(
                                entry.userId,
                                entry.user?.email ?? ""
                              )
                            }
                          >
                            <KeyRound size={14} className="mr-2" />
                            Reset hesla
                          </DropdownMenuItem>
                          {entry.isActive !== false ? (
                            <DropdownMenuItem
                              onClick={() => deactivateUser(entry.userId)}
                              className="text-destructive"
                            >
                              <UserX size={14} className="mr-2" />
                              Deaktivovat
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => reactivateUser(entry.userId)}
                            >
                              <UserCheck size={14} className="mr-2" />
                              Reaktivovat
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Users size={48} />}
          title="Ziadni pouzivatelia"
          description="Pozvite pouzivatelov pomocou tlacidla vyssie."
        />
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pozvat pouzivatela</DialogTitle>
            <DialogDescription>
              Pozvanka bude odoslana na zadany e-mail.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <Label htmlFor="invEmail">E-mail</Label>
              <Input
                id="invEmail"
                type="email"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, email: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="invRole">Rola</Label>
              <select
                id="invRole"
                value={inviteForm.role}
                onChange={(e) =>
                  setInviteForm({
                    ...inviteForm,
                    role: e.target.value as "administrator" | "accountant",
                  })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="accountant">Uctovnik</option>
                <option value="administrator">Administrator</option>
              </select>
            </div>
            <div>
              <Label>Spolocnosti</Label>
              <div className="mt-2 max-h-40 space-y-2 overflow-auto rounded-md border border-border p-3">
                {companies.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={inviteForm.companyIds.includes(c.id)}
                      onChange={() => toggleCompany(c.id)}
                      className="rounded border-input"
                    />
                    {c.legalName || c.dic}{" "}
                    <span className="text-muted-foreground">({c.dic})</span>
                  </label>
                ))}
                {companies.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Ziadne spolocnosti
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  submitting || inviteForm.companyIds.length === 0
                }
              >
                <Mail size={16} className="mr-2" />
                {submitting ? "Odosielam..." : "Odoslat pozvanku"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
