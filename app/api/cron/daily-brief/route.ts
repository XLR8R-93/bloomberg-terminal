import { type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { fetchCrumb } from '@/lib/providers/yahoo'
import { finnhub } from '@/lib/providers/finnhub'

const resend = new Resend(process.env.RESEND_API_KEY)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// ── Config ────────────────────────────────────────────────────────────────────
const TO_EMAIL        = process.env.DAILY_BRIEF_EMAIL ?? 'mark.salescom@gmail.com'
const FROM_EMAIL      = process.env.DAILY_BRIEF_FROM  ?? 'briefs@oakwoodcapital.com.au'
const PORTFOLIO_TICKERS = (process.env.PORTFOLIO_TICKERS ?? 'AAPL,BHP.AX,CBA.AX,CSL.AX,MSFT')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean)

const INDICES = [
  { symbol: '^AXJO',  label: 'ASX 200'  },
  { symbol: '^GSPC',  label: 'S&P 500'  },
  { symbol: '^NDX',   label: 'NDX 100'  },
  { symbol: '^DJI',   label: 'DOW'      },
  { symbol: '^VIX',   label: 'VIX'      },
  { symbol: '^FTSE',  label: 'FTSE 100' },
  { symbol: '^N225',  label: 'NIKKEI'   },
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface Quote { c: number; d: number; dp: number }
interface NewsItem { headline: string; url: string; source: string; datetime: number; summary?: string }

// ── Data fetchers ─────────────────────────────────────────────────────────────
async function fetchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const result: Record<string, Quote> = {}
  const intl  = symbols.filter(s => s.includes('.') || s.includes('=') || s.startsWith('^'))
  const local = symbols.filter(s => !s.includes('.') && !s.includes('=') && !s.startsWith('^'))

  if (intl.length) {
    try {
      const { crumb, cookie } = await fetchCrumb()
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${intl.join(',')}&crumb=${encodeURIComponent(crumb)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,longName,shortName`
      const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' } })
      if (res.ok) {
        const json = await res.json()
        for (const q of json?.quoteResponse?.result ?? []) {
          result[q.symbol] = { c: q.regularMarketPrice ?? 0, d: q.regularMarketChange ?? 0, dp: q.regularMarketChangePercent ?? 0 }
        }
      }
    } catch { /* skip */ }
  }

  await Promise.allSettled(local.map(async sym => {
    try {
      const q = await finnhub.quote(sym)
      if (q?.c) result[sym] = { c: q.c, d: q.d ?? 0, dp: q.dp ?? 0 }
    } catch { /* skip */ }
  }))

  return result
}

async function fetchTopNews(): Promise<NewsItem[]> {
  try {
    const data = await finnhub.marketNews()
    return (Array.isArray(data) ? data : []).slice(0, 3)
  } catch { return [] }
}

async function fetchPortfolioNames(symbols: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {}
  await Promise.allSettled(symbols.map(async sym => {
    try {
      const p = await finnhub.profile(sym)
      if (p?.name) names[sym] = p.name
    } catch { /* skip */ }
  }))
  return names
}

// ── Colour helpers ────────────────────────────────────────────────────────────
function upColor(v: number)  { return v >= 0 ? '#2d7a4f' : '#c0392b' }
function upArrow(v: number)  { return v >= 0 ? '▲' : '▼' }
function fmtPct(v: number)   { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` }
function fmtNum(v: number)   {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1000)  return v.toLocaleString('en-US', { maximumFractionDigits: 1 })
  return v.toFixed(2)
}

// ── Email template ────────────────────────────────────────────────────────────
function buildEmail(
  date: string,
  indices: { label: string; quote: Quote | null }[],
  news: NewsItem[],
  portfolio: { ticker: string; name: string; quote: Quote | null }[],
): string {
  const cell = `style="padding:6px 12px;border-bottom:1px solid #e8f0eb;font-family:Arial,sans-serif;font-size:13px;"`
  const cellR = `style="padding:6px 12px;border-bottom:1px solid #e8f0eb;font-family:Arial,sans-serif;font-size:13px;text-align:right;"`

  const indexRows = indices.map(({ label, quote }) => {
    if (!quote) return `<tr><td ${cell}>${label}</td><td ${cellR}>—</td><td ${cellR}>—</td></tr>`
    const col = upColor(quote.dp)
    return `<tr>
      <td ${cell}><strong>${label}</strong></td>
      <td ${cellR}>${fmtNum(quote.c)}</td>
      <td ${cellR} style="color:${col};font-weight:600;">${upArrow(quote.dp)} ${fmtPct(quote.dp)}</td>
    </tr>`
  }).join('')

  const newsItems = news.length === 0
    ? `<p style="color:#888;font-style:italic;font-size:13px;">No market news available today.</p>`
    : news.map((n, i) => `
      <div style="margin-bottom:${i < news.length - 1 ? '16px' : '0'};padding-bottom:${i < news.length - 1 ? '16px' : '0'};border-bottom:${i < news.length - 1 ? '1px solid #e8f0eb' : 'none'};">
        <a href="${n.url}" style="color:#1a3a27;font-weight:700;font-size:13px;text-decoration:none;font-family:Georgia,serif;line-height:1.4;display:block;margin-bottom:4px;">${n.headline}</a>
        ${n.summary ? `<p style="color:#555;font-size:12px;font-family:Arial,sans-serif;margin:0 0 4px;line-height:1.5;">${n.summary.slice(0, 160)}${n.summary.length > 160 ? '…' : ''}</p>` : ''}
        <span style="color:#999;font-size:11px;font-family:Arial,sans-serif;">${n.source} · ${new Date(n.datetime * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>`).join('')

  const portfolioRows = portfolio.length === 0
    ? `<tr><td colspan="3" style="padding:12px;color:#888;font-style:italic;font-size:13px;">No portfolio holdings configured.</td></tr>`
    : portfolio.map(({ ticker, name, quote }) => {
        if (!quote) return `<tr><td ${cell}>${ticker}</td><td ${cellR}>—</td><td ${cellR}>—</td></tr>`
        const col = upColor(quote.dp)
        return `<tr>
          <td ${cell}>
            <strong style="font-family:monospace;">${ticker}</strong>
            ${name ? `<span style="color:#888;font-size:11px;margin-left:6px;">${name}</span>` : ''}
          </td>
          <td ${cellR}>$${fmtNum(quote.c)}</td>
          <td ${cellR} style="color:${col};font-weight:600;">${upArrow(quote.dp)} ${fmtPct(quote.dp)}</td>
        </tr>`
      }).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f4;font-family:Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f4;padding:24px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #c8ddd0;border-radius:2px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#1a3a27;padding:18px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-family:Georgia,serif;font-size:18px;color:#ffffff;font-weight:400;letter-spacing:0.02em;">Oakwood Capital</div>
                  <div style="font-family:Arial,sans-serif;font-size:11px;color:#9dbfaa;margin-top:2px;letter-spacing:0.08em;text-transform:uppercase;">Daily Market Brief</div>
                </td>
                <td align="right" valign="middle">
                  <div style="font-family:Arial,sans-serif;font-size:11px;color:#9dbfaa;">${date}</div>
                  <div style="font-family:Arial,sans-serif;font-size:9px;color:#6a9a7a;margin-top:2px;letter-spacing:0.1em;">CONFIDENTIAL</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Gold rule -->
        <tr><td style="height:3px;background:#c9a84c;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Index Performance -->
        <tr>
          <td style="padding:20px 24px 8px;">
            <div style="font-family:Georgia,serif;font-size:13px;color:#2d6a4f;font-weight:400;letter-spacing:0.04em;border-bottom:1px solid #c8ddd0;padding-bottom:6px;margin-bottom:4px;text-transform:uppercase;">
              Index Performance
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <thead>
                <tr style="background:#edf5f0;">
                  <th style="padding:6px 12px;text-align:left;font-size:10px;color:#6a9a7a;font-family:Arial,sans-serif;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Index</th>
                  <th style="padding:6px 12px;text-align:right;font-size:10px;color:#6a9a7a;font-family:Arial,sans-serif;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Last</th>
                  <th style="padding:6px 12px;text-align:right;font-size:10px;color:#6a9a7a;font-family:Arial,sans-serif;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Change</th>
                </tr>
              </thead>
              <tbody>${indexRows}</tbody>
            </table>
          </td>
        </tr>

        <!-- Top News -->
        <tr>
          <td style="padding:4px 24px 8px;">
            <div style="font-family:Georgia,serif;font-size:13px;color:#2d6a4f;font-weight:400;letter-spacing:0.04em;border-bottom:1px solid #c8ddd0;padding-bottom:6px;margin-bottom:12px;text-transform:uppercase;">
              Market News
            </div>
            ${newsItems}
          </td>
        </tr>

        <!-- Portfolio Holdings -->
        <tr>
          <td style="padding:16px 24px 8px;">
            <div style="font-family:Georgia,serif;font-size:13px;color:#2d6a4f;font-weight:400;letter-spacing:0.04em;border-bottom:1px solid #c8ddd0;padding-bottom:6px;margin-bottom:4px;text-transform:uppercase;">
              Portfolio Holdings
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <thead>
                <tr style="background:#edf5f0;">
                  <th style="padding:6px 12px;text-align:left;font-size:10px;color:#6a9a7a;font-family:Arial,sans-serif;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Holding</th>
                  <th style="padding:6px 12px;text-align:right;font-size:10px;color:#6a9a7a;font-family:Arial,sans-serif;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Price</th>
                  <th style="padding:6px 12px;text-align:right;font-size:10px;color:#6a9a7a;font-family:Arial,sans-serif;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Day Chg</th>
                </tr>
              </thead>
              <tbody>${portfolioRows}</tbody>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#1a3a27;padding:14px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:Arial,sans-serif;font-size:9px;color:#6a9a7a;line-height:1.5;">
                  This communication has been prepared by Oakwood Capital Pty Ltd for informational purposes only and does not constitute financial advice or a recommendation to buy or sell any security. Recipients should seek independent financial advice before making investment decisions. Oakwood Capital Pty Ltd is not licensed to provide financial product advice under the Corporations Act 2001 (Cth).
                </td>
                <td align="right" valign="middle" style="padding-left:16px;white-space:nowrap;">
                  <div style="font-family:Georgia,serif;font-size:10px;color:#9dbfaa;">Oakwood Capital</div>
                  <div style="font-family:Arial,sans-serif;font-size:9px;color:#6a9a7a;margin-top:2px;">Mark Elakawi</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Gold footer rule -->
        <tr><td style="height:3px;background:#c9a84c;font-size:0;line-height:0;">&nbsp;</td></tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Verify cron secret so the endpoint can't be called publicly
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // Fetch everything in parallel
  const indexSymbols  = INDICES.map(i => i.symbol)
  const allSymbols    = [...new Set([...indexSymbols, ...PORTFOLIO_TICKERS])]

  const [quotes, news, names] = await Promise.all([
    fetchQuotes(allSymbols),
    fetchTopNews(),
    fetchPortfolioNames(PORTFOLIO_TICKERS),
  ])

  const indices = INDICES.map(idx => ({ label: idx.label, quote: quotes[idx.symbol] ?? null }))
  const portfolio = PORTFOLIO_TICKERS.map(t => ({ ticker: t, name: names[t] ?? '', quote: quotes[t] ?? null }))

  const html = buildEmail(date, indices, news, portfolio)

  const { error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      [TO_EMAIL],
    subject: `Oakwood Capital — Daily Brief ${date}`,
    html,
  })

  if (error) {
    console.error('Resend error:', error)
    return Response.json({ error }, { status: 500 })
  }

  return Response.json({ ok: true, sentTo: TO_EMAIL, date })
}
