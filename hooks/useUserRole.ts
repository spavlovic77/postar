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

      console.log("[v0] useUserRole - user:", user?.id, user?.email)
      if (user) {
        const { data, error } = await supabase
          .from("userRoles")
          .select("role")
          .eq("userId", user.id)
          .single()

        console.log("[v0] useUserRole - query result:", { data, error })

        if (error) {
          console.error("useUserRole error:", error.message, "userId:", user.id)
        }

        if (data) {
          console.log("[v0] useUserRole - setting role to:", data.role)
          setRole(data.role as UserRole)
        }
      } else {
        console.log("[v0] useUserRole - no user found")
      }
      setIsLoading(false)
    }

    fetchRole()
  }, [])

  return { role, isLoading }
}
