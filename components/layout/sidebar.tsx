"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  FileText,
  Inbox,
  Send,
  Building2,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUserRole } from "@/hooks/useUserRole"

const navigation = [
  { name: "Dokumenty", href: "/", icon: FileText },
  { name: "Prijaté", href: "/documents?tab=inbox", icon: Inbox },
  { name: "Odoslané", href: "/documents?tab=outbox", icon: Send },
  { name: "Spoločnosti", href: "/companies", icon: Building2 },
  { name: "Používatelia", href: "/users", icon: Users },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { role } = useUserRole()

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
          aria-label={collapsed ? "Rozbaliť menu" : "Zbaliť menu"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 p-2" aria-label="Hlavná navigácia">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(item.href.split("?")[0] + "/")
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

      {role === "superAdmin" && (
        <div className="border-t border-border p-2">
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings size={20} />
            {!collapsed && <span>Administrácia</span>}
          </Link>
        </div>
      )}
    </aside>
  )
}
