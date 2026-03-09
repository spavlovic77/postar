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
  // Step 1: Search by DIC
  const searchUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&pokracovat-za-id=1&max-zaznamov=1&dic=${dic}`
  const searchRes = await fetch(searchUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  })

  if (!searchRes.ok) {
    throw new Error(`RUZ search failed: ${searchRes.status}`)
  }

  const searchData: RuzSearchResponse = await searchRes.json()

  if (!searchData.id || searchData.id.length === 0) {
    return null
  }

  // Step 2: Get detail by internal ID
  const detailUrl = `https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${searchData.id[0]}`
  const detailRes = await fetch(detailUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  })

  if (!detailRes.ok) {
    throw new Error(`RUZ detail fetch failed: ${detailRes.status}`)
  }

  const detail: RuzDetailResponse = await detailRes.json()

  return {
    ico: detail.ico,
    companyName: detail.nazovUJ || "",
    dic: detail.dic || null,
    street: detail.ulica || null,
    city: detail.mesto || null,
    postalCode: detail.psc || null,
  }
}
