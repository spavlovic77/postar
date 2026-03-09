/**
 * RUZ (Register Uctovnych Zavierok) - Slovak company registry lookup.
 *
 * Searches by DIC (tax ID) and returns company details.
 * API: https://www.registeruz.sk/cruz-public/api/
 */

interface RuzSearchResponse {
  id: number[]
  existujeDalsieId: boolean
}

interface RuzDetailResponse {
  id: number
  nazovUJ: string
  ico: string
  dic?: string
  mesto?: string
  ulica?: string
  psc?: string
  pravnaForma?: string
  kraj?: string
  okres?: string
  datumZalozenia?: string
}

export interface RuzCompanyData {
  ico: string
  companyName: string
  dic: string | null
  street: string | null
  city: string | null
  postalCode: string | null
}

/**
 * Look up a company in the Slovak RUZ register by DIC.
 * Returns null if not found.
 */
export async function lookupByDic(dic: string): Promise<RuzCompanyData | null> {
  console.log("[v0] ========== RUZ LOOKUP START ==========")
  console.log("[v0] Looking up DIC:", dic)
  
  // Step 1: Search by DIC
  const searchUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&pokracovat-za-id=1&max-zaznamov=1&dic=${dic}`
  console.log("[v0] RUZ search URL:", searchUrl)
  
  const searchRes = await fetch(searchUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  })

  console.log("[v0] RUZ search response status:", searchRes.status)

  if (!searchRes.ok) {
    console.error("[v0] RUZ search failed with status:", searchRes.status)
    throw new Error(`RUZ search failed: ${searchRes.status}`)
  }

  const searchData: RuzSearchResponse = await searchRes.json()
  console.log("[v0] RUZ search result:", JSON.stringify(searchData))

  if (!searchData.id || searchData.id.length === 0) {
    console.log("[v0] No company found in RUZ for DIC:", dic)
    return null
  }

  console.log("[v0] Found RUZ internal ID:", searchData.id[0])

  // Step 2: Get detail by internal ID
  const detailUrl = `https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${searchData.id[0]}`
  console.log("[v0] RUZ detail URL:", detailUrl)
  
  const detailRes = await fetch(detailUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  })

  console.log("[v0] RUZ detail response status:", detailRes.status)

  if (!detailRes.ok) {
    console.error("[v0] RUZ detail fetch failed with status:", detailRes.status)
    throw new Error(`RUZ detail fetch failed: ${detailRes.status}`)
  }

  const detail: RuzDetailResponse = await detailRes.json()
  console.log("[v0] RUZ detail result:", JSON.stringify(detail))

  const result = {
    ico: detail.ico,
    companyName: detail.nazovUJ || "",
    dic: detail.dic || null,
    street: detail.ulica || null,
    city: detail.mesto || null,
    postalCode: detail.psc || null,
  }
  
  console.log("[v0] RUZ lookup result:", JSON.stringify(result))
  console.log("[v0] ========== RUZ LOOKUP END ==========")
  
  return result
}
