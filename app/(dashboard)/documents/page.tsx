"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DocumentTable } from "@/components/documents/documentTable"
import { DocumentFilters } from "@/components/documents/documentFilters"
import { PageTransition } from "@/components/motion/pageTransition"
import { Inbox, Send } from "lucide-react"

export default function DocumentsPage() {
  return (
    <PageTransition>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Dokumenty</h1>
        </div>

        <Tabs defaultValue="inbox" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="inbox" className="flex items-center gap-2">
              <Inbox size={16} />
              Prijaté
            </TabsTrigger>
            <TabsTrigger value="outbox" className="flex items-center gap-2">
              <Send size={16} />
              Odoslané
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <DocumentFilters />
          </div>

          <TabsContent value="inbox" className="mt-4">
            <DocumentTable direction="received" />
          </TabsContent>

          <TabsContent value="outbox" className="mt-4">
            <DocumentTable direction="sent" />
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}
