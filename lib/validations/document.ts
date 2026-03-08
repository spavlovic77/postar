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
  name: z.string().min(2, "Company name required"),
  dic: z
    .string()
    .regex(
      /^SK\d{10}$/,
      "Invalid DIC format (must be SK followed by 10 digits)"
    ),
  accessPointProviderId: z.string().uuid("Invalid Access Point ID"),
})

export const accessPointSchema = z.object({
  name: z.string().min(2, "Name required"),
  baseUrl: z.string().url("Invalid URL"),
  clientId: z.string().min(1, "Client ID required"),
  clientSecret: z.string().min(1, "Client Secret required"),
})

export type SendDocumentInput = z.infer<typeof sendDocumentSchema>
export type CompanyInput = z.infer<typeof companySchema>
export type AccessPointInput = z.infer<typeof accessPointSchema>
