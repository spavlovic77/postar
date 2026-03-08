"use client"

import { useState } from "react"
import { useDocuments } from "@/hooks/useDocuments"
import { useCompanyStore } from "@/stores/companyStore"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DocumentSlideOver } from "./documentSlideOver"
import { SkeletonTable } from "@/components/feedback/skeletonTable"
import { EmptyState } from "@/components/feedback/emptyState"
import { formatDate } from "@/lib/formatting"
import { Search, ArrowUpDown, FileText } from "lucide-react"

interface DocumentTableProps {
  direction: "sent" | "received"
}

const statusConfig = {
  ACCEPTED: { label: "Prijaté", variant: "default" as const },
  RECEIVED: { label: "Doručené", variant: "warning" as const },
  ACKNOWLEDGED: { label: "Potvrdené", variant: "success" as const },
}

export function DocumentTable({ direction }: DocumentTableProps) {
  const { selectedCompany } = useCompanyStore()
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<"createdAt" | "documentId">(
    "createdAt"
  )
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)

  const { data, isLoading } = useDocuments({
    companyId: selectedCompany?.id,
    direction,
    search,
    sortField,
    sortOrder,
  })

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
  }

  if (!selectedCompany) {
    return (
      <EmptyState
        icon={<FileText size={48} />}
        title="Vyberte spoločnosť"
        description="Pre zobrazenie dokumentov vyberte spoločnosť v hornej lište."
      />
    )
  }

  if (isLoading) {
    return <SkeletonTable rows={5} columns={5} />
  }

  if (!data?.documents?.length) {
    return (
      <EmptyState
        icon={<FileText size={48} />}
        title={
          direction === "received"
            ? "Žiadne prijaté dokumenty"
            : "Žiadne odoslané dokumenty"
        }
        description={
          direction === "received"
            ? "Keď dostanete nové faktúry, objavia sa tu."
            : "Odoslané faktúry a dobropisy sa zobrazia tu."
        }
        action={
          direction === "sent" ? (
            <Button>Odoslať dokument</Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Hľadať dokumenty..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort("documentId")}
                  className="-ml-3 h-8"
                >
                  ID dokumentu
                  <ArrowUpDown size={14} className="ml-2" />
                </Button>
              </TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>
                {direction === "sent" ? "Príjemca" : "Odosielateľ"}
              </TableHead>
              <TableHead>Stav</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort("createdAt")}
                  className="-ml-3 h-8"
                >
                  Dátum
                  <ArrowUpDown size={14} className="ml-2" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.documents.map(
              (doc: {
                id: string
                documentId: string
                documentType: string
                receiverParticipantId: string
                senderParticipantId: string
                status: "ACCEPTED" | "RECEIVED" | "ACKNOWLEDGED"
                createdAt: string
              }) => (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedDocId(doc.id)}
                >
                  <TableCell className="font-medium">
                    {doc.documentId}
                  </TableCell>
                  <TableCell>
                    {doc.documentType === "invoice" ? "Faktúra" : "Dobropis"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {direction === "sent"
                      ? doc.receiverParticipantId
                      : doc.senderParticipantId}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={statusConfig[doc.status]?.variant ?? "default"}
                    >
                      {statusConfig[doc.status]?.label ?? doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(doc.createdAt)}
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </div>

      <DocumentSlideOver
        documentId={selectedDocId}
        open={!!selectedDocId}
        onClose={() => setSelectedDocId(null)}
      />
    </>
  )
}
