"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { UserRole } from "@/types"

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchRole() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data, error } = await supabase
          .from("userRoles")
          .select("role")
          .eq("userId", user.id)
          .single()

        if (error) {
          console.error("useUserRole error:", error.message, "userId:", user.id)
        }

        if (data) {
          setRole(data.role as UserRole)
        }
      }
      setIsLoading(false)
    }

    fetchRole()
  }, [])

  return { role, isLoading }
}
