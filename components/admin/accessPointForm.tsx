"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  accessPointSchema,
  type AccessPointInput,
} from "@/lib/validations/document"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

interface AccessPointFormProps {
  onSuccess?: () => void
}

export function AccessPointForm({ onSuccess }: AccessPointFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<AccessPointInput>({
    resolver: zodResolver(accessPointSchema),
  })

  const onSubmit = async (data: AccessPointInput) => {
    try {
      const response = await fetch("/api/sapiSk/accessPoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error ?? "Chyba pri vytváraní prístupového bodu")
        return
      }

      toast.success("Prístupový bod bol vytvorený")
      reset()
      onSuccess?.()
    } catch {
      toast.error("Chyba pri vytváraní prístupového bodu")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="ap-name">Názov</Label>
        <Input
          id="ap-name"
          {...register("name")}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "ap-name-error" : undefined}
        />
        {errors.name && (
          <p id="ap-name-error" className="mt-1 text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="ap-baseUrl">URL adresa</Label>
        <Input
          id="ap-baseUrl"
          placeholder="https://api.example.com"
          {...register("baseUrl")}
          aria-invalid={!!errors.baseUrl}
          aria-describedby={errors.baseUrl ? "ap-baseUrl-error" : undefined}
        />
        {errors.baseUrl && (
          <p id="ap-baseUrl-error" className="mt-1 text-sm text-destructive">
            {errors.baseUrl.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="ap-clientId">Client ID</Label>
        <Input
          id="ap-clientId"
          {...register("clientId")}
          aria-invalid={!!errors.clientId}
          aria-describedby={
            errors.clientId ? "ap-clientId-error" : undefined
          }
        />
        {errors.clientId && (
          <p id="ap-clientId-error" className="mt-1 text-sm text-destructive">
            {errors.clientId.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="ap-clientSecret">Client Secret</Label>
        <Input
          id="ap-clientSecret"
          type="password"
          {...register("clientSecret")}
          aria-invalid={!!errors.clientSecret}
          aria-describedby={
            errors.clientSecret ? "ap-clientSecret-error" : undefined
          }
        />
        {errors.clientSecret && (
          <p
            id="ap-clientSecret-error"
            className="mt-1 text-sm text-destructive"
          >
            {errors.clientSecret.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Vytváranie..." : "Vytvoriť prístupový bod"}
      </Button>
    </form>
  )
}
