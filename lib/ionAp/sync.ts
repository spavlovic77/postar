/**
 * ION AP Sync - registers a company on ION AP and updates the DB record.
 *
 * Used by:
 * - Document send flow (lazy activation on first send)
 * - Document receive flow (lazy activation on first receive)
 * - Admin manual activation button
 */

import { IonApClient, IonApApiError } from "./client"
import { createAdminClient } from "@/lib/supabase/server"

export interface SyncResult {
  success: boolean
  orgId?: number
  identifierId?: number
  error?: string
}

/**
 * Register a company on ION AP and persist the result.
 * Safe to call multiple times — skips if already successful.
 * 
 * On success, also activates the company (status = 'active', isActive = true)
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

  // Company name comes from webhook (legal_name) - must be set
  const companyName = company.legalName
  if (!companyName) {
    console.error("[v0] Company has no legal name set")
    return { success: false, error: "Company legal name is required for ION AP registration" }
  }

  console.log("[v0] Company name for ION AP:", companyName)

  try {
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

    // Update company with ION AP data and activate
    console.log("[v0] Updating company with ION AP data and activating...")
    const { error: successUpdateError } = await supabase
      .from("companies")
      .update({
        ionApOrgId: result.orgId,
        ionApIdentifierId: result.identifierId,
        ionApStatus: "success",
        ionApError: null,
        status: "active",
        isActive: true,
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

/**
 * Ensures a company is registered on ION AP before document operations.
 * Used for lazy activation on first document send/receive.
 * 
 * Returns the company if activation succeeds, throws if it fails.
 */
export async function ensureCompanyActivated(companyId: string): Promise<{
  ionApOrgId: number
  ionApIdentifierId: number
}> {
  const supabase = createAdminClient()
  
  // Check current status
  const { data: company, error } = await supabase
    .from("companies")
    .select("ionApOrgId, ionApIdentifierId, ionApStatus")
    .eq("id", companyId)
    .single()

  if (error || !company) {
    throw new Error("Company not found")
  }

  // Already activated
  if (company.ionApStatus === "success" && company.ionApOrgId && company.ionApIdentifierId) {
    return {
      ionApOrgId: company.ionApOrgId,
      ionApIdentifierId: company.ionApIdentifierId,
    }
  }

  // Need to activate
  console.log("[v0] Company not activated on ION AP, triggering lazy activation...")
  const result = await syncCompanyToIonAp(companyId)
  
  if (!result.success || !result.orgId || !result.identifierId) {
    throw new Error(`ION AP activation failed: ${result.error || "Unknown error"}`)
  }

  return {
    ionApOrgId: result.orgId,
    ionApIdentifierId: result.identifierId,
  }
}
