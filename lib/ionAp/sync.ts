/**
 * ION AP Sync - registers a company on ION AP and updates the DB record.
 *
 * Used by:
 * - PFS webhook (automatic on company creation)
 * - Admin retry button (manual re-run)
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
 */
export async function syncCompanyToIonAp(companyId: string): Promise<SyncResult> {
  console.log(`[ION AP Sync] Starting sync for companyId=${companyId}`)
  const supabase = createAdminClient()

  // Fetch company
  const { data: company, error: fetchError } = await supabase
    .from("companies")
    .select("id, dic, legalName, pfsVerificationToken, ionApOrgId, ionApStatus")
    .eq("id", companyId)
    .single()

  if (fetchError || !company) {
    console.error(`[ION AP Sync] Company not found: companyId=${companyId}`, fetchError?.message)
    return { success: false, error: "Company not found" }
  }

  console.log(`[ION AP Sync] Company fetched: dic=${company.dic}, legalName=${company.legalName}, ionApStatus=${company.ionApStatus}, ionApOrgId=${company.ionApOrgId}`)

  // Skip if already registered successfully
  if (company.ionApStatus === "success" && company.ionApOrgId) {
    console.log(`[ION AP Sync] Already registered, skipping. orgId=${company.ionApOrgId}`)
    return { success: true, orgId: company.ionApOrgId }
  }

  try {
    const client = new IonApClient()

    console.log(`[ION AP Sync] Calling registerCompany: dic=${company.dic}, name=${company.legalName || "Company"}, reference=${company.pfsVerificationToken || "(empty)"}`)
    const result = await client.registerCompany({
      dic: company.dic,
      reference: company.pfsVerificationToken || "",
      name: company.legalName || "Company",
    })

    console.log(`[ION AP Sync] Registration successful: orgId=${result.orgId}, identifierId=${result.identifierId}`)

    // Update company with ION AP data
    const { error: updateError } = await supabase
      .from("companies")
      .update({
        ionApOrgId: result.orgId,
        ionApIdentifierId: result.identifierId,
        ionApStatus: "success",
        ionApError: null,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", companyId)

    if (updateError) {
      console.error(`[ION AP Sync] DB update failed after successful registration: companyId=${companyId}`, updateError.message)
    } else {
      console.log(`[ION AP Sync] DB updated successfully: companyId=${companyId}, ionApStatus=success`)
    }

    return { success: true, orgId: result.orgId, identifierId: result.identifierId }
  } catch (err) {
    const errorMessage = err instanceof IonApApiError
      ? `${err.status}: ${JSON.stringify(err.body)}`
      : err instanceof Error
        ? err.message
        : "Unknown error"

    console.error(`[ION AP Sync] Registration failed for companyId=${companyId}: ${errorMessage}`)

    // Persist failure
    const { error: updateError } = await supabase
      .from("companies")
      .update({
        ionApStatus: "failed",
        ionApError: errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", companyId)

    if (updateError) {
      console.error(`[ION AP Sync] DB update failed after registration error: companyId=${companyId}`, updateError.message)
    } else {
      console.log(`[ION AP Sync] DB updated: companyId=${companyId}, ionApStatus=failed`)
    }

    return { success: false, error: errorMessage }
  }
}
