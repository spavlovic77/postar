"use client"

import { Toaster } from "sonner"

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "bg-card border-border text-foreground",
          title: "text-foreground font-medium",
          description: "text-muted-foreground",
          success: "border-l-4 border-l-green-500",
          error: "border-l-4 border-l-destructive",
          warning: "border-l-4 border-l-amber-500",
        },
      }}
      richColors
    />
  )
}
