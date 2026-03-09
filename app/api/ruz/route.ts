import { NextResponse } from "next/server"
import { lookupByDic } from "@/lib/ruz/lookup"

/**
 * GET /api/ruz?dic=2020273893
 *
 * Looks up a company in the Slovak RUZ register by DIC.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dic = searchParams.get("dic")

  if (!dic || !/^\d{10}$/.test(dic)) {
    return NextResponse.json(
      { error: "Neplatne DIC (presne 10 cislic)" },
      { status: 400 }
    )
  }

  try {
    const data = await lookupByDic(dic)

    if (!data) {
      return NextResponse.json(
        { error: "Subjekt s danym DIC nebol najdeny v registri" },
        { status: 404 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("RUZ lookup error:", error)
    return NextResponse.json(
      { error: "Nepodarilo sa nacitat udaje z registra. Skuste to neskor." },
      { status: 503 }
    )
  }
}
