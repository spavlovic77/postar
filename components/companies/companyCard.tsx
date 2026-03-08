import { Building2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/formatting"
import type { Company } from "@/types"

interface CompanyCardProps {
  company: Company
}

export function CompanyCard({ company }: CompanyCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <Building2 size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{company.name}</h3>
            <p className="text-sm text-muted-foreground">{company.dic}</p>
          </div>
        </div>
        <Badge variant={company.isActive ? "success" : "secondary"}>
          {company.isActive ? "Aktívna" : "Neaktívna"}
        </Badge>
      </div>
      <div className="mt-4 text-xs text-muted-foreground">
        Peppol ID: {company.peppolParticipantId}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Vytvorená: {formatDate(company.createdAt)}
      </div>
    </div>
  )
}
