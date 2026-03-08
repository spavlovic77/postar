"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  sendDocumentSchema,
  type SendDocumentInput,
} from "@/lib/validations/document"
import { useCompanyStore } from "@/stores/companyStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export function SendDocumentForm() {
  const { selectedCompany } = useCompanyStore()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<SendDocumentInput>({
    resolver: zodResolver(sendDocumentSchema),
    defaultValues: {
      companyId: selectedCompany?.id ?? "",
      documentType: "invoice",
    },
  })

  const onSubmit = async (data: SendDocumentInput) => {
    try {
      const response = await fetch("/api/sapiSk/documents/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error ?? "Chyba pri odosielaní dokumentu")
        return
      }

      toast.success("Dokument bol úspešne odoslaný")
      reset()
    } catch {
      toast.error("Chyba pri odosielaní dokumentu")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="documentId">ID dokumentu</Label>
        <Input
          id="documentId"
          {...register("documentId")}
          aria-invalid={!!errors.documentId}
          aria-describedby={
            errors.documentId ? "documentId-error" : undefined
          }
        />
        {errors.documentId && (
          <p id="documentId-error" className="mt-1 text-sm text-destructive">
            {errors.documentId.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="receiverParticipantId">
          Peppol ID príjemcu
        </Label>
        <Input
          id="receiverParticipantId"
          placeholder="0245:SK2020123456"
          {...register("receiverParticipantId")}
          aria-invalid={!!errors.receiverParticipantId}
          aria-describedby={
            errors.receiverParticipantId
              ? "receiverParticipantId-error"
              : undefined
          }
        />
        {errors.receiverParticipantId && (
          <p
            id="receiverParticipantId-error"
            className="mt-1 text-sm text-destructive"
          >
            {errors.receiverParticipantId.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="payload">XML obsah</Label>
        <textarea
          id="payload"
          {...register("payload")}
          rows={10}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
          aria-invalid={!!errors.payload}
          aria-describedby={errors.payload ? "payload-error" : undefined}
        />
        {errors.payload && (
          <p id="payload-error" className="mt-1 text-sm text-destructive">
            {errors.payload.message}
          </p>
        )}
      </div>

      <input type="hidden" {...register("companyId")} />
      <input type="hidden" {...register("documentType")} />

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Odosielam..." : "Odoslať dokument"}
      </Button>
    </form>
  )
}
