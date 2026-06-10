'use client'
import { useQuery } from '@tanstack/react-query'
import type { BondsData, CurvePoint, SovereignRow } from '@/app/api/bonds/route'

// â"€â"€ Yield Curve SVG â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function YieldCurve({ points }: { points: CurvePoint[] }) {
  const valid = points.filter((p) => p.yield != null)
  if (valid.length < 2) return <div style={{ color: '#888', fontSize: 11, padding: 20 }}>Curve data unavailable</div>

  const W = 540; const H = 130
  const PAD = { top: 12, right: 16, bottom: 28, left: 36 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const mats = valid.map((p) => p.maturityYears)
  const yields = valid.map((p) => p.yield as number)
  const minY = Math.min(...yields) - 0.1
  const maxY = Math.max(...yields) + 0.1
  const minM = 0
  const maxM = Math.max(...mats)

  const px = (m: number) => PAD.left + ((m - minM) / (maxM - minM)) * plotW
  const py = (y: number) => PAD.top + plotH - ((y - minY) / (maxY - minY)) * plotH

  // Smooth polyline path
  const pts = valid.map((p) => `${px(p.maturityYears).toFixed(1)},${py(p.yield as number).toFixed(1)}`)
  const polyline = pts.join(' ')

  // Area fill path
  const areaPath = `M ${px(valid[0].maturityYears)},${PAD.top + plotH} L ${pts.join(' L ')} L ${px(valid[valid.length - 1].maturityYears)},${PAD.top + plotH} Z`

  // Y-axis ticks
  const yTicks: number[] = []
  const step = (maxY - minY) > 3 ? 1 : 0.5
  for (let v = Math.ceil(minY / step) * step; v <= maxY + 0.01; v += step) {
    yTicks.push(parseFloat(v.toFixed(2)))
  }

  // X-axis labels — only a subset to avoid crowding
  const xLabels = valid.filter((_, i) => i === 0 || i === valid.length - 1 || [1, 2, 5, 10, 30].includes(valid[i].maturityYears))

  // 2s10s spread
  const y2 = valid.find((p) => p.maturityYears === 2)?.yield
  const y10 = valid.find((p) => p.maturityYears === 10)?.yield
  const spread = y2 != null && y10 != null ? ((y10 - y2) * 100).toFixed(0) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
        <span style={{ color: '#ffa028', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.06em' }}>US TREASURY YIELD CURVE</span>
        {spread != null && (
          <span style={{ color: Number(spread) >= 0 ? '#33ff66' : '#ff3b3b', fontSize: 10 }}>
            2s10s {Number(spread) >= 0 ? '+' : ''}{spread}bp
          </span>
        )}
      </div>
      <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
        <defs>
          <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffa028" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffa028" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v) => (
          <line key={v} x1={PAD.left} y1={py(v)} x2={W - PAD.right} y2={py(v)}
            stroke="#111" strokeWidth={1} />
        ))}

        {/* Area */}
        <path d={areaPath} fill="url(#curveGrad)" />

        {/* Curve line */}
        <polyline points={polyline} fill="none" stroke="#ffa028" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Data points */}
        {valid.map((p) => (
          <circle key={p.label} cx={px(p.maturityYears)} cy={py(p.yield as number)} r={2.5}
            fill="#ffa028" />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((v) => (
          <text key={v} x={PAD.left - 4} y={py(v) + 3.5} textAnchor="end"
            fill="#555" fontSize={9} fontFamily="monospace">
            {v.toFixed(1)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((p) => (
          <text key={p.label} x={px(p.maturityYears)} y={H - 6} textAnchor="middle"
            fill="#555" fontSize={9} fontFamily="monospace">
            {p.label}
          </text>
        ))}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="#1f1f1f" strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top + plotH} x2={W - PAD.right} y2={PAD.top + plotH} stroke="#1f1f1f" strokeWidth={1} />
      </svg>
    </div>
  )
}

// â"€â"€ Curve stats strip â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function CurveStats({ points }: { points: CurvePoint[] }) {
  const highlight = ['3M', '2Y', '5Y', '10Y', '30Y']
  const shown = points.filter((p) => highlight.includes(p.label))
  return (
    <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #111', borderBottom: '1px solid #111', marginBottom: 16 }}>
      {shown.map((p, i) => (
        <div key={p.label} style={{
          flex: 1, padding: '6px 0', textAlign: 'center',
          borderRight: i < shown.length - 1 ? '1px solid #111' : 'none',
        }}>
          <div style={{ color: '#aaaaaa', fontSize: 9, letterSpacing: '0.06em', marginBottom: 2 }}>{p.label}</div>
          <div style={{ color: '#ffa028', fontSize: 13, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
            {p.yield != null ? p.yield.toFixed(2) : '—'}
          </div>
          <div style={{ color: '#888', fontSize: 8 }}>%</div>
        </div>
      ))}
    </div>
  )
}

// â"€â"€ Sovereign table â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function fmt(v: number | null, dec = 2): string {
  if (v == null) return '—'
  return v.toFixed(dec)
}

function Chg({ v }: { v: number | null }) {
  if (v == null) return <span style={{ color: '#888' }}>—</span>
  const color = v > 0 ? '#33ff66' : v < 0 ? '#ff3b3b' : '#888'
  return <span style={{ color }}>{v > 0 ? '+' : ''}{v.toFixed(2)}</span>
}

function SovereignTable({ rows }: { rows: SovereignRow[] }) {
  return (
    <div>
      <div style={{ color: '#ffa028', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.06em', marginBottom: 6 }}>
        SOVEREIGN BOND YIELDS (%)
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1f1f1f' }}>
            {['Country', '2Y', '5Y', '10Y', '30Y', '10Y Chg'].map((h) => (
              <th key={h} style={{
                color: '#e8e8e8', fontSize: 9, fontWeight: 'normal', textAlign: h === 'Country' ? 'left' : 'right',
                padding: '3px 8px', letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} style={{ borderBottom: '1px solid #0a0a0a' }}>
              <td style={{ padding: '5px 8px', color: '#e8e8e8', fontSize: 11, whiteSpace: 'nowrap' }}>
                <span style={{ marginRight: 6 }}>{row.flag}</span>{row.country}
              </td>
              <td style={{ padding: '5px 8px', color: '#d8d8d8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(row.y2)}</td>
              <td style={{ padding: '5px 8px', color: '#d8d8d8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(row.y5)}</td>
              <td style={{ padding: '5px 8px', color: '#ffa028', textAlign: 'right', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>{fmt(row.y10)}</td>
              <td style={{ padding: '5px 8px', color: '#d8d8d8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(row.y30)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                <Chg v={row.chg10} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// â"€â"€ Main panel â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export function WB() {
  const { data, isLoading, error } = useQuery<BondsData>({
    queryKey: ['bonds'],
    queryFn: () => fetch('/api/bonds').then((r) => r.json()),
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
  })

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <span className="panel-mnemonic">WB — WORLD BOND MARKETS</span>
        {data?.curveDate && (
          <span style={{ color: '#888', fontSize: 10 }}>As of {data.curveDate}</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {isLoading && (
          <div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 13, marginBottom: 6, width: `${60 + (i * 13) % 35}%` }} />
            ))}
          </div>
        )}

        {error && <div style={{ color: '#ff3b3b', fontSize: 11 }}>Failed to load bond data</div>}

        {data && !('error' in data) && (
          <>
            <YieldCurve points={data.curve} />
            <CurveStats points={data.curve} />
            <SovereignTable rows={data.sovereigns} />
          </>
        )}
      </div>
    </div>
  )
}
