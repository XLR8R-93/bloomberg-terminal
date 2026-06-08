import { getCached, setCached } from '@/lib/cache'
import { fetchCrumb } from '@/lib/providers/yahoo'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export interface CommodityRow {
  symbol: string
  name: string
  group: 'Energy' | 'Metals' | 'Agriculture'
  unit: string
  price: number | null
  change: number | null
  changePct: number | null
  high52: number | null
  low52: number | null
}

const DEFINITIONS: Omit<CommodityRow, 'price' | 'change' | 'changePct' | 'high52' | 'low52'>[] = [
  { symbol: 'CL=F',  name: 'WTI Crude Oil',  group: 'Energy',       unit: '$/bbl'   },
  { symbol: 'BZ=F',  name: 'Brent Crude',    group: 'Energy',       unit: '$/bbl'   },
  { symbol: 'NG=F',  name: 'Natural Gas',    group: 'Energy',       unit: '$/MMBtu' },
  { symbol: 'RB=F',  name: 'Gasoline RBOB',  group: 'Energy',       unit: '$/gal'   },
  { symbol: 'HO=F',  name: 'Heating Oil',    group: 'Energy',       unit: '$/gal'   },
  { symbol: 'GC=F',  name: 'Gold',           group: 'Metals',       unit: '$/oz'    },
  { symbol: 'SI=F',  name: 'Silver',         group: 'Metals',       unit: '$/oz'    },
  { symbol: 'HG=F',  name: 'Copper',         group: 'Metals',       unit: '$/lb'    },
  { symbol: 'PL=F',  name: 'Platinum',       group: 'Metals',       unit: '$/oz'    },
  { symbol: 'PA=F',  name: 'Palladium',      group: 'Metals',       unit: '$/oz'    },
  { symbol: 'ALI=F', name: 'Aluminum',       group: 'Metals',       unit: '$/MT'    },
  { symbol: 'ZC=F',  name: 'Corn',           group: 'Agriculture',  unit: '¢/bu'    },
  { symbol: 'ZW=F',  name: 'Wheat',          group: 'Agriculture',  unit: '¢/bu'    },
  { symbol: 'ZS=F',  name: 'Soybeans',       group: 'Agriculture',  unit: '¢/bu'    },
  { symbol: 'KC=F',  name: 'Coffee',         group: 'Agriculture',  unit: '¢/lb'    },
  { symbol: 'SB=F',  name: 'Sugar #11',      group: 'Agriculture',  unit: '¢/lb'    },
  { symbol: 'CT=F',  name: 'Cotton',         group: 'Agriculture',  unit: '¢/lb'    },
  { symbol: 'CC=F',  name: 'Cocoa',          group: 'Agriculture',  unit: '$/MT'    },
  { symbol: 'LE=F',  name: 'Live Cattle',    group: 'Agriculture',  unit: '¢/lb'    },
]

export async function GET() {
  const key = 'commodities:data'
  const cached = getCached<CommodityRow[]>(key)
  if (cached) return Response.json({ rows: cached, _cached: true })

  try {
    const { crumb, cookie } = await fetchCrumb()
    // Do NOT encodeURIComponent the whole symbols string — commas must stay literal
    const symbolStr = DEFINITIONS.map((d) => d.symbol).join(',')
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolStr}&crumb=${encodeURIComponent(crumb)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,fiftyTwoWeekHigh,fiftyTwoWeekLow`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Yahoo v7 ${res.status}: ${await res.text()}`)
    const json = await res.json()

    const quoteMap = new Map<string, Record<string, number>>()
    for (const q of json?.quoteResponse?.result || []) {
      quoteMap.set(q.symbol, q)
    }

    const rows: CommodityRow[] = DEFINITIONS.map((def) => {
      const q = quoteMap.get(def.symbol)
      return {
        ...def,
        price: q?.regularMarketPrice ?? null,
        change: q?.regularMarketChange ?? null,
        changePct: q?.regularMarketChangePercent ?? null,
        high52: q?.fiftyTwoWeekHigh ?? null,
        low52: q?.fiftyTwoWeekLow ?? null,
      }
    })

    setCached(key, rows, 3 * 60_000)
    return Response.json({ rows })
  } catch (e) {
    const c = getCached<CommodityRow[]>(key)
    if (c) return Response.json({ rows: c, _cached: true })
    return Response.json({ error: String(e) }, { status: 503 })
  }
}
