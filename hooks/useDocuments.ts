"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchDocuments } from "@/lib/api/documents"

interface UseDocumentsOptions {
  companyId?: string
  direction: "sent" | "received"
  search?: string
  sortField?: string
  sortOrder?: "asc" | "desc"
  page?: number
  limit?: number
}

export function useDocuments(options: UseDocumentsOptions) {
  return useQuery({
    queryKey: ["documents", options],
    queryFn: () =>
      fetchDocuments({
        companyId: options.companyId!,
        direction: options.direction,
        search: options.search,
        sortField: options.sortField,
        sortOrder: options.sortOrder,
        page: options.page,
        limit: options.limit,
      }),
    enabled: !!options.companyId,
  })
}
