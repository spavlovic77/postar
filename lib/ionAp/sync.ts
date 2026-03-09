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
  console.log("[v0] ========== ION AP SYNC START ==========")
  console.log("[v0] Company ID:", companyId)
  
  const supabase = createAdminClient()

  // Fetch company
  console.log("[v0] Fetching company from database...")
  const { data: company, error: fetchError } = await supabase
    .from("companies")
    .select("id, dic, legalName, pfsVerificationToken, ionApOrgId, ionApStatus")
    .eq("id", companyId)
    .single()

  console.log("[v0] Company fetch result:", { found: !!company, error: fetchError?.message })

  if (fetchError || !company) {
    console.error("[v0] Company not found:", fetchError)
    return { success: false, error: "Company not found" }
  }

  console.log("[v0] Company data:", JSON.stringify(company, null, 2))

  // Skip if already registered successfully
  if (company.ionApStatus === "success" && company.ionApOrgId) {
    console.log("[v0] Company already registered on ION AP, skipping")
    return { success: true, orgId: company.ionApOrgId }
  }

  try {
    // Look up real company name from RUZ if not already set
    let companyName = company.legalName || "Company"
    console.log("[v0] Initial company name:", companyName)
    
    try {
      console.log("[v0] Looking up company in RUZ by DIC:", company.dic)
      const ruzData = await lookupByDic(company.dic)
      console.log("[v0] RUZ lookup result:", JSON.stringify(ruzData, null, 2))
      
      if (ruzData?.companyName) {
        companyName = ruzData.companyName
        console.log("[v0] Updating company legalName to:", companyName)
        // Persist the legal name to DB
        const { error: updateError } = await supabase
          .from("companies")
          .update({ legalName: companyName })
          .eq("id", companyId)
        console.log("[v0] legalName update result:", { error: updateError?.message })
      }
    } catch (ruzErr) {
      console.error("[v0] RUZ lookup failed, using fallback name:", ruzErr)
    }

    console.log("[v0] Creating ION AP client...")
    console.log("[v0] ION_AP_URL configured:", !!process.env.ION_AP_URL)
    console.log("[v0] ION_AP_TOKEN configured:", !!process.env.ION_AP_TOKEN)
    
    const client = new IonApClient()
    console.log("[v0] ION AP client created")

    console.log("[v0] Registering company on ION AP...")
    const registerParams = {
      dic: company.dic,
      reference: company.pfsVerificationToken || "",
      name: companyName,
    }
    console.log("[v0] Register params:", JSON.stringify(registerParams, null, 2))
    
    const result = await client.registerCompany(registerParams)
    console.log("[v0] ION AP registration result:", JSON.stringify(result, null, 2))

    // Update company with ION AP data
    console.log("[v0] Updating company with ION AP data...")
    const { error: successUpdateError } = await supabase
      .from("companies")
      .update({
        ionApOrgId: result.orgId,
        ionApIdentifierId: result.identifierId,
        ionApStatus: "success",
        ionApError: null,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", companyId)

    console.log("[v0] Success update result:", { error: successUpdateError?.message })
    console.log("[v0] ========== ION AP SYNC SUCCESS ==========")
    return { success: true, orgId: result.orgId, identifierId: result.identifierId }
  } catch (err) {
    console.error("[v0] ION AP sync error:", err)
    
    const errorMessage = err instanceof IonApApiError
      ? `${err.status}: ${JSON.stringify(err.body)}`
      : err instanceof Error
        ? err.message
        : "Unknown error"

    console.log("[v0] Error message:", errorMessage)

    // Persist failure
    console.log("[v0] Persisting failure status...")
    const { error: failUpdateError } = await supabase
      .from("companies")
      .update({
        ionApStatus: "failed",
        ionApError: errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", companyId)

    console.log("[v0] Failure update result:", { error: failUpdateError?.message })
    console.log("[v0] ========== ION AP SYNC FAILED ==========")
    return { success: false, error: errorMessage }
  }
}
