import { createClient } from "@/lib/supabase/server"
import { CompanyCard } from "@/components/companies/companyCard"
import { EmptyState } from "@/components/feedback/emptyState"
import { Building2 } from "lucide-react"
import type { Company } from "@/types"

export default async function CompaniesPage() {
  const supabase = await createClient()
  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("createdAt", { ascending: false })

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Spoločnosti</h1>
      </div>

      {companies && companies.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((company: Company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Building2 size={48} />}
          title="Žiadne spoločnosti"
          description="Pridajte svoju prvú spoločnosť pre začatie práce s dokumentmi."
        />
      )}
    </div>
  )
}
