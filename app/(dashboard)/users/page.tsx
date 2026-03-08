import { createClient } from "@/lib/supabase/server"
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
import { Users } from "lucide-react"

const roleLabels: Record<string, string> = {
  superAdmin: "Super administrátor",
  administrator: "Administrátor",
  accountant: "Účtovník",
}

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: users } = await supabase
    .from("userRoles")
    .select("*, user:userId(email)")
    .order("createdAt", { ascending: false })

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          Používatelia
        </h1>
      </div>

      {users && users.length > 0 ? (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Rola</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(
                (entry: {
                  id: string
                  role: string
                  user: { email: string } | null
                }) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.user?.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {roleLabels[entry.role] ?? entry.role}
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
          icon={<Users size={48} />}
          title="Žiadni používatelia"
          description="Pozvite používateľov na správu spoločností a dokumentov."
        />
      )}
    </div>
  )
}
