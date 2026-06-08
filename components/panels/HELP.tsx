'use client'
import { useTerminalStore } from '@/lib/store'
import { FUNCTION_HELP } from '@/lib/command-parser'

export function HELP() {
  const { setActiveView } = useTerminalStore()

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-mnemonic">HELP — COMMAND REFERENCE</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        <div style={{ color: '#ffa028', fontSize: 13, marginBottom: 8 }}>Bloomberg Terminal Command Reference</div>
        <div style={{ color: '#e8e8e8', fontSize: 11, marginBottom: 16 }}>
          Syntax: <span style={{ color: '#e8e8e8' }}>{'<TICKER> <FUNCTION>'}</span> · e.g.{' '}
          <span style={{ color: '#4d9fff' }}>AAPL DES</span>{' '}·{' '}
          <span style={{ color: '#4d9fff' }}>TSLA GIP</span>{' '}·{' '}
          <span style={{ color: '#4d9fff' }}>NVDA FA</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr>
              <th style={{ color: '#ffa028', textAlign: 'left', padding: '2px 0', fontSize: 11, width: 80 }}>Function</th>
              <th style={{ color: '#ffa028', textAlign: 'left', padding: '2px 0', fontSize: 11 }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {FUNCTION_HELP.map(({ code, desc }) => (
              <tr key={code} style={{ cursor: 'pointer' }} onClick={() => setActiveView(code as Parameters<typeof setActiveView>[0])}>
                <td style={{ color: '#4d9fff', padding: '3px 0', fontSize: 12, fontWeight: 'bold' }}>{code}</td>
                <td style={{ color: '#e8e8e8', padding: '3px 0', fontSize: 11 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ color: '#ffa028', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Keyboard Shortcuts</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['/', 'Focus command bar'],
              ['Enter', 'Submit command'],
              ['Esc', 'Clear / unfocus command bar'],
              ['↑↓', 'Navigate command history / autocomplete'],
            ].map(([key, desc]) => (
              <tr key={key}>
                <td style={{ color: '#ffa028', fontSize: 11, padding: '2px 0', width: 80 }}>{key}</td>
                <td style={{ color: '#d8d8d8', fontSize: 11, padding: '2px 0' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, color: '#e8e8e8', fontSize: 10, borderTop: '1px solid #1f1f1f', paddingTop: 8 }}>
          Data: Finnhub (quotes, profile, news) · Twelve Data / Stooq (charts) · FMP (financials) · SEC EDGAR (fallback)<br />
          Press <span style={{ color: '#ffa028' }}>HELP</span> at any time to return to this screen.
        </div>
      </div>
    </div>
  )
}
