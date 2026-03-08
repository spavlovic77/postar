"use client"

import { useState } from "react"
import { Sidebar } from "./sidebar"
import { TopBar } from "./topBar"
import { Sheet, SheetContent } from "@/components/ui/sheet"

export function ResponsiveLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto" id="main-content">
          {children}
        </main>
      </div>
    </div>
  )
}
