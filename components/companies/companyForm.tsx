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
}

export function CompanyForm({ onSuccess }: CompanyFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CompanyInput>({
    resolver: zodResolver(companySchema),
  })

  const onSubmit = async (data: CompanyInput) => {
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error ?? "Chyba pri vytváraní spoločnosti")
        return
      }

      toast.success("Spoločnosť bola vytvorená")
      reset()
      onSuccess?.()
    } catch {
      toast.error("Chyba pri vytváraní spoločnosti")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="name">Názov spoločnosti</Label>
        <Input
          id="name"
          {...register("name")}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        {errors.name && (
          <p id="name-error" className="mt-1 text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="dic">DIČ</Label>
        <Input
          id="dic"
          placeholder="SK2020123456"
          {...register("dic")}
          aria-invalid={!!errors.dic}
          aria-describedby={errors.dic ? "dic-error" : undefined}
        />
        {errors.dic && (
          <p id="dic-error" className="mt-1 text-sm text-destructive">
            {errors.dic.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="accessPointProviderId">Prístupový bod</Label>
        <Input
          id="accessPointProviderId"
          {...register("accessPointProviderId")}
          aria-invalid={!!errors.accessPointProviderId}
          aria-describedby={
            errors.accessPointProviderId ? "ap-error" : undefined
          }
        />
        {errors.accessPointProviderId && (
          <p id="ap-error" className="mt-1 text-sm text-destructive">
            {errors.accessPointProviderId.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Vytváranie..." : "Vytvoriť spoločnosť"}
      </Button>
    </form>
  )
}
