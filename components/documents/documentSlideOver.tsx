"use client"

import { useDocument } from "@/hooks/useDocument"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/formatting"
import { Check, Download, FileText } from "lucide-react"
import { useAcknowledgeDocument } from "@/hooks/useAcknowledgeDocument"
import { useCompanyStore } from "@/stores/companyStore"
import { toast } from "sonner"

interface DocumentSlideOverProps {
  documentId: string | null
  open: boolean
  onClose: () => void
}

export function DocumentSlideOver({
  documentId,
  open,
  onClose,
}: DocumentSlideOverProps) {
  const { data: document, isLoading } = useDocument(documentId)
  const { mutate: acknowledge, isPending } = useAcknowledgeDocument()
  const { selectedCompany } = useCompanyStore()

  const handleAcknowledge = () => {
    if (!documentId || !selectedCompany) return

    acknowledge(
      { documentId, companyId: selectedCompany.id },
      {
        onSuccess: () => {
          toast.success("Dokument bol potvrdený")
        },
        onError: () => {
          toast.error("Chyba pri potvrdzovaní dokumentu")
        },
      }
    )
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText size={20} />
            Detail dokumentu
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : document ? (
          <div className="mt-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">ID dokumentu</p>
                <p className="text-lg font-semibold">{document.documentId}</p>
              </div>
              <Badge
                variant={
                  document.status === "ACKNOWLEDGED" ? "success" : "warning"
                }
              >
                {document.status === "ACKNOWLEDGED"
                  ? "Potvrdené"
                  : "Čaká na potvrdenie"}
              </Badge>
            </div>

            <Separator />

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Typ</dt>
                <dd className="font-medium">
                  {document.documentType === "invoice"
                    ? "Faktúra"
                    : "Dobropis"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dátum</dt>
                <dd className="font-medium">
                  {formatDate(document.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Odosielateľ</dt>
                <dd className="font-medium">
                  {document.senderParticipantId}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Príjemca</dt>
                <dd className="font-medium">
                  {document.receiverParticipantId}
                </dd>
              </div>
            </dl>

            <Separator />

            <div className="flex flex-col gap-3">
              {document.direction === "received" &&
                document.status !== "ACKNOWLEDGED" && (
                  <Button
                    onClick={handleAcknowledge}
                    disabled={isPending}
                    className="w-full"
                  >
                    <Check size={16} className="mr-2" />
                    {isPending ? "Potvrdzujem..." : "Potvrdiť prijatie"}
                  </Button>
                )}
              <Button variant="outline" className="w-full">
                <Download size={16} className="mr-2" />
                Stiahnuť XML
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-muted-foreground">
            Dokument sa nenašiel.
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}
