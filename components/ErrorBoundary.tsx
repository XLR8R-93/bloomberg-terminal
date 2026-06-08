'use client'
import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  clearStore() {
    try { localStorage.removeItem('bbg-terminal') } catch (_) {}
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        background: '#000', color: '#ccc', fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
        fontSize: 12, padding: 24, height: '100vh', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ color: '#ffa028', fontSize: 14, fontWeight: 'bold' }}>TERMINAL ERROR</div>
        <div style={{ color: '#ff3b3b' }}>{this.state.error.message}</div>
        <div style={{ color: '#555', fontSize: 11 }}>{this.state.error.stack?.split('\n').slice(0, 4).join('\n')}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={() => window.location.reload()}
            style={{ background: 'none', border: '1px solid #ffa028', color: '#ffa028', padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
          >
            RETRY
          </button>
          <button
            onClick={() => this.clearStore()}
            style={{ background: 'none', border: '1px solid #ff3b3b', color: '#ff3b3b', padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
          >
            RESET STATE &amp; RELOAD
          </button>
        </div>
        <div style={{ color: '#333', fontSize: 10, marginTop: 4 }}>
          "RESET STATE" clears your watchlist and resets to defaults. Use if a bad ticker broke the app.
        </div>
      </div>
    )
  }
}
