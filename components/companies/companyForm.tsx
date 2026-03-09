"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { companySchema, type CompanyInput } from "@/lib/validations/document"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

interface CompanyFormProps {
  onSuccess?: () => void
  defaultValues?: Partial<CompanyInput>
  isEditing?: boolean
  companyId?: string
}

export function CompanyForm({ onSuccess, defaultValues, isEditing, companyId }: CompanyFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CompanyInput>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      status: "active",
      ...defaultValues,
    },
  })

  const onSubmit = async (data: CompanyInput) => {
    try {
      const url = isEditing ? `/api/companies/${companyId}` : "/api/companies"
      const method = isEditing ? "PATCH" : "POST"
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error ?? "Chyba pri ukladaní spoločnosti")
        return
      }

      toast.success(isEditing ? "Spoločnosť bola aktualizovaná" : "Spoločnosť bola vytvorená")
      if (!isEditing) reset()
      onSuccess?.()
    } catch {
      toast.error("Chyba pri ukladaní spoločnosti")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="dic">DIČ</Label>
        <Input
          id="dic"
          placeholder="2020123456"
          {...register("dic")}
          disabled={isEditing}
          aria-invalid={!!errors.dic}
          aria-describedby={errors.dic ? "dic-error" : undefined}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Presne 10 číslic, bez SK prefixu
        </p>
        {errors.dic && (
          <p id="dic-error" className="mt-1 text-sm text-destructive">
            {errors.dic.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="legalName">Obchodné meno</Label>
        <Input
          id="legalName"
          placeholder="Názov s.r.o."
          {...register("legalName")}
          aria-invalid={!!errors.legalName}
          aria-describedby={errors.legalName ? "legalName-error" : undefined}
        />
        {errors.legalName && (
          <p id="legalName-error" className="mt-1 text-sm text-destructive">
            {errors.legalName.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="adminEmail">E-mail administrátora (nepovinné)</Label>
        <Input
          id="adminEmail"
          type="email"
          placeholder="admin@firma.sk"
          {...register("adminEmail")}
          aria-invalid={!!errors.adminEmail}
          aria-describedby={errors.adminEmail ? "adminEmail-error" : undefined}
        />
        {errors.adminEmail && (
          <p id="adminEmail-error" className="mt-1 text-sm text-destructive">
            {errors.adminEmail.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="pfsVerificationToken">PFS Verifikačný token (nepovinné)</Label>
        <Input
          id="pfsVerificationToken"
          placeholder="token-z-pfs-systemu"
          {...register("pfsVerificationToken")}
          aria-invalid={!!errors.pfsVerificationToken}
          aria-describedby={errors.pfsVerificationToken ? "pfsToken-error" : undefined}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Automaticky vyplnené cez webhook alebo zadajte manuálne
        </p>
        {errors.pfsVerificationToken && (
          <p id="pfsToken-error" className="mt-1 text-sm text-destructive">
            {errors.pfsVerificationToken.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="accessPointProviderId">Prístupový bod (nepovinné)</Label>
        <Input
          id="accessPointProviderId"
          {...register("accessPointProviderId")}
          aria-invalid={!!errors.accessPointProviderId}
          aria-describedby={errors.accessPointProviderId ? "ap-error" : undefined}
        />
        {errors.accessPointProviderId && (
          <p id="ap-error" className="mt-1 text-sm text-destructive">
            {errors.accessPointProviderId.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting 
          ? (isEditing ? "Ukladanie..." : "Vytváranie...") 
          : (isEditing ? "Uložiť zmeny" : "Vytvoriť spoločnosť")
        }
      </Button>
    </form>
  )
}
