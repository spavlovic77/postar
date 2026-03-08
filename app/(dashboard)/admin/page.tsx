import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Shield, Server, ScrollText } from "lucide-react"

export default async function AdminPage() {
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Shield size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">
          Administrácia
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/accessPoints"
          className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <Server size={20} className="text-primary" />
            <h2 className="font-semibold">Prístupové body</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Správa pripojení k Peppol Access Point poskytovateľom
          </p>
        </Link>

        <Link
          href="/admin/auditLogs"
          className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <ScrollText size={20} className="text-primary" />
            <h2 className="font-semibold">Audit log</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Zobrazenie záznamov o všetkých operáciách v systéme
          </p>
        </Link>
      </div>
    </div>
  )
}
