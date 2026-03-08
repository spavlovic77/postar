interface AcknowledgeParams {
  documentId: string
  companyId: string
}

export async function acknowledgeDocument({
  documentId,
  companyId,
}: AcknowledgeParams) {
  const response = await fetch(
    `/api/sapiSk/documents/${documentId}/acknowledge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error ?? "Failed to acknowledge document")
  }

  return response.json()
}

interface FetchDocumentsParams {
  companyId: string
  direction: "sent" | "received"
  search?: string
  sortField?: string
  sortOrder?: "asc" | "desc"
  page?: number
  limit?: number
}

export async function fetchDocuments(params: FetchDocumentsParams) {
  const searchParams = new URLSearchParams({
    companyId: params.companyId,
    direction: params.direction,
  })

  if (params.search) searchParams.set("search", params.search)
  if (params.sortField) searchParams.set("sortField", params.sortField)
  if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder)
  if (params.page) searchParams.set("page", params.page.toString())
  if (params.limit) searchParams.set("limit", params.limit.toString())

  const response = await fetch(
    `/api/sapiSk/documents/receive?${searchParams.toString()}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error ?? "Failed to fetch documents")
  }

  return response.json()
}

export async function fetchDocument(documentId: string, companyId: string) {
  const response = await fetch(
    `/api/sapiSk/documents/${documentId}?companyId=${companyId}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error ?? "Failed to fetch document")
  }

  return response.json()
}
