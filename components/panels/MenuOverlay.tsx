'use client'
import { useTerminalStore } from '@/lib/store'
import type { PanelView } from '@/lib/store'

interface MenuItem {
  num: number
  code: PanelView
  label: string
  desc: string
}

const MENU_ITEMS: MenuItem[] = [
  { num: 1,  code: 'GIP', label: 'GP',   desc: 'Graph & Price Chart' },
  { num: 2,  code: 'DES', label: 'DES',  desc: 'Security Description' },
  { num: 3,  code: 'KS',  label: 'KS',   desc: 'Key Statistics' },
  { num: 4,  code: 'FA',  label: 'FA',   desc: 'Financial Analysis' },
  { num: 5,  code: 'EE',  label: 'EE',   desc: 'Earnings & Estimates' },
  { num: 6,  code: 'EST', label: 'EST',  desc: 'Analyst Consensus & Price Target' },
  { num: 6,  code: 'RV',  label: 'RV',   desc: 'Relative Value / Peers' },
  { num: 7,  code: 'CN',  label: 'CN',   desc: 'Individual Company News' },
  { num: 8,  code: 'TOP',  label: 'TOP',  desc: 'Market Overview & Movers' },
  { num: 9,  code: 'WB',   label: 'WB',   desc: 'World Bond Markets & Yield Curve' },
  { num: 10, code: 'GLCO', label: 'GLCO', desc: 'Global Commodity Prices' },
  { num: 11, code: 'PORT', label: 'PORT', desc: 'Portfolio Tracker' },
  { num: 12, code: 'WL',   label: 'WL',   desc: 'Watchlist' },
  { num: 13, code: 'HELP', label: 'HELP', desc: 'Help & Key Bindings' },
]

const LEFT = MENU_ITEMS.slice(0, 5)
const RIGHT = MENU_ITEMS.slice(5)

function MenuRow({ item, active, onSelect }: {
  item: MenuItem
  active: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '4px 10px',
        cursor: 'pointer',
        background: active ? '#0d1f0d' : 'transparent',
        borderLeft: active ? '2px solid #ffa028' : '2px solid transparent',
      }}
    >
      <span style={{ color: '#444', fontSize: 11, width: 18, textAlign: 'right', flexShrink: 0 }}>
        {item.num})
      </span>
      <span style={{
        color: active ? '#ffa028' : '#4d9fff',
        fontSize: 12,
        fontWeight: 'bold',
        width: 36,
        flexShrink: 0,
        letterSpacing: '0.05em',
      }}>
        {item.label}
      </span>
      <span style={{ color: active ? '#cccccc' : '#888', fontSize: 11 }}>
        {item.desc}
      </span>
    </div>
  )
}

export function MenuOverlay() {
  const { activeView, activeTicker, setActiveView, setMenuOpen } = useTerminalStore()

  const navigate = (view: PanelView) => {
    setActiveView(view)
    setMenuOpen(false)
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: 0,
      background: 'rgba(0,0,0,0.7)',
    }}>
      <div style={{
        width: '100%',
        background: '#060606',
        border: '1px solid #2a2a2a',
        borderTop: 'none',
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: '1px solid #1a1a1a',
          background: '#090909',
        }}>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.04em' }}>
            <span style={{ color: '#4d9fff', cursor: 'pointer' }} onClick={() => setMenuOpen(false)}>
              Main Menu of Bloomberg Functions
            </span>
            <span style={{ color: '#333', margin: '0 6px' }}>{'>'}</span>
            <span style={{ color: '#555' }}>Equities</span>
            <span style={{ color: '#333', margin: '0 6px' }}>{'>'}</span>
            <span style={{ color: '#777' }}>Analyze {activeTicker} Equity</span>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            style={{
              background: 'none', border: '1px solid #333', cursor: 'pointer',
              color: '#888', fontSize: 10, padding: '2px 8px',
              fontFamily: 'inherit', letterSpacing: '0.06em',
            }}
          >
            {'<Cancel>'} ×
          </button>
        </div>

        {/* Two-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 0 12px' }}>
          <div>
            {LEFT.map((item) => (
              <MenuRow
                key={item.code}
                item={item}
                active={activeView === item.code}
                onSelect={() => navigate(item.code)}
              />
            ))}
          </div>
          <div style={{ borderLeft: '1px solid #111' }}>
            {RIGHT.map((item) => (
              <MenuRow
                key={item.code}
                item={item}
                active={activeView === item.code}
                onSelect={() => navigate(item.code)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
