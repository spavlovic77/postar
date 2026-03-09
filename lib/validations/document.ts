import { z } from "zod"

export const sendDocumentSchema = z.object({
  companyId: z.string().uuid("Invalid company ID"),
  documentType: z.enum(["invoice", "creditNote"]),
  documentId: z.string().min(1, "Document ID required"),
  receiverParticipantId: z
    .string()
    .regex(
      /^0245:\d{10}$/,
      "Invalid Peppol Participant ID (format: 0245:XXXXXXXXXX)"
    ),
  payload: z
    .string()
    .min(1, "XML payload required")
    .refine(
      (val) =>
        val.trim().startsWith("<?xml") ||
        val.trim().startsWith("<Invoice") ||
        val.trim().startsWith("<CreditNote"),
      "Payload must be valid UBL 2.1 XML"
    ),
})

export const companySchema = z.object({
  dic: z
    .string()
    .regex(
      /^\d{10}$/,
      "Neplatný formát DIČ (musí byť presne 10 číslic, bez SK prefixu)"
    ),
  legalName: z.string().min(2, "Obchodné meno je povinné"),
  adminEmail: z.string().email("Neplatná e-mailová adresa").optional().or(z.literal("")),
  accessPointProviderId: z.string().uuid("Neplatný prístupový bod").optional().or(z.literal("")),
  pfsVerificationToken: z.string().optional().or(z.literal("")),
  status: z.enum(["draft", "active", "suspended"]).optional(),
})

export const companyUpdateSchema = z.object({
  legalName: z.string().min(2, "Obchodné meno je povinné").optional(),
  adminEmail: z.string().email("Neplatná e-mailová adresa").optional().or(z.literal("")),
  accessPointProviderId: z.string().uuid("Neplatný prístupový bod").optional().or(z.literal("")),
  pfsVerificationToken: z.string().optional().or(z.literal("")),
  status: z.enum(["draft", "active", "suspended"]).optional(),
})

export const accessPointSchema = z.object({
  name: z.string().min(2, "Name required"),
  baseUrl: z.string().url("Invalid URL"),
  clientId: z.string().min(1, "Client ID required"),
  clientSecret: z.string().min(1, "Client Secret required"),
})

export type SendDocumentInput = z.infer<typeof sendDocumentSchema>
export type CompanyInput = z.infer<typeof companySchema>
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>
export type AccessPointInput = z.infer<typeof accessPointSchema>
