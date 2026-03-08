import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Shield, Server, ScrollText, Building2, Users, ShieldAlert } from "lucide-react"

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

  const adminLinks = [
    {
      href: "/admin/companies",
      icon: Building2,
      title: "Spolocnosti",
      description: "Sprava spolocnosti, DIC, obchodne mena",
    },
    {
      href: "/admin/users",
      icon: Users,
      title: "Pouzivatelia",
      description: "Sprava pouzivatelov, pozvanie, deaktivacia",
    },
    {
      href: "/admin/deactivation-requests",
      icon: ShieldAlert,
      title: "Ziadosti o deaktivaciu",
      description: "Schvalovanie ziadosti o deaktivaciu uctov",
    },
    {
      href: "/admin/accessPoints",
      icon: Server,
      title: "Pristupove body",
      description: "Sprava pripojeni k Peppol Access Point poskytovatelom",
    },
    {
      href: "/admin/auditLogs",
      icon: ScrollText,
      title: "Audit log",
      description: "Zobrazenie zaznamov o vsetkych operaciach v systeme",
    },
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Shield size={24} className="text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">
          Administracia
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {adminLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <link.icon size={20} className="text-primary" />
              <h2 className="font-semibold">{link.title}</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
