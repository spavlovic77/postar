/**
 * ION AP Sync - registers companies and users on ION AP and updates DB records.
 *
 * Used by:
 * - PFS webhook (automatic on company creation)
 * - Invitation acceptance (automatic user creation for administrators)
 * - Admin retry buttons (manual re-run)
 */

import { IonApClient, IonApApiError } from "./client"
import { createAdminClient } from "@/lib/supabase/server"
import { logAuditEventAdmin } from "@/lib/sapiSk/auditLog"
import { autoInviteAdministrator } from "@/lib/onboarding/autoInvite"
import crypto from "crypto"

export interface SyncResult {
  success: boolean
  orgId?: number
  identifierId?: number
  error?: string
}

export interface UserSyncResult {
  success: boolean
  userId?: number
  authToken?: string
  error?: string
}

/**
 * Register a company on ION AP and persist the result.
 * Safe to call multiple times — skips if already successful.
 */
export async function syncCompanyToIonAp(companyId: string): Promise<SyncResult> {
  const correlationId = crypto.randomUUID()
  console.log(`[ION AP Sync] Starting sync for companyId=${companyId}, correlationId=${correlationId}`)
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

  const dic = company.dic
  console.log(`[ION AP Sync] [DIC=${dic}] Company fetched: legalName=${company.legalName}, ionApStatus=${company.ionApStatus}, ionApOrgId=${company.ionApOrgId}`)

  // Skip if already registered successfully
  if (company.ionApStatus === "success" && company.ionApOrgId) {
    console.log(`[ION AP Sync] [DIC=${dic}] Already registered, skipping. orgId=${company.ionApOrgId}`)
    return { success: true, orgId: company.ionApOrgId }
  }

  // Audit: sync started
  await logAuditEventAdmin({
    userId: null,
    companyId,
    action: "onboarding.ionap.company.sync",
    outcome: "pending",
    sourceIp: "system",
    userAgent: "ion-ap-sync",
    requestMethod: "POST",
    requestPath: `/ionap/organizations`,
    responseStatus: 0,
    correlationId,
    details: { dic, legalName: company.legalName, step: "ionap_company_registration" },
  })

  try {
    const client = new IonApClient()

    console.log(`[ION AP Sync] [DIC=${dic}] Calling registerCompany: name=${company.legalName || "Company"}, reference=${company.pfsVerificationToken || "(empty)"}`)
    const result = await client.registerCompany({
      dic: company.dic,
      reference: company.pfsVerificationToken || "",
      name: company.legalName || "Company",
    })

    console.log(`[ION AP Sync] [DIC=${dic}] Registration successful: orgId=${result.orgId}, identifierId=${result.identifierId}`)

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
      console.error(`[ION AP Sync] [DIC=${dic}] DB update failed after successful registration: companyId=${companyId}`, updateError.message)
    } else {
      console.log(`[ION AP Sync] [DIC=${dic}] DB updated successfully: companyId=${companyId}, ionApStatus=success`)
    }

    // Audit: sync success
    await logAuditEventAdmin({
      userId: null,
      companyId,
      action: "onboarding.ionap.company.success",
      outcome: "success",
      sourceIp: "system",
      userAgent: "ion-ap-sync",
      requestMethod: "POST",
      requestPath: `/ionap/organizations`,
      responseStatus: 200,
      correlationId,
      details: { dic, orgId: result.orgId, identifierId: result.identifierId, step: "ionap_company_registration" },
    })

    // Fire-and-forget: auto-invite administrator after successful ION AP registration
    console.log(`[ION AP Sync] [DIC=${dic}] Triggering auto-invite for companyId=${companyId}`)
    autoInviteAdministrator(companyId).catch((err) =>
      console.error(`[ION AP Sync] [DIC=${dic}] Auto-invite failed for companyId=${companyId}:`, err)
    )

    return { success: true, orgId: result.orgId, identifierId: result.identifierId }
  } catch (err) {
    const errorMessage = err instanceof IonApApiError
      ? `${err.status}: ${JSON.stringify(err.body)}`
      : err instanceof Error
        ? err.message
        : "Unknown error"

    console.error(`[ION AP Sync] [DIC=${dic}] Registration failed for companyId=${companyId}: ${errorMessage}`)

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
      console.error(`[ION AP Sync] [DIC=${dic}] DB update failed after registration error: companyId=${companyId}`, updateError.message)
    } else {
      console.log(`[ION AP Sync] [DIC=${dic}] DB updated: companyId=${companyId}, ionApStatus=failed`)
    }

    // Audit: sync failed
    await logAuditEventAdmin({
      userId: null,
      companyId,
      action: "onboarding.ionap.company.failed",
      outcome: "failure",
      sourceIp: "system",
      userAgent: "ion-ap-sync",
      requestMethod: "POST",
      requestPath: `/ionap/organizations`,
      responseStatus: 502,
      correlationId,
      details: { dic, error: errorMessage, step: "ionap_company_registration" },
    })

    return { success: false, error: errorMessage }
  }
}

/**
 * Create a user on ION AP for a specific company assignment.
 * Fetches the auth_token and persists it on the companyAssignment.
 * Requires the company to already be registered on ION AP (ionApStatus=success).
 */
export async function syncUserToIonAp(assignmentId: string): Promise<UserSyncResult> {
  const correlationId = crypto.randomUUID()
  console.log(`[ION AP User Sync] Starting user sync for assignmentId=${assignmentId}, correlationId=${correlationId}`)
  const supabase = createAdminClient()

  // Fetch the assignment with company and user data
  const { data: assignment, error: fetchError } = await supabase
    .from("companyAssignments")
    .select("id, userId, companyId, ionApUserId, ionApUserStatus")
    .eq("id", assignmentId)
    .single()

  if (fetchError || !assignment) {
    console.error(`[ION AP User Sync] Assignment not found: assignmentId=${assignmentId}`, fetchError?.message)
    return { success: false, error: "Assignment not found" }
  }

  console.log(`[ION AP User Sync] Assignment fetched: userId=${assignment.userId}, companyId=${assignment.companyId}, currentStatus=${assignment.ionApUserStatus}`)

  // Skip if already registered successfully
  if (assignment.ionApUserStatus === "success" && assignment.ionApUserId) {
    console.log(`[ION AP User Sync] Already registered, skipping. ionApUserId=${assignment.ionApUserId}`)
    return { success: true, userId: assignment.ionApUserId }
  }

  // Fetch company to get ionApOrgId and DIC
  const { data: company } = await supabase
    .from("companies")
    .select("id, ionApOrgId, ionApStatus, dic")
    .eq("id", assignment.companyId)
    .single()

  if (!company) {
    const error = "Company not found"
    console.error(`[ION AP User Sync] ${error}: companyId=${assignment.companyId}`)
    await updateAssignmentStatus(supabase, assignmentId, "failed", error)
    return { success: false, error }
  }

  const dic = company.dic
  console.log(`[ION AP User Sync] [DIC=${dic}] Company fetched: ionApOrgId=${company.ionApOrgId}, ionApStatus=${company.ionApStatus}`)

  if (company.ionApStatus !== "success" || !company.ionApOrgId) {
    const error = `Company not registered on ION AP (status=${company.ionApStatus})`
    console.error(`[ION AP User Sync] [DIC=${dic}] ${error}`)
    await updateAssignmentStatus(supabase, assignmentId, "failed", error)
    await logAuditEventAdmin({
      userId: assignment.userId,
      companyId: company.id,
      action: "onboarding.ionap.user.failed",
      outcome: "failure",
      sourceIp: "system",
      userAgent: "ion-ap-user-sync",
      requestMethod: "POST",
      requestPath: `/ionap/organizations/${company.ionApOrgId || "?"}/users`,
      responseStatus: 0,
      correlationId,
      details: { dic, assignmentId, error, step: "ionap_user_creation" },
    })
    return { success: false, error }
  }

  // Fetch user email from auth
  const { data: { user } } = await supabase.auth.admin.getUserById(assignment.userId)
  if (!user?.email) {
    const error = "User email not found"
    console.error(`[ION AP User Sync] [DIC=${dic}] ${error}: userId=${assignment.userId}`)
    await updateAssignmentStatus(supabase, assignmentId, "failed", error)
    return { success: false, error }
  }

  console.log(`[ION AP User Sync] [DIC=${dic}] Creating ION AP user: orgId=${company.ionApOrgId}, email=${user.email}, assignmentId=${assignmentId}`)

  // Audit: user sync started
  await logAuditEventAdmin({
    userId: assignment.userId,
    companyId: company.id,
    action: "onboarding.ionap.user.sync",
    outcome: "pending",
    sourceIp: "system",
    userAgent: "ion-ap-user-sync",
    requestMethod: "POST",
    requestPath: `/ionap/organizations/${company.ionApOrgId}/users`,
    responseStatus: 0,
    correlationId,
    details: { dic, email: user.email, assignmentId, orgId: company.ionApOrgId, step: "ionap_user_creation" },
  })

  try {
    const client = new IonApClient()
    console.log(`[ION AP User Sync] [DIC=${dic}] Calling ION AP createUser + getUsers for orgId=${company.ionApOrgId}`)
    const result = await client.registerUser(company.ionApOrgId, user.email)

    console.log(`[ION AP User Sync] [DIC=${dic}] User registered successfully: ionApUserId=${result.userId}, authToken=${result.authToken ? "(present)" : "(missing)"}`)

    // Save to companyAssignment
    const { error: updateError } = await supabase
      .from("companyAssignments")
      .update({
        ionApUserId: result.userId,
        ionApAuthToken: result.authToken,
        ionApUserStatus: "success",
        ionApUserError: null,
      })
      .eq("id", assignmentId)

    if (updateError) {
      console.error(`[ION AP User Sync] [DIC=${dic}] DB update failed: assignmentId=${assignmentId}`, updateError.message)
    } else {
      console.log(`[ION AP User Sync] [DIC=${dic}] DB updated: assignmentId=${assignmentId}, ionApUserStatus=success, ionApUserId=${result.userId}`)
    }

    // Audit: user sync success
    await logAuditEventAdmin({
      userId: assignment.userId,
      companyId: company.id,
      action: "onboarding.ionap.user.success",
      outcome: "success",
      sourceIp: "system",
      userAgent: "ion-ap-user-sync",
      requestMethod: "POST",
      requestPath: `/ionap/organizations/${company.ionApOrgId}/users`,
      responseStatus: 200,
      correlationId,
      details: { dic, email: user.email, assignmentId, ionApUserId: result.userId, hasAuthToken: !!result.authToken, step: "ionap_user_creation" },
    })

    return { success: true, userId: result.userId, authToken: result.authToken }
  } catch (err) {
    const errorMessage = err instanceof IonApApiError
      ? `${err.status}: ${JSON.stringify(err.body)}`
      : err instanceof Error
        ? err.message
        : "Unknown error"

    console.error(`[ION AP User Sync] [DIC=${dic}] Failed for assignmentId=${assignmentId}: ${errorMessage}`)
    await updateAssignmentStatus(supabase, assignmentId, "failed", errorMessage)

    // Audit: user sync failed
    await logAuditEventAdmin({
      userId: assignment.userId,
      companyId: company.id,
      action: "onboarding.ionap.user.failed",
      outcome: "failure",
      sourceIp: "system",
      userAgent: "ion-ap-user-sync",
      requestMethod: "POST",
      requestPath: `/ionap/organizations/${company.ionApOrgId}/users`,
      responseStatus: 502,
      correlationId,
      details: { dic, email: user.email, assignmentId, error: errorMessage, step: "ionap_user_creation" },
    })

    return { success: false, error: errorMessage }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateAssignmentStatus(supabase: any, assignmentId: string, status: string, error: string) {
  const { error: updateError } = await supabase
    .from("companyAssignments")
    .update({
      ionApUserStatus: status,
      ionApUserError: error,
    })
    .eq("id", assignmentId)

  if (updateError) {
    console.error(`[ION AP User Sync] DB status update failed: assignmentId=${assignmentId}`, updateError.message)
  }
}
