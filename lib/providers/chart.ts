export interface OHLCBar {
  time: number // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

type Range = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y'

// --- Twelve Data ---
async function twelveDataSeries(symbol: string, interval: string, outputsize: number): Promise<OHLCBar[]> {
  const key = process.env.TWELVE_DATA_API_KEY
  if (!key) throw new Error('TWELVE_DATA_API_KEY not set')
  const url = new URL('https://api.twelvedata.com/time_series')
  url.searchParams.set('symbol', symbol)
  url.searchParams.set('interval', interval)
  url.searchParams.set('outputsize', String(outputsize))
  url.searchParams.set('apikey', key)
  const res = await fetch(url.toString())
  const json = await res.json()
  if (json.status === 'error' || !json.values) throw new Error(json.message || 'Twelve Data error')
  return (json.values as Record<string, string>[]).map((v) => ({
    time: Math.floor(new Date(v.datetime).getTime() / 1000),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: v.volume ? parseFloat(v.volume) : undefined,
  })).reverse()
}

// --- Yahoo Finance fallback (no key required) ---
function rangeToYahoo(range: Range): { interval: string; yahooRange: string } {
  switch (range) {
    case '1D':  return { interval: '5m',  yahooRange: '1d' }
    case '5D':  return { interval: '30m', yahooRange: '5d' }
    case '1M':  return { interval: '1d',  yahooRange: '1mo' }
    case '6M':  return { interval: '1d',  yahooRange: '6mo' }
    case 'YTD': return { interval: '1d',  yahooRange: 'ytd' }
    case '1Y':  return { interval: '1wk', yahooRange: '1y' }
    case '5Y':  return { interval: '1wk', yahooRange: '5y' }
  }
}

async function yahooFinance(symbol: string, range: Range): Promise<OHLCBar[]> {
  const { interval, yahooRange } = rangeToYahoo(range)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${yahooRange}&includePrePost=false`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; bloomberg-terminal/1.0)',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status}`)
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('Yahoo Finance: no result')

  const timestamps: number[] = result.timestamp || []
  const ohlcv = result.indicators?.quote?.[0]
  if (!ohlcv || !timestamps.length) throw new Error('Yahoo Finance: missing OHLCV')

  const bars: OHLCBar[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i]
    const o = ohlcv.open?.[i]
    const h = ohlcv.high?.[i]
    const l = ohlcv.low?.[i]
    const c = ohlcv.close?.[i]
    if (t == null || o == null || c == null) continue
    bars.push({ time: t, open: o, high: h ?? o, low: l ?? o, close: c, volume: ohlcv.volume?.[i] })
  }
  return bars
}

// --- Param mapping for Twelve Data ---
function rangeToTwelveData(range: Range): { interval: string; outputsize: number } {
  switch (range) {
    case '1D':  return { interval: '5min',  outputsize: 78 }
    case '5D':  return { interval: '30min', outputsize: 65 }
    case '1M':  return { interval: '1day',  outputsize: 22 }
    case '6M':  return { interval: '1day',  outputsize: 130 }
    case 'YTD': return { interval: '1day',  outputsize: 252 }
    case '1Y':  return { interval: '1week', outputsize: 52 }
    case '5Y':  return { interval: '1week', outputsize: 260 }
  }
}

export async function fetchChartData(symbol: string, range: Range): Promise<OHLCBar[]> {
  // Twelve Data primary (if key set)
  if (process.env.TWELVE_DATA_API_KEY) {
    try {
      const { interval, outputsize } = rangeToTwelveData(range)
      return await twelveDataSeries(symbol, interval, outputsize)
    } catch (_) {
      // fall through
    }
  }

  // Yahoo Finance fallback (keyless)
  return yahooFinance(symbol, range)
}
