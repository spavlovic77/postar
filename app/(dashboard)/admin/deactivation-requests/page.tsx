"use client"

import { useState, useEffect, useCallback } from "react"
import { ShieldAlert, Check, X } from "lucide-react"
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

interface DeactivationReq {
  id: string
  userId: string
  reason: string | null
  status: string
  processedBy: string | null
  processedAt: string | null
  createdAt: string
}

const statusLabels: Record<string, string> = {
  pending: "Cakajuca",
  approved: "Schvalena",
  rejected: "Zamietnuta",
}

const statusVariants: Record<string, "secondary" | "success" | "destructive"> = {
  pending: "secondary",
  approved: "success",
  rejected: "destructive",
}

export default function DeactivationRequestsPage() {
  const [requests, setRequests] = useState<DeactivationReq[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRequests = useCallback(async () => {
    const res = await fetch("/api/admin/deactivation-requests")
    const json = await res.json()
    setRequests(json.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  async function handleAction(id: string, action: "approve" | "reject") {
    await fetch(`/api/admin/deactivation-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    fetchRequests()
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <ShieldAlert size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">
          Ziadosti o deaktivaciu
        </h1>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Nacitavam...</div>
      ) : requests.length > 0 ? (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID pouzivatela</TableHead>
                <TableHead>Dovod</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="w-[120px]">Akcie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-mono text-xs">
                    {req.userId.slice(0, 8)}...
                  </TableCell>
                  <TableCell>{req.reason || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariants[req.status] || "secondary"}>
                      {statusLabels[req.status] || req.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(req.createdAt).toLocaleDateString("sk-SK")}
                  </TableCell>
                  <TableCell>
                    {req.status === "pending" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleAction(req.id, "approve")}
                          title="Schvalit"
                        >
                          <Check size={14} className="text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleAction(req.id, "reject")}
                          title="Zamietnut"
                        >
                          <X size={14} className="text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<ShieldAlert size={48} />}
          title="Ziadne ziadosti"
          description="Momentalne nie su ziadne ziadosti o deaktivaciu uctu."
        />
      )}
    </div>
  )
}
