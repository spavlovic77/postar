"use client"

import { CompanySelector } from "./companySelector"
import { UserMenu } from "./userMenu"
import { ThemeToggle } from "./themeToggle"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"

interface TopBarProps {
  onMenuClick?: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Otvoriť menu"
      >
        <Menu size={20} />
      </Button>

      <div className="flex-1 px-4">
        <CompanySelector />
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
