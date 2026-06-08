import { NextRequest, NextResponse } from 'next/server'
import * as https from 'https'

export interface OptionContract {
  contractSymbol: string
  strike:         number
  lastPrice:      number
  bid:            number
  ask:            number
  change:         number
  pctChange:      number
  volume:         number
  openInterest:   number
  impliedVol:     number  // decimal, e.g. 0.35 = 35%
  inTheMoney:     boolean
  expiration:     number  // unix timestamp
  // Computed Greeks (Black-Scholes approximation)
  delta?:  number
  gamma?:  number
  theta?:  number
  vega?:   number
}

export interface OptionsChain {
  symbol:          string
  price:           number   // current underlying price
  expirations:     number[] // available unix timestamps
  calls:           OptionContract[]
  puts:            OptionContract[]
  pcRatio:         number   // put/call OI ratio
  atmIV:           number   // at-the-money IV
}

// ── Black-Scholes Greeks ─────────────────────────────────────────────────────
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const val = 1 - poly * Math.exp(-x * x)
  return x >= 0 ? val : -val
}
function normCDF(x: number) { return 0.5 * (1 + erf(x / Math.sqrt(2))) }
function normPDF(x: number) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI) }

function computeGreeks(
  S: number, K: number, T: number, r: number, sigma: number, isCall: boolean
): { delta: number; gamma: number; theta: number; vega: number } {
  if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 }
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  const nd1 = normCDF(d1)
  const nd2 = normCDF(d2)
  const npd1 = normPDF(d1)
  const eRT = Math.exp(-r * T)

  const delta = isCall ? nd1 : nd1 - 1
  const gamma = npd1 / (S * sigma * sqrtT)
  // Theta: per calendar day (divide annual by 365)
  const thetaAnnual = isCall
    ? -(S * npd1 * sigma) / (2 * sqrtT) - r * K * eRT * nd2
    : -(S * npd1 * sigma) / (2 * sqrtT) + r * K * eRT * (1 - nd2)
  const theta = thetaAnnual / 365
  const vega = S * npd1 * sqrtT / 100  // per 1% change in IV

  return { delta, gamma, theta, vega }
}

// ── Yahoo Finance session (crumb + cookie) ────────────────────────────────────
// Module-level cache — survives across requests within one server process
let _crumb  = ''
let _cookie = ''
let _crumbFetchedAt = 0
const CRUMB_TTL = 55 * 60 * 1000  // 55 minutes

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Use Node's https.request (no header-size limit) to fetch Yahoo cookies
function httpsGet(url: string, headers: Record<string, string>): Promise<{ body: string; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, maxHeaderSize: 131072 },
      res => {
        // Follow one redirect manually (Yahoo → consent page)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const cookies = (res.headers['set-cookie'] ?? []).map((c: string) => c.split(';')[0])
          httpsGet(res.headers.location, { ...headers, Cookie: cookies.join('; ') })
            .then(r => resolve({ body: r.body, cookies: [...cookies, ...r.cookies] }))
            .catch(reject)
          res.resume()
          return
        }
        const cookies = (res.headers['set-cookie'] ?? []).map((c: string) => c.split(';')[0])
        res.resume()  // discard body — we only need cookies
        resolve({ body: '', cookies })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function getYahooSession(): Promise<{ crumb: string; cookie: string }> {
  if (_crumb && _cookie && Date.now() - _crumbFetchedAt < CRUMB_TTL) {
    return { crumb: _crumb, cookie: _cookie }
  }

  // Step 1: Use https.request (no undici header-limit) to get Yahoo session cookie
  const { cookies } = await httpsGet('https://finance.yahoo.com/', {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  })
  const cookieStr = cookies.join('; ')
  if (!cookieStr) throw new Error('No cookies received from Yahoo Finance')

  // Step 2: Fetch crumb with the session cookie
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookieStr, 'Accept': '*/*' },
  })
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('{') || crumb.includes('<')) {
    throw new Error(`Invalid crumb response: ${crumb.slice(0, 50)}`)
  }

  _crumb = crumb
  _cookie = cookieStr
  _crumbFetchedAt = Date.now()
  return { crumb, cookie: cookieStr }
}

// ── Route handler ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const symbol = searchParams.get('symbol')?.toUpperCase()
  const dateParam = searchParams.get('date')  // unix timestamp string

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    const { crumb, cookie } = await getYahooSession()

    const dateQuery = dateParam ? `&date=${dateParam}` : ''
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?crumb=${encodeURIComponent(crumb)}${dateQuery}`

    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Cookie': cookie,
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      // Crumb may have expired — clear cache and surface error
      _crumb = ''; _cookie = ''; _crumbFetchedAt = 0
      throw new Error(`Yahoo returned ${res.status}`)
    }
    const json = await res.json()
    const result = json?.optionChain?.result?.[0]
    if (!result) throw new Error('No option chain data')

    const quote       = result.quote
    const S           = quote?.regularMarketPrice ?? 0
    const expirations = result.expirationDates ?? []
    const rawOptions  = result.options?.[0] ?? {}
    const rawCalls    = rawOptions.calls ?? []
    const rawPuts     = rawOptions.puts  ?? []

    const now = Date.now() / 1000
    const r   = 0.045  // risk-free rate

    function mapContract(raw: Record<string, number | boolean | string>, isCall: boolean): OptionContract {
      const K      = Number(raw.strike)        || 0
      const T      = Math.max(0, (Number(raw.expiration) - now) / (365 * 24 * 3600))
      const sigma  = Number(raw.impliedVolatility) || 0.3
      const greeks = S > 0 ? computeGreeks(S, K, T, r, sigma, isCall) : { delta: 0, gamma: 0, theta: 0, vega: 0 }
      return {
        contractSymbol: String(raw.contractSymbol ?? ''),
        strike:         K,
        lastPrice:      Number(raw.lastPrice)     || 0,
        bid:            Number(raw.bid)           || 0,
        ask:            Number(raw.ask)           || 0,
        change:         Number(raw.change)        || 0,
        pctChange:      Number(raw.percentChange) || 0,
        volume:         Number(raw.volume)        || 0,
        openInterest:   Number(raw.openInterest)  || 0,
        impliedVol:     sigma,
        inTheMoney:     Boolean(raw.inTheMoney),
        expiration:     Number(raw.expiration)    || 0,
        ...greeks,
      }
    }

    const calls = rawCalls.map((c: Record<string, number | boolean | string>) => mapContract(c, true))
    const puts  = rawPuts.map((p: Record<string, number | boolean | string>)  => mapContract(p, false))

    // Put/call OI ratio
    const callOI = calls.reduce((s: number, c: OptionContract) => s + (c.openInterest || 0), 0)
    const putOI  = puts.reduce((s: number, p: OptionContract)  => s + (p.openInterest  || 0), 0)
    const pcRatio = callOI > 0 ? putOI / callOI : 0

    // ATM IV — closest strike to current price
    const atmCall = calls.reduce((best: OptionContract | null, c: OptionContract) =>
      !best || Math.abs(c.strike - S) < Math.abs(best.strike - S) ? c : best, null)
    const atmIV = atmCall?.impliedVol ?? 0

    const chain: OptionsChain = { symbol, price: S, expirations, calls, puts, pcRatio, atmIV }
    return NextResponse.json(chain)

  } catch (err) {
    console.error('[options]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
