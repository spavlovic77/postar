"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useCompanyStore } from "@/stores/companyStore"

export function CompanySelector() {
  const [open, setOpen] = useState(false)
  const { companies, selectedCompany, setSelectedCompany } = useCompanyStore()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full max-w-xs justify-between"
        >
          <div className="flex items-center gap-2 truncate">
            <Building2
              size={16}
              className="shrink-0 text-muted-foreground"
            />
            <span className="truncate">
              {selectedCompany?.name ?? "Vyberte spoločnosť"}
            </span>
          </div>
          <ChevronsUpDown size={16} className="shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Hľadať spoločnosť..." />
          <CommandList>
            <CommandEmpty>Žiadne spoločnosti.</CommandEmpty>
            <CommandGroup>
              {companies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={company.name}
                  onSelect={() => {
                    setSelectedCompany(company)
                    setOpen(false)
                  }}
                >
                  <Check
                    size={16}
                    className={cn(
                      "mr-2",
                      selectedCompany?.id === company.id
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{company.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {company.dic}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
