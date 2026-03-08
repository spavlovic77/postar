"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchDocument } from "@/lib/api/documents"
import { useCompanyStore } from "@/stores/companyStore"

export function useDocument(documentId: string | null) {
  const { selectedCompany } = useCompanyStore()

  return useQuery({
    queryKey: ["document", documentId],
    queryFn: () => fetchDocument(documentId!, selectedCompany!.id),
    enabled: !!documentId && !!selectedCompany,
  })
}
