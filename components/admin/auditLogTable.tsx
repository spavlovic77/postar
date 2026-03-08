"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/formatting"
import type { AuditLog } from "@/types"

interface AuditLogTableProps {
  logs: AuditLog[]
}

export function AuditLogTable({ logs }: AuditLogTableProps) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Čas</TableHead>
            <TableHead>Akcia</TableHead>
            <TableHead>Výsledok</TableHead>
            <TableHead>IP adresa</TableHead>
            <TableHead>HTTP</TableHead>
            <TableHead>Stav</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-muted-foreground">
                {formatDate(log.timestamp)}
              </TableCell>
              <TableCell className="font-medium">{log.action}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    log.outcome === "success" ? "success" : "destructive"
                  }
                >
                  {log.outcome === "success" ? "Úspech" : "Chyba"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {log.sourceIp}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {log.requestMethod}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {log.responseStatus}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
