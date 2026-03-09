"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  FileText,
  Building2,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Server,
  ScrollText,
  ShieldAlert,
  Mail,
  LayoutDashboard,
  Shield,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUserRole } from "@/hooks/useUserRole"
import type { UserRole } from "@/types"

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ size?: number }>
}

const superAdminNav: NavItem[] = [
  { name: "Prehlad", href: "/admin", icon: LayoutDashboard },
  { name: "Spolocnosti", href: "/admin/companies", icon: Building2 },
  { name: "Pouzivatelia", href: "/admin/users", icon: Users },
  { name: "Pozvanky", href: "/admin/invitations", icon: Mail },
  { name: "Deaktivacie", href: "/admin/deactivation-requests", icon: ShieldAlert },
  { name: "Pristupove body", href: "/admin/accessPoints", icon: Server },
  { name: "Audit log", href: "/admin/auditLogs", icon: ScrollText },
  { name: "Dokumenty", href: "/documents", icon: FileText },
  { name: "Nastavenia", href: "/settings", icon: Settings },
]

const administratorNav: NavItem[] = [
  { name: "Moja spolocnost", href: "/dashboard/company", icon: Building2 },
  { name: "Uctovnici", href: "/dashboard/accountants", icon: Users },
  { name: "Pozvat uctovnika", href: "/dashboard/invite", icon: Mail },
  { name: "Pozvanky", href: "/dashboard/invitations", icon: Mail },
  { name: "Dokumenty", href: "/documents", icon: FileText },
  { name: "Nastavenia", href: "/settings", icon: Settings },
]

const accountantNav: NavItem[] = [
  { name: "Spolocnosti", href: "/companies", icon: Building2 },
  { name: "Dokumenty", href: "/documents", icon: FileText },
  { name: "Nastavenia", href: "/settings", icon: Settings },
]

function getNavForRole(role: UserRole | null): NavItem[] {
  switch (role) {
    case "superAdmin":
      return superAdminNav
    case "administrator":
      return administratorNav
    case "accountant":
      return accountantNav
    default:
      return accountantNav
  }
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { role } = useUserRole()
  const navigation = getNavForRole(role)

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {!collapsed && (
          <span className="font-semibold text-foreground">Postar</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8"
          aria-label={collapsed ? "Rozbalit menu" : "Zbalit menu"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      {role === "superAdmin" && !collapsed && (
        <div className="border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Shield size={14} />
            Super Admin
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-1 p-2" aria-label="Hlavna navigacia">
        {navigation.map((item) => {
          const basePath = item.href.split("?")[0]
          const isActive =
            pathname === item.href ||
            (basePath !== "/" && pathname.startsWith(basePath + "/")) ||
            (basePath !== "/" && pathname === basePath)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon size={20} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
