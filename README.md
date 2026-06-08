# Bloomberg Terminal

A Bloomberg Terminal–style web application for stocks and company data. Dense, dark, keyboard-driven, monospace — built on real free API data.

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in your API keys (see below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## API Keys

Add to `.env.local`:

| Key | Source | Free Tier | Used For |
|-----|--------|-----------|---------|
| `FINNHUB_API_KEY` | [finnhub.io](https://finnhub.io) | 60 req/min | Quotes, profile, news, earnings — **required** |
| `TWELVE_DATA_API_KEY` | [twelvedata.com](https://twelvedata.com) | 800 req/day, 8/min | Price charts |
| `ALPHA_VANTAGE_API_KEY` | [alphavantage.co](https://www.alphavantage.co) | 25 req/day | Chart fallback |
| `FMP_API_KEY` | [financialmodelingprep.com](https://site.financialmodelingprep.com) | 250 req/day | Financial statements |

Stooq (chart fallback) and SEC EDGAR require no key.

## Navigation

Type in the amber command bar (`/` to focus):

```
AAPL DES    company description
TSLA GIP    price chart
NVDA FA     financial statements
MSFT CN     company news
AAPL KS     key statistics
TSLA EE     earnings & estimates
NVDA RV     peer comparison
TOP         market overview
WL          watchlist
HELP        command reference
```

## Function Codes

| Code | Panel |
|------|-------|
| DES | Security Description |
| GIP | Candlestick chart (intraday + historical) |
| FA | Financial Statements (IS / BS / CF) |
| KS | Key Statistics (valuation, margins, growth) |
| CN | Company News + Market Headlines |
| EE | Earnings History + Analyst Recommendations |
| RV | Relative Value / Peer Comparison |
| WL | Watchlist (persisted to localStorage) |
| TOP | Market Overview (indices, movers) |
| HELP | Command reference |

## Rate Limit Strategy

- Server-side in-memory cache: quotes 15s, news 5min, charts 12h, fundamentals 24h
- All external calls go through Next.js route handlers — API keys never reach the browser
- Graceful degradation: cached data served on error, panels show inline error state on miss
- Stooq fallback (no key) for daily OHLC charts when Twelve Data is unavailable
