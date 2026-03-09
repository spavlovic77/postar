/**
 * ION AP Sync - registers a company on ION AP and updates the DB record.
 *
 * Used by:
 * - PFS webhook (automatic on company creation)
 * - Admin retry button (manual re-run)
 */

import { IonApClient, IonApApiError } from "./client"
import { createAdminClient } from "@/lib/supabase/server"
import { lookupByDic } from "@/lib/ruz/lookup"

export interface SyncResult {
  success: boolean
  orgId?: number
  identifierId?: number
  error?: string
}

/**
 * Register a company on ION AP and persist the result.
 * Safe to call multiple times — skips if already successful.
 */
export async function syncCompanyToIonAp(companyId: string): Promise<SyncResult> {
  const supabase = createAdminClient()

  // Fetch company
  const { data: company, error: fetchError } = await supabase
    .from("companies")
    .select("id, dic, legalName, pfsVerificationToken, ionApOrgId, ionApStatus")
    .eq("id", companyId)
    .single()

  if (fetchError || !company) {
    return { success: false, error: "Company not found" }
  }

  // Skip if already registered successfully
  if (company.ionApStatus === "success" && company.ionApOrgId) {
    return { success: true, orgId: company.ionApOrgId }
  }

  try {
    // Look up real company name from RUZ if not already set
    let companyName = company.legalName || "Company"
    try {
      const ruzData = await lookupByDic(company.dic)
      if (ruzData?.companyName) {
        companyName = ruzData.companyName
        // Persist the legal name to DB
        await supabase
          .from("companies")
          .update({ legalName: companyName })
          .eq("id", companyId)
      }
    } catch (ruzErr) {
      console.error("RUZ lookup failed, using fallback name:", ruzErr)
    }

    const client = new IonApClient()

    const result = await client.registerCompany({
      dic: company.dic,
      reference: company.pfsVerificationToken || "",
      name: companyName,
    })

    // Update company with ION AP data
    await supabase
      .from("companies")
      .update({
        ionApOrgId: result.orgId,
        ionApIdentifierId: result.identifierId,
        ionApStatus: "success",
        ionApError: null,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", companyId)

    return { success: true, orgId: result.orgId, identifierId: result.identifierId }
  } catch (err) {
    const errorMessage = err instanceof IonApApiError
      ? `${err.status}: ${JSON.stringify(err.body)}`
      : err instanceof Error
        ? err.message
        : "Unknown error"

    // Persist failure
    await supabase
      .from("companies")
      .update({
        ionApStatus: "failed",
        ionApError: errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", companyId)

    return { success: false, error: errorMessage }
  }
}
