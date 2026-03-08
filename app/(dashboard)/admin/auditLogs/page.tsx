import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AuditLogTable } from "@/components/admin/auditLogTable"
import { EmptyState } from "@/components/feedback/emptyState"
import { ScrollText } from "lucide-react"
import type { AuditLog } from "@/types"

export default async function AuditLogsPage() {
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

  const { data: logs } = await supabase
    .from("auditLogs")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(100)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Audit log</h1>
      </div>

      {logs && logs.length > 0 ? (
        <AuditLogTable logs={logs as AuditLog[]} />
      ) : (
        <EmptyState
          icon={<ScrollText size={48} />}
          title="Žiadne záznamy"
          description="Audit log záznamy sa objavia po prvých operáciách v systéme."
        />
      )}
    </div>
  )
}
