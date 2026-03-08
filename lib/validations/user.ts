import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email("Neplatná e-mailová adresa"),
  password: z.string().min(8, "Heslo musí mať aspoň 8 znakov"),
})

export const inviteUserSchema = z.object({
  email: z.string().email("Neplatná e-mailová adresa"),
  role: z.enum(["administrator", "accountant"]),
  companyIds: z.array(z.string().uuid()).min(1, "Vyberte aspoň jednu spoločnosť"),
})

export type LoginInput = z.infer<typeof loginSchema>
export type InviteUserInput = z.infer<typeof inviteUserSchema>
