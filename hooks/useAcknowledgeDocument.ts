"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { acknowledgeDocument } from "@/lib/api/documents"

export function useAcknowledgeDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: acknowledgeDocument,
    onMutate: async ({ documentId }) => {
      await queryClient.cancelQueries({ queryKey: ["documents"] })

      const previousDocuments = queryClient.getQueryData(["documents"])

      queryClient.setQueryData(
        ["documents"],
        (old: Record<string, unknown> | undefined) => {
          if (!old) return old
          return {
            ...old,
            documents: (
              old.documents as Array<Record<string, unknown>>
            ).map((doc) =>
              doc.id === documentId
                ? {
                    ...doc,
                    status: "ACKNOWLEDGED",
                    acknowledgedAt: new Date().toISOString(),
                  }
                : doc
            ),
          }
        }
      )

      return { previousDocuments }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousDocuments) {
        queryClient.setQueryData(["documents"], context.previousDocuments)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] })
    },
  })
}
