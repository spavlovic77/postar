import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/feedback/emptyState"
import { Server } from "lucide-react"

export default async function AccessPointsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: userRole } = await supabase
    .from("userRoles")
    .select("role")
    .eq("userId", user.id)
    .single()

  if (userRole?.role !== "superAdmin") redirect("/")

  const { data: accessPoints } = await supabase
    .from("accessPointProviders")
    .select("*")
    .order("createdAt", { ascending: false })

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          Prístupové body
        </h1>
      </div>

      {accessPoints && accessPoints.length > 0 ? (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Názov</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Stav</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessPoints.map(
                (ap: {
                  id: string
                  name: string
                  baseUrl: string
                  isActive: boolean
                }) => (
                  <TableRow key={ap.id}>
                    <TableCell className="font-medium">{ap.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ap.baseUrl}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={ap.isActive ? "success" : "secondary"}
                      >
                        {ap.isActive ? "Aktívny" : "Neaktívny"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Server size={48} />}
          title="Žiadne prístupové body"
          description="Pridajte pripojenie k Peppol Access Point poskytovateľovi."
        />
      )}
    </div>
  )
}
