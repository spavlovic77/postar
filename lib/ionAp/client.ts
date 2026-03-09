/**
 * ION AP API Client
 *
 * Manages organizations and identifiers on the ION Access Point.
 * Uses Token-based authentication.
 */

export interface IonApOrganization {
  id: number
  name: string
  country: string
  publish_in_smp: boolean
  reference: string
}

export interface IonApIdentifier {
  id: number
  scheme: string
  identifier: string
  verified: boolean
  publish_receive_peppolbis: boolean
  publish_receive_nlcius: boolean
  publish_receive_invoice_response: boolean
  links?: {
    self: string
  }
}

export interface IonApError {
  detail?: string
  [key: string]: unknown
}

export class IonApClient {
  private baseUrl: string
  private token: string

  constructor() {
    this.baseUrl = process.env.ION_AP_URL || ""
    this.token = process.env.ION_AP_TOKEN || ""

    if (!this.baseUrl || !this.token) {
      throw new Error("ION_AP_URL and ION_AP_TOKEN environment variables are required")
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const method = options.method || "GET"

    console.log(`[ION AP] ${method} ${url}`)
    if (options.body) {
      console.log(`[ION AP] Request body: ${options.body}`)
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${this.token}`,
        ...(options.headers as Record<string, string>),
      },
    })

    if (!response.ok) {
      let errorBody: IonApError = {}
      try {
        errorBody = await response.json()
      } catch {
        // ignore parse errors
      }
      console.error(`[ION AP] ${method} ${url} failed: status=${response.status}`, JSON.stringify(errorBody))
      throw new IonApApiError(
        `ION AP request failed: ${response.status}`,
        response.status,
        errorBody
      )
    }

    const data = await response.json() as T
    console.log(`[ION AP] ${method} ${url} success:`, JSON.stringify(data))
    return data
  }

  /**
   * Create an organization on ION AP
   */
  async createOrganization(params: {
    name: string
    country: string
    reference: string
  }): Promise<IonApOrganization> {
    return this.request<IonApOrganization>("/organizations", {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        country: params.country,
        publish_in_smp: true,
        reference: params.reference,
      }),
    })
  }

  /**
   * Add a Peppol identifier (0245:DIC) to an organization
   */
  async addIdentifier(
    orgId: number,
    dic: string
  ): Promise<IonApIdentifier> {
    return this.request<IonApIdentifier>(
      `/organizations/${orgId}/identifiers`,
      {
        method: "POST",
        body: JSON.stringify({
          identifier: `0245:${dic}`,
          verified: true,
          publish_receive_peppolbis: true,
          publish_receive_nlcius: true,
          publish_receive_invoice_response: true,
        }),
      }
    )
  }

  /**
   * Full registration: create org + add identifier in one call.
   * Returns both the org and identifier IDs.
   */
  async registerCompany(params: {
    dic: string
    reference: string
    name?: string
  }): Promise<{ orgId: number; identifierId: number }> {
    console.log(`[ION AP] registerCompany: dic=${params.dic}, name=${params.name}, reference=${params.reference}`)

    const org = await this.createOrganization({
      name: params.name || "Company",
      country: "SK",
      reference: params.reference,
    })
    console.log(`[ION AP] Organization created: orgId=${org.id}`)

    const identifier = await this.addIdentifier(org.id, params.dic)
    console.log(`[ION AP] Identifier added: identifierId=${identifier.id}, identifier=0245:${params.dic}`)

    return {
      orgId: org.id,
      identifierId: identifier.id,
    }
  }
}

export class IonApApiError extends Error {
  status: number
  body: IonApError

  constructor(message: string, status: number, body: IonApError) {
    super(message)
    this.name = "IonApApiError"
    this.status = status
    this.body = body
  }
}
