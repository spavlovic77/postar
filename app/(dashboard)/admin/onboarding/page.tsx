"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Rocket,
  RotateCw,
  RefreshCw,
  Cloud,
  CloudOff,
  Loader2,
  Mail,
  MailX,
  MailCheck,
  AlertTriangle,
  CheckCircle,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/feedback/emptyState"

interface OnboardingCompany {
  id: string
  dic: string
  legalName: string | null
  adminEmail: string | null
  status: string
  ionApStatus: string | null
  ionApError: string | null
  ionApOrgId: number | null
  invitationStatus: string | null
  invitationError: string | null
  createdAt: string
}

interface FailedAssignment {
  id: string
  userId: string
  companyId: string
  ionApUserId: number | null
  ionApUserStatus: string | null
  ionApUserError: string | null
  userEmail: string | null
  companyDic: string | null
  companyName: string | null
}

export default function AdminOnboardingPage() {
  const [companies, setCompanies] = useState<OnboardingCompany[]>([])
  const [allCompanies, setAllCompanies] = useState<OnboardingCompany[]>([])
  const [failedAssignments, setFailedAssignments] = useState<FailedAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Invite dialog
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteCompany, setInviteCompany] = useState<OnboardingCompany | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteSubmitting, setInviteSubmitting] = useState(false)

  // ION AP company retry
  const [syncingCompanyId, setSyncingCompanyId] = useState<string | null>(null)

  // ION AP user retry
  const [syncingAssignmentId, setSyncingAssignmentId] = useState<string | null>(null)

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const res = await fetch("/api/admin/onboarding")
      const json = await res.json()
      setCompanies(json.companies || [])
      setAllCompanies(json.allCompanies || [])
      setFailedAssignments(json.failedUserAssignments || [])
    } finally {
      setLoading(false)
      if (showRefresh) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function openInviteDialog(company: OnboardingCompany) {
    setInviteCompany(company)
    setInviteEmail(company.adminEmail || "")
    setInviteDialogOpen(true)
  }

  async function handleSendInvite() {
    if (!inviteCompany) return
    setInviteSubmitting(true)
    try {
      const res = await fetch(`/api/admin/onboarding/${inviteCompany.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: inviteEmail || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(`Odoslanie pozvanky zlyhalo: ${json.error || "Neznama chyba"}`)
      }
      setInviteDialogOpen(false)
      fetchData()
    } finally {
      setInviteSubmitting(false)
    }
  }

  async function handleIonApCompanyRetry(companyId: string) {
    setSyncingCompanyId(companyId)
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/ion-ap-sync`, {
        method: "POST",
      })
      if (!res.ok) {
        const json = await res.json()
        alert(`ION AP sync zlyhalo: ${json.error || "Neznama chyba"}`)
      }
      fetchData()
    } finally {
      setSyncingCompanyId(null)
    }
  }

  async function handleIonApUserRetry(assignmentId: string) {
    setSyncingAssignmentId(assignmentId)
    try {
      const res = await fetch(`/api/admin/assignments/${assignmentId}/ion-ap-user-sync`, {
        method: "POST",
      })
      if (!res.ok) {
        const json = await res.json()
        alert(`ION AP user sync zlyhalo: ${json.error || "Neznama chyba"}`)
      }
      fetchData()
    } finally {
      setSyncingAssignmentId(null)
    }
  }

  function getIonApBadge(company: OnboardingCompany) {
    if (company.ionApStatus === "success") {
      return <Badge variant="success"><Cloud size={12} className="mr-1" />OK</Badge>
    }
    if (company.ionApStatus === "failed") {
      return (
        <Badge variant="destructive" title={company.ionApError || ""}>
          <CloudOff size={12} className="mr-1" />Zlyhalo
        </Badge>
      )
    }
    if (company.ionApStatus === "pending") {
      return <Badge variant="secondary"><Loader2 size={12} className="mr-1 animate-spin" />Caka</Badge>
    }
    return <Badge variant="outline">—</Badge>
  }

  function getInvitationBadge(company: OnboardingCompany) {
    if (company.invitationStatus === "success") {
      return <Badge variant="success"><MailCheck size={12} className="mr-1" />Odoslana</Badge>
    }
    if (company.invitationStatus === "failed") {
      return (
        <Badge variant="destructive" title={company.invitationError || ""}>
          <MailX size={12} className="mr-1" />Zlyhalo
        </Badge>
      )
    }
    if (company.invitationStatus === "skipped") {
      return (
        <Badge variant="secondary" title={company.invitationError || "Chyba email"}>
          <AlertTriangle size={12} className="mr-1" />Preskocena
        </Badge>
      )
    }
    if (company.invitationStatus === "pending") {
      return <Badge variant="secondary"><Loader2 size={12} className="mr-1 animate-spin" />Odosiela sa</Badge>
    }
    // null — not attempted yet
    if (company.ionApStatus === "success") {
      return <Badge variant="outline"><Mail size={12} className="mr-1" />Neodoslana</Badge>
    }
    return <Badge variant="outline">—</Badge>
  }

  // Stats
  const totalCompanies = allCompanies.length
  const successfulOnboarding = allCompanies.filter(
    c => c.ionApStatus === "success" && c.invitationStatus === "success"
  ).length
  const issueCount = companies.length + failedAssignments.length

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Rocket size={24} className="text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">Onboarding</h1>
          {issueCount > 0 && (
            <Badge variant="destructive">{issueCount} problemov</Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          title="Obnovit"
        >
          <RotateCw size={16} className={refreshing ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <div className="rounded-md border border-border p-3 text-center min-w-[120px]">
          <div className="text-2xl font-bold">{totalCompanies}</div>
          <div className="text-xs text-muted-foreground">Spolocnosti</div>
        </div>
        <div className="rounded-md border border-border p-3 text-center min-w-[120px]">
          <div className="text-2xl font-bold text-green-600">{successfulOnboarding}</div>
          <div className="text-xs text-muted-foreground">Kompletne</div>
        </div>
        <div className="rounded-md border border-border p-3 text-center min-w-[120px]">
          <div className="text-2xl font-bold text-red-600">{issueCount}</div>
          <div className="text-xs text-muted-foreground">Problemy</div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Nacitavam...</div>
      ) : (
        <>
          {/* Company issues */}
          <div>
            <h2 className="text-lg font-medium mb-3">Spolocnosti s problemami</h2>
            {companies.length > 0 ? (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DIC</TableHead>
                      <TableHead>Nazov</TableHead>
                      <TableHead>Admin e-mail</TableHead>
                      <TableHead>ION AP</TableHead>
                      <TableHead>Pozvanka</TableHead>
                      <TableHead>Chyba</TableHead>
                      <TableHead className="w-[180px]">Akcie</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell className="font-mono text-sm">{company.dic}</TableCell>
                        <TableCell>{company.legalName || "—"}</TableCell>
                        <TableCell className="text-sm">{company.adminEmail || <span className="text-muted-foreground">chyba</span>}</TableCell>
                        <TableCell>{getIonApBadge(company)}</TableCell>
                        <TableCell>{getInvitationBadge(company)}</TableCell>
                        <TableCell className="text-xs text-destructive max-w-[200px] truncate" title={company.ionApError || company.invitationError || ""}>
                          {company.ionApError || company.invitationError || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {company.ionApStatus === "failed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleIonApCompanyRetry(company.id)}
                                disabled={syncingCompanyId === company.id}
                              >
                                {syncingCompanyId === company.id ? (
                                  <Loader2 size={14} className="animate-spin mr-1" />
                                ) : (
                                  <RefreshCw size={14} className="mr-1" />
                                )}
                                ION AP
                              </Button>
                            )}
                            {(company.invitationStatus === "failed" ||
                              company.invitationStatus === "skipped" ||
                              (company.ionApStatus === "success" && !company.invitationStatus)) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openInviteDialog(company)}
                              >
                                <Mail size={14} className="mr-1" />
                                Pozvat
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<CheckCircle size={48} className="text-green-500" />}
                title="Ziadne problemy"
                description="Vsetky spolocnosti su uspesne zaregistrovane a pozvanky odoslane."
              />
            )}
          </div>

          {/* Failed user assignments */}
          <div>
            <h2 className="text-lg font-medium mb-3">Zlyhane ION AP pouzivatelske ucty</h2>
            {failedAssignments.length > 0 ? (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DIC</TableHead>
                      <TableHead>Spolocnost</TableHead>
                      <TableHead>E-mail pouzivatela</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Chyba</TableHead>
                      <TableHead className="w-[100px]">Akcie</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failedAssignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-mono text-sm">{assignment.companyDic || "—"}</TableCell>
                        <TableCell>{assignment.companyName || "—"}</TableCell>
                        <TableCell className="text-sm">{assignment.userEmail || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={assignment.ionApUserStatus === "failed" ? "destructive" : "secondary"}>
                            {assignment.ionApUserStatus === "failed" ? (
                              <><CloudOff size={12} className="mr-1" />Zlyhalo</>
                            ) : (
                              <><Loader2 size={12} className="mr-1 animate-spin" />Caka</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-destructive max-w-[200px] truncate" title={assignment.ionApUserError || ""}>
                          {assignment.ionApUserError || "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleIonApUserRetry(assignment.id)}
                            disabled={syncingAssignmentId === assignment.id}
                          >
                            {syncingAssignmentId === assignment.id ? (
                              <Loader2 size={14} className="animate-spin mr-1" />
                            ) : (
                              <RefreshCw size={14} className="mr-1" />
                            )}
                            Skusit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<CheckCircle size={48} className="text-green-500" />}
                title="Ziadne problemy"
                description="Vsetky ION AP pouzivatelske ucty su vytvorene uspesne."
              />
            )}
          </div>

          {/* All companies overview */}
          <div>
            <h2 className="text-lg font-medium mb-3">Prehlad vsetkych spolocnosti</h2>
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DIC</TableHead>
                    <TableHead>Nazov</TableHead>
                    <TableHead>ION AP</TableHead>
                    <TableHead>Pozvanka</TableHead>
                    <TableHead>Datum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-mono text-sm">{company.dic}</TableCell>
                      <TableCell>{company.legalName || "—"}</TableCell>
                      <TableCell>{getIonApBadge(company)}</TableCell>
                      <TableCell>{getInvitationBadge(company)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(company.createdAt).toLocaleDateString("sk")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odoslat pozvanku administratorovi</DialogTitle>
            <DialogDescription>
              Pozvanka bude odoslana na zadany e-mail pre spolocnost{" "}
              <strong>{inviteCompany?.legalName || inviteCompany?.dic}</strong>.
            </DialogDescription>
          </DialogHeader>

          {inviteCompany?.invitationError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <strong>Posledna chyba:</strong> {inviteCompany.invitationError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="inviteEmail">E-mail administratora</Label>
              <Input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="admin@spolocnost.sk"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Zrusit
            </Button>
            <Button
              onClick={handleSendInvite}
              disabled={inviteSubmitting || !inviteEmail.includes("@")}
            >
              {inviteSubmitting ? (
                <><Loader2 size={16} className="animate-spin mr-2" />Odosiela sa...</>
              ) : (
                <><Mail size={16} className="mr-2" />Odoslat pozvanku</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
