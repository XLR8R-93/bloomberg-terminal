import { NextResponse } from 'next/server'
import { getCached, setCached } from '@/lib/cache'

export interface EconEvent {
  event:    string
  country:  string
  time:     string   // "YYYY-MM-DD HH:MM:SS" — we use "YYYY-MM-DD 00:00:00" when exact time unknown
  impact:   'high' | 'medium' | 'low' | ''
  actual:   number | null
  estimate: number | null
  prev:     number | null
  unit:     string
}

// Known FRED release IDs mapped to display info
const FRED_RELEASES: {
  id: number
  event: string
  country: string
  impact: 'high' | 'medium' | 'low'
  unit: string
  // Optional: FRED series ID to pull latest actual value
  seriesId?: string
  transform?: 'level' | 'yoy' | 'mom' | 'qoq' | 'change'
}[] = [
  // US — high impact
  { id: 50,  event: 'Nonfarm Payrolls',          country: 'US', impact: 'high',   unit: 'K',  seriesId: 'PAYEMS',    transform: 'change' },
  { id: 50,  event: 'Unemployment Rate',          country: 'US', impact: 'high',   unit: '%',  seriesId: 'UNRATE',    transform: 'level'  },
  { id: 10,  event: 'Consumer Price Index (CPI)', country: 'US', impact: 'high',   unit: '%',  seriesId: 'CPIAUCSL',  transform: 'yoy'    },
  { id: 175, event: 'PCE Price Index',            country: 'US', impact: 'high',   unit: '%',  seriesId: 'PCEPI',     transform: 'yoy'    },
  { id: 19,  event: 'GDP (Advance Estimate)',     country: 'US', impact: 'high',   unit: '%',  seriesId: 'GDPC1',     transform: 'qoq'    },
  // US — medium impact
  { id: 46,  event: 'Producer Price Index (PPI)', country: 'US', impact: 'medium', unit: '%',  seriesId: 'PPIACO',    transform: 'yoy'    },
  { id: 14,  event: 'Retail Sales',               country: 'US', impact: 'medium', unit: '%',  seriesId: 'RSAFS',     transform: 'mom'    },
  { id: 22,  event: 'Industrial Production',      country: 'US', impact: 'medium', unit: '%',  seriesId: 'INDPRO',    transform: 'yoy'    },
  { id: 108, event: 'Consumer Sentiment (UMich)', country: 'US', impact: 'medium', unit: '',   seriesId: 'UMCSENT',   transform: 'level'  },
  { id: 21,  event: 'Housing Starts',             country: 'US', impact: 'medium', unit: 'K',  seriesId: 'HOUST',     transform: 'level'  },
  { id: 167, event: 'Durable Goods Orders',       country: 'US', impact: 'medium', unit: '%',  seriesId: 'DGORDER',   transform: 'mom'    },
  // US — low impact
  { id: 20,  event: 'Trade Balance',              country: 'US', impact: 'low',    unit: '$B', seriesId: 'BOPGSTB',   transform: 'level'  },
  { id: 82,  event: 'Existing Home Sales',        country: 'US', impact: 'low',    unit: 'M',  seriesId: 'EXHOSLUSM052S', transform: 'level' },
]

// Release IDs we actually want (deduped)
const WANTED_IDS = new Set(FRED_RELEASES.map(r => r.id))

const CACHE_KEY = 'econ:fred-calendar:v2'

async function fetchFREDSeries(seriesId: string, limit: number): Promise<{ date: string; value: number }[]> {
  const key = process.env.FRED_API_KEY
  if (!key) return []
  const start = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString().slice(0, 10)
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&limit=${limit}&sort_order=desc&observation_start=${start}`
  try {
    const res  = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const json = await res.json()
    return (json.observations ?? [])
      .filter((o: { value: string }) => o.value !== '.')
      .map((o: { date: string; value: string }) => ({ date: o.date, value: parseFloat(o.value) }))
      .reverse()
  } catch { return [] }
}

function applyTransform(
  raw: { date: string; value: number }[],
  transform: 'level' | 'yoy' | 'mom' | 'qoq' | 'change'
): number | null {
  if (raw.length === 0) return null
  if (transform === 'level') return raw[raw.length - 1].value
  if (transform === 'mom' || transform === 'change') {
    if (raw.length < 2) return null
    const curr = raw[raw.length - 1].value
    const prev = raw[raw.length - 2].value
    if (transform === 'mom') return parseFloat(((curr / prev - 1) * 100).toFixed(2))
    return parseFloat((curr - prev).toFixed(1))
  }
  if (transform === 'yoy') {
    const isQuarterly = raw.length >= 2 &&
      (new Date(raw[1].date).getTime() - new Date(raw[0].date).getTime()) > 60 * 86_400_000
    const step = isQuarterly ? 4 : 12
    if (raw.length <= step) return null
    const curr = raw[raw.length - 1].value
    const base = raw[raw.length - 1 - step].value
    return parseFloat(((curr / base - 1) * 100).toFixed(2))
  }
  if (transform === 'qoq') {
    if (raw.length < 2) return null
    const curr = raw[raw.length - 1].value
    const prev = raw[raw.length - 2].value
    return parseFloat(((curr / prev - 1) * 100).toFixed(2))
  }
  return null
}

export async function GET() {
  const hit = getCached(CACHE_KEY)
  if (hit) return NextResponse.json(hit)

  const key = process.env.FRED_API_KEY
  if (!key) return NextResponse.json({ error: 'FRED_API_KEY not set' }, { status: 500 })

  // Fetch release dates for next 3 weeks + 1 past week
  const from = new Date(Date.now() - 7  * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10)

  let releaseDates: { release_id: number; release_name: string; date: string }[] = []
  try {
    const url = `https://api.stlouisfed.org/fred/releases/dates?api_key=${key}&file_type=json&realtime_start=${from}&realtime_end=${to}&include_release_dates_with_no_data=true&limit=500&sort_order=asc`
    const res  = await fetch(url, { next: { revalidate: 3600 } })
    if (res.ok) {
      const json = await res.json()
      releaseDates = (json.release_dates ?? []).filter(
        (r: { release_id: number }) => WANTED_IDS.has(r.release_id)
      )
    }
  } catch { /* fall through to empty */ }

  // Fetch latest actual values for all series in parallel
  const uniqueSeries = [...new Set(FRED_RELEASES.filter(r => r.seriesId).map(r => r.seriesId!))]
  const seriesData = new Map<string, { date: string; value: number }[]>()
  await Promise.all(
    uniqueSeries.map(async sid => {
      const data = await fetchFREDSeries(sid, 20)
      seriesData.set(sid, data)
    })
  )

  // Build EconEvent list from release dates
  // Each FRED release_date entry covers all series in that release — dedupe by release_id + date
  const seen = new Set<string>()
  const events: EconEvent[] = []

  for (const rd of releaseDates) {
    // Find all FRED_RELEASES entries matching this release_id
    const configs = FRED_RELEASES.filter(r => r.id === rd.release_id)
    for (const cfg of configs) {
      const key2 = `${rd.release_id}-${cfg.event}-${rd.date}`
      if (seen.has(key2)) continue
      seen.add(key2)

      // Get latest actual value
      let actual: number | null = null
      let prev:   number | null = null
      if (cfg.seriesId && cfg.transform) {
        const raw = seriesData.get(cfg.seriesId) ?? []
        actual = applyTransform(raw, cfg.transform)
        // prev = second-to-last derived value
        if (raw.length >= 2) {
          const sliced = raw.slice(0, -1)
          prev = applyTransform(sliced, cfg.transform)
        }
      }

      events.push({
        event:    cfg.event,
        country:  cfg.country,
        time:     `${rd.date} 00:00:00`,
        impact:   cfg.impact,
        actual:   actual,
        estimate: null,
        prev:     prev,
        unit:     cfg.unit,
      })
    }
  }

  // Sort by date
  events.sort((a, b) => a.time.localeCompare(b.time))

  setCached(CACHE_KEY, events, 60 * 60 * 1000)
  return NextResponse.json(events)
}
