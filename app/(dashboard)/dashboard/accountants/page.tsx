"use client"

import { useState, useEffect, useCallback } from "react"
import { Users, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/feedback/emptyState"

interface AccountantEntry {
  id: string
  userId: string
  role: string
  isActive: boolean
  user?: { email: string } | null
  companyAssignments?: { company: { id: string; name: string } }[]
}

export default function AccountantsPage() {
  const [accountants, setAccountants] = useState<AccountantEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAccountants = useCallback(async () => {
    const res = await fetch("/api/users")
    const json = await res.json()
    const all = json.data || []
    setAccountants(all.filter((u: AccountantEntry) => u.role === "accountant"))
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAccountants()
  }, [fetchAccountants])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Users size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">Uctovnici</h1>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Nacitavam...</div>
      ) : accountants.length > 0 ? (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Spolocnosti</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountants.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.user?.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entry.isActive !== false ? "success" : "destructive"
                      }
                    >
                      {entry.isActive !== false ? "Aktivny" : "Neaktivny"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {entry.companyAssignments?.map((ca) => (
                        <Badge key={ca.company.id} variant="outline">
                          {ca.company.name}
                        </Badge>
                      )) || "—"}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Users size={48} />}
          title="Ziadni uctovnici"
          description="Pozvite uctovnikov cez sekciu Pozvat uctovnika."
        />
      )}
    </div>
  )
}
