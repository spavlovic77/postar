"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const statusFilters = [
  { value: "all", label: "Všetky" },
  { value: "RECEIVED", label: "Doručené" },
  { value: "ACKNOWLEDGED", label: "Potvrdené" },
  { value: "ACCEPTED", label: "Prijaté" },
]

const typeFilters = [
  { value: "all", label: "Všetky typy" },
  { value: "invoice", label: "Faktúry" },
  { value: "creditNote", label: "Dobropisy" },
]

export function DocumentFilters() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Stav:</span>
      {statusFilters.map((filter) => (
        <Button key={filter.value} variant="outline" size="sm">
          <Badge variant="secondary" className="mr-1">
            {filter.label}
          </Badge>
        </Button>
      ))}
      <span className="ml-4 text-sm text-muted-foreground">Typ:</span>
      {typeFilters.map((filter) => (
        <Button key={filter.value} variant="outline" size="sm">
          {filter.label}
        </Button>
      ))}
    </div>
  )
}
