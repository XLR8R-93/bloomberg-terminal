import { NextRequest, NextResponse } from 'next/server'

export interface EconEvent {
  event:    string
  country:  string
  time:     string   // "YYYY-MM-DD HH:MM:SS"
  impact:   'high' | 'medium' | 'low' | ''
  actual:   number | null
  estimate: number | null
  prev:     number | null
  unit:     string
}

export async function GET(req: NextRequest) {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return NextResponse.json({ error: 'FINNHUB_API_KEY not set' }, { status: 500 })

  // Fetch 3 weeks: 1 past + 2 ahead (enough to always show a full week of upcoming)
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`,
      { next: { revalidate: 3600 } }  // cache 1h — events don't change often
    )
    if (!res.ok) throw new Error(`Finnhub ${res.status}`)
    const json = await res.json()

    const events: EconEvent[] = (json.economicCalendar ?? []).map((e: Record<string, unknown>) => ({
      event:    String(e.event    ?? ''),
      country:  String(e.country  ?? ''),
      time:     String(e.time     ?? ''),
      impact:   String(e.impact   ?? '') as EconEvent['impact'],
      actual:   e.actual   != null ? Number(e.actual)   : null,
      estimate: e.estimate != null ? Number(e.estimate) : null,
      prev:     e.prev     != null ? Number(e.prev)     : null,
      unit:     String(e.unit ?? ''),
    }))

    return NextResponse.json(events)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
