// GET /api/macro
// Returns key US + AU macro indicators extracted from Finnhub economic calendar
import { NextResponse } from 'next/server'
import { getCached, setCached } from '@/lib/cache'

export interface MacroSeries {
  id:             string
  label:          string
  category:       string
  countryCode:    'US' | 'AU'
  unit:           string
  description:    string
  higherIsBetter: boolean | null   // null = neutral
  latest:         number | null
  previous:       number | null
  estimate:       number | null
  latestDate:     string
  series:         { date: string; value: number }[]
}

const INDICATORS: {
  id: string; label: string; category: string; countryCode: 'US' | 'AU'
  unit: string; description: string; higherIsBetter: boolean | null
  patterns: string[]
}[] = [
  // ── US ───────────────────────────────────────────────────────────────────────
  {
    id: 'US_FED_RATE', label: 'Fed Funds Rate', category: 'MONETARY', countryCode: 'US',
    unit: '%', description: 'Federal Reserve target interest rate',
    higherIsBetter: null,
    patterns: ['fed funds rate', 'federal funds rate', 'fed funds target', 'fomc rate decision'],
  },
  {
    id: 'US_CPI_YOY', label: 'CPI (YoY)', category: 'INFLATION', countryCode: 'US',
    unit: '%', description: 'US Consumer Price Index year-over-year',
    higherIsBetter: false,
    patterns: ['cpi y/y', 'cpi yoy', 'consumer price index y/y', 'inflation rate y/y'],
  },
  {
    id: 'US_CORE_CPI', label: 'Core CPI (YoY)', category: 'INFLATION', countryCode: 'US',
    unit: '%', description: 'US CPI ex food & energy',
    higherIsBetter: false,
    patterns: ['core cpi y/y', 'core cpi yoy', 'core consumer price index', 'core inflation rate'],
  },
  {
    id: 'US_PPI_YOY', label: 'PPI (YoY)', category: 'INFLATION', countryCode: 'US',
    unit: '%', description: 'US Producer Price Index year-over-year',
    higherIsBetter: false,
    patterns: ['ppi y/y', 'ppi yoy', 'producer price index y/y'],
  },
  {
    id: 'US_NONFARM', label: 'Nonfarm Payrolls', category: 'EMPLOYMENT', countryCode: 'US',
    unit: 'K', description: 'Monthly US jobs added (thousands)',
    higherIsBetter: true,
    patterns: ['nonfarm payroll', 'non-farm payroll', 'nonfarm employment'],
  },
  {
    id: 'US_UNEMPLOYMENT', label: 'Unemployment Rate', category: 'EMPLOYMENT', countryCode: 'US',
    unit: '%', description: 'US unemployment rate',
    higherIsBetter: false,
    patterns: ['unemployment rate', 'jobless rate'],
  },
  {
    id: 'US_GDP', label: 'GDP (QoQ)', category: 'GROWTH', countryCode: 'US',
    unit: '%', description: 'US real GDP growth quarter-over-quarter',
    higherIsBetter: true,
    patterns: ['gdp growth rate q', 'gdp q/q', 'gdp annualized', 'gdp growth rate'],
  },
  {
    id: 'US_RETAIL', label: 'Retail Sales (MoM)', category: 'CONSUMER', countryCode: 'US',
    unit: '%', description: 'US monthly change in retail sales',
    higherIsBetter: true,
    patterns: ['retail sales m/m', 'retail sales mom', 'advance retail sales'],
  },
  {
    id: 'US_CONSUMER_SENT', label: 'Consumer Sentiment', category: 'CONSUMER', countryCode: 'US',
    unit: '', description: 'UMich Consumer Sentiment Index',
    higherIsBetter: true,
    patterns: ['michigan consumer sentiment', 'consumer sentiment', 'consumer confidence'],
  },
  {
    id: 'US_ISM_MFG', label: 'ISM Manufacturing', category: 'BUSINESS', countryCode: 'US',
    unit: '', description: 'ISM Manufacturing PMI (>50 = expansion)',
    higherIsBetter: true,
    patterns: ['ism manufacturing', 'manufacturing pmi', 'manufacturing index'],
  },
  {
    id: 'US_ISM_SVCS', label: 'ISM Services', category: 'BUSINESS', countryCode: 'US',
    unit: '', description: 'ISM Services PMI (>50 = expansion)',
    higherIsBetter: true,
    patterns: ['ism services', 'services pmi', 'non-manufacturing pmi', 'services index'],
  },
  {
    id: 'US_HOUSING', label: 'Housing Starts', category: 'HOUSING', countryCode: 'US',
    unit: 'K', description: 'US new residential construction (thousands)',
    higherIsBetter: true,
    patterns: ['housing starts', 'building permits'],
  },

  // ── AU ───────────────────────────────────────────────────────────────────────
  {
    id: 'AU_RBA_RATE', label: 'RBA Cash Rate', category: 'MONETARY', countryCode: 'AU',
    unit: '%', description: 'Reserve Bank of Australia official cash rate target',
    higherIsBetter: null,
    patterns: ['rba rate decision', 'rba cash rate', 'cash rate target', 'rba interest rate'],
  },
  {
    id: 'AU_CPI_YOY', label: 'CPI (YoY)', category: 'INFLATION', countryCode: 'AU',
    unit: '%', description: 'Australia Consumer Price Index year-over-year (quarterly)',
    higherIsBetter: false,
    patterns: ['cpi y/y', 'cpi yoy', 'consumer price index y/y', 'inflation rate y/y', 'trimmed mean cpi'],
  },
  {
    id: 'AU_UNEMPLOYMENT', label: 'Unemployment Rate', category: 'EMPLOYMENT', countryCode: 'AU',
    unit: '%', description: 'Australia unemployment rate',
    higherIsBetter: false,
    patterns: ['unemployment rate', 'jobless rate'],
  },
  {
    id: 'AU_EMPLOYMENT', label: 'Employment Change', category: 'EMPLOYMENT', countryCode: 'AU',
    unit: 'K', description: 'Australia monthly employment change (thousands)',
    higherIsBetter: true,
    patterns: ['employment change', 'jobs added', 'employment growth'],
  },
  {
    id: 'AU_GDP', label: 'GDP (QoQ)', category: 'GROWTH', countryCode: 'AU',
    unit: '%', description: 'Australia real GDP growth quarter-over-quarter',
    higherIsBetter: true,
    patterns: ['gdp growth rate q', 'gdp q/q', 'gdp growth rate'],
  },
  {
    id: 'AU_RETAIL', label: 'Retail Sales (MoM)', category: 'CONSUMER', countryCode: 'AU',
    unit: '%', description: 'Australia monthly change in retail sales',
    higherIsBetter: true,
    patterns: ['retail sales m/m', 'retail sales mom', 'retail trade'],
  },
  {
    id: 'AU_TRADE', label: 'Trade Balance', category: 'GROWTH', countryCode: 'AU',
    unit: 'B', description: 'Australia monthly trade balance (AUD billions)',
    higherIsBetter: true,
    patterns: ['trade balance', 'goods trade balance', 'current account'],
  },
  {
    id: 'AU_BUILDING', label: 'Building Approvals (MoM)', category: 'HOUSING', countryCode: 'AU',
    unit: '%', description: 'Australia monthly change in building approvals',
    higherIsBetter: true,
    patterns: ['building approvals', 'dwelling approvals', 'building permits'],
  },
  {
    id: 'AU_NAB_BIZ', label: 'NAB Business Confidence', category: 'BUSINESS', countryCode: 'AU',
    unit: '', description: 'NAB Monthly Business Confidence Index',
    higherIsBetter: true,
    patterns: ['nab business confidence', 'business confidence', 'nab business survey'],
  },
  {
    id: 'AU_WESTPAC', label: 'Westpac Consumer Confidence', category: 'CONSUMER', countryCode: 'AU',
    unit: '', description: 'Westpac-Melbourne Institute Consumer Confidence Index',
    higherIsBetter: true,
    patterns: ['westpac consumer', 'westpac consumer confidence', 'consumer confidence index'],
  },
]

function matchIndicator(eventName: string, country: string) {
  const lower = eventName.toLowerCase()
  // Match only indicators for this country
  return INDICATORS.find(
    ind => ind.countryCode === country && ind.patterns.some(p => lower.includes(p))
  )
}

const CACHE_KEY = 'macro:full:v2'

export async function GET() {
  const hit = getCached(CACHE_KEY)
  if (hit) return NextResponse.json(hit)

  const key = process.env.FINNHUB_API_KEY
  if (!key) return NextResponse.json({ error: 'FINNHUB_API_KEY not set' }, { status: 500 })

  const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date(Date.now() + 30  * 86_400_000).toISOString().slice(0, 10)

  try {
    const res  = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) throw new Error(`Finnhub ${res.status}`)
    const json = await res.json()

    const events: {
      event: string; country: string; time: string; impact: string
      actual: number | null; estimate: number | null; prev: number | null; unit: string
    }[] = (json.economicCalendar ?? []).filter(
      (e: { country: string }) => e.country === 'US' || e.country === 'AU'
    )

    // Group by indicator id
    const buckets = new Map<string, typeof events>()
    for (const ev of events) {
      const ind = matchIndicator(ev.event, ev.country)
      if (!ind) continue
      if (!buckets.has(ind.id)) buckets.set(ind.id, [])
      buckets.get(ind.id)!.push(ev)
    }

    const output: MacroSeries[] = INDICATORS.map(ind => {
      const raw = (buckets.get(ind.id) ?? [])
        .filter(e => e.actual != null)
        .sort((a, b) => a.time.localeCompare(b.time))

      const allSorted = (buckets.get(ind.id) ?? []).sort((a, b) => b.time.localeCompare(a.time))
      const mostRecent = allSorted[0]

      const series = raw.slice(-12).map(e => ({
        date:  e.time.slice(0, 10),
        value: e.actual as number,
      }))

      const latest   = raw.length > 0 ? raw[raw.length - 1].actual : null
      const previous = raw.length > 1 ? raw[raw.length - 2].actual : null

      return {
        ...ind,
        latest,
        previous,
        estimate:   mostRecent?.estimate ?? null,
        latestDate: raw.length > 0 ? raw[raw.length - 1].time.slice(0, 10) : '',
        series,
      }
    })

    setCached(CACHE_KEY, output, 60 * 60 * 1000)
    return NextResponse.json(output)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
