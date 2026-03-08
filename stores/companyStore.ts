"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Company } from "@/types"

interface CompanyStore {
  companies: Company[]
  selectedCompany: Company | null
  setCompanies: (companies: Company[]) => void
  setSelectedCompany: (company: Company) => void
}

export const useCompanyStore = create<CompanyStore>()(
  persist(
    (set) => ({
      companies: [],
      selectedCompany: null,
      setCompanies: (companies) => set({ companies }),
      setSelectedCompany: (company) => set({ selectedCompany: company }),
    }),
    {
      name: "company-store",
    }
  )
)
