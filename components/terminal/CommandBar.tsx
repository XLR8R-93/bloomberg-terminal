'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTerminalStore } from '@/lib/store'
import { parseCommand } from '@/lib/command-parser'
import type { SearchResult } from '@/lib/providers/finnhub'

// Panel mnemonics — never trigger symbol search for these alone
const PANEL_CMDS = new Set([
  'GIP','DES','KS','FA','CN','EE','EST','RV','OPT','ECON',
  'TOP','WB','GLCO','PORT','SCRN','TV','WL','HELP','ALRT',
])

// Exchange suffix → human label
function exchangeLabel(symbol: string): string {
  if (symbol.endsWith('.AX'))  return 'ASX'
  if (symbol.endsWith('.L'))   return 'LSE'
  if (symbol.endsWith('.T'))   return 'TSE'
  if (symbol.endsWith('.HK'))  return 'HKEX'
  if (symbol.endsWith('.PA'))  return 'EURONEXT'
  if (symbol.endsWith('.DE'))  return 'XETRA'
  if (symbol.endsWith('.TO'))  return 'TSX'
  return 'US'
}

const TYPE_COLOR: Record<string, string> = {
  'Common Stock': '#4d9fff',
  'ETP':          '#ffa028',
  'ETF':          '#ffa028',
  'ADR':          '#aa66ff',
  'Preferred Stock': '#ff6ec7',
  'Warrant':      '#666',
  'Fund':         '#33ff99',
}

function typeBadge(type: string): [string, string] {
  if (type.includes('ETF') || type === 'ETP') return ['ETF', TYPE_COLOR['ETF']]
  if (type.includes('Common'))               return ['EQ',  TYPE_COLOR['Common Stock']]
  if (type === 'ADR')                        return ['ADR', TYPE_COLOR['ADR']]
  if (type.includes('Preferred'))            return ['PRF', TYPE_COLOR['Preferred Stock']]
  if (type === 'Fund')                       return ['FND', TYPE_COLOR['Fund']]
  return [type.slice(0,3).toUpperCase(), '#555']
}

export function CommandBar() {
  const {
    commandInput, setCommandInput,
    commandHistory, historyIndex, setHistoryIndex, pushCommand,
    openTab, setActiveView, setMenuOpen, activeTicker, activeView,
  } = useTerminalStore()

  const inputRef    = useRef<HTMLInputElement>(null)
  const measureRef  = useRef<HTMLSpanElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [suggestions,  setSuggestions]  = useState<SearchResult[]>([])
  const [suggestIdx,   setSuggestIdx]   = useState(-1)
  const [cursorX,      setCursorX]      = useState(0)
  const [isFocused,    setIsFocused]    = useState(false)
  const [searching,    setSearching]    = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Block cursor tracking ────────────────────────────────────────────────────
  const updateCursor = useCallback(() => {
    const el = inputRef.current
    const m  = measureRef.current
    if (!el || !m) return
    const pos = el.selectionStart ?? commandInput.length
    m.textContent = commandInput.slice(0, pos)
    setCursorX(m.getBoundingClientRect().width)
  }, [commandInput])

  // Focus on '/' anywhere in the terminal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSuggestions([])
        setSuggestIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Search ───────────────────────────────────────────────────────────────────
  const triggerSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) { setSuggestions([]); setSearching(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        setSuggestions((json.result ?? []).slice(0, 9))
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    }, 220)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setCommandInput(val)
    setSuggestIdx(-1)

    const trimmed = val.trim()
    const firstWord = trimmed.split(/\s+/)[0].toUpperCase()

    // Don't search if it's a lone panel command with nothing after it
    const isLoneCommand = PANEL_CMDS.has(firstWord) && trimmed === firstWord

    if (trimmed.length >= 2 && !isLoneCommand) {
      triggerSearch(firstWord || trimmed)
    } else {
      setSuggestions([])
      setSearching(false)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }

    requestAnimationFrame(updateCursor)
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const submit = useCallback((raw: string) => {
    const input = raw.trim()
    if (!input) return
    pushCommand(input)
    setCommandInput('')
    setSuggestions([])
    setSuggestIdx(-1)
    setSearching(false)
    const parsed = parseCommand(input)
    if (parsed.menu) {
      setMenuOpen(true)
    } else if (parsed.ticker || parsed.view) {
      openTab(parsed.ticker || activeTicker, parsed.view || activeView)
    }
  }, [pushCommand, setCommandInput, setMenuOpen, openTab, activeTicker, activeView, parseCommand])

  const selectSuggestion = useCallback((s: SearchResult) => {
    const parts    = commandInput.trim().split(/\s+/)
    const viewPart = parts.length > 1 ? parts.slice(1).join(' ') : ''
    const newVal   = viewPart ? `${s.symbol} ${viewPart}` : s.symbol
    submit(newVal)
  }, [commandInput, submit])

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (suggestIdx >= 0) selectSuggestion(suggestions[suggestIdx])
        else submit(commandInput)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSuggestIdx(i => Math.max(0, i - 1)); return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSuggestIdx(i => Math.min(suggestions.length - 1, i + 1)); return
      }
      if (e.key === 'Escape') {
        setSuggestions([]); setSuggestIdx(-1); return
      }
    } else {
      if (e.key === 'Enter') { submit(commandInput); return }
      if (e.key === 'Escape') {
        setCommandInput(''); setMenuOpen(false); inputRef.current?.blur(); return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = Math.min(historyIndex + 1, commandHistory.length - 1)
        setHistoryIndex(next); setCommandInput(commandHistory[next] || ''); return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = historyIndex - 1
        if (next < 0) { setHistoryIndex(-1); setCommandInput('') }
        else { setHistoryIndex(next); setCommandInput(commandHistory[next] || '') }
        return
      }
    }
    requestAnimationFrame(updateCursor)
  }

  const showDropdown = suggestions.length > 0 || (searching && commandInput.trim().length >= 2)

  return (
    <div style={{ position: 'relative', borderBottom: '1px solid #1f1f1f' }}>

      {/* ── Input bar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: '#000', border: '1px solid #ffa028',
        display: 'flex', alignItems: 'center',
        padding: '0 8px', height: 28, gap: 8,
      }}>
        <span style={{ color: '#ffa028', fontWeight: 'bold', fontSize: 11, letterSpacing: '0.1em', flexShrink: 0 }}>
          BBG&gt;
        </span>

        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          {/* Hidden measure span for block cursor */}
          <span ref={measureRef} aria-hidden style={{
            position: 'absolute', visibility: 'hidden', whiteSpace: 'pre',
            font: 'inherit', fontSize: 12, pointerEvents: 'none',
          }} />

          <input
            ref={inputRef}
            value={commandInput}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={updateCursor}
            onClick={updateCursor}
            onSelect={updateCursor}
            onFocus={() => { setIsFocused(true); requestAnimationFrame(updateCursor) }}
            onBlur={() => setIsFocused(false)}
            placeholder={isFocused ? '' : 'AAPL GIP · TSLA FA · type a company name to search · / to focus'}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: '#ffa028', font: 'inherit', fontSize: 12,
              width: '100%', caretColor: 'transparent',
            }}
            spellCheck={false} autoComplete="off" autoCorrect="off"
          />

          {isFocused && (
            <span className="cursor-blink" style={{
              position: 'absolute', left: cursorX,
              top: '50%', transform: 'translateY(-50%)',
              color: '#ffa028', fontSize: 14, lineHeight: 1, pointerEvents: 'none',
            }}>█</span>
          )}
        </div>

        {/* Searching spinner */}
        {searching && (
          <span style={{ color: '#444', fontSize: 9, flexShrink: 0 }}>searching…</span>
        )}
      </div>

      {/* ── Dropdown ──────────────────────────────────────────────────────── */}
      {showDropdown && (
        <div ref={dropdownRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#050505', border: '1px solid #2a2a2a', borderTop: 'none',
          zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
        }}>

          {/* Results */}
          {suggestions.map((s, i) => {
            const [badge, badgeColor] = typeBadge(s.type)
            const exch = exchangeLabel(s.symbol)
            const active = i === suggestIdx
            return (
              <div
                key={s.symbol}
                onMouseDown={e => { e.preventDefault(); selectSuggestion(s) }}
                onMouseEnter={() => setSuggestIdx(i)}
                style={{
                  padding: '5px 10px',
                  cursor: 'pointer',
                  background: active ? '#0c180c' : 'transparent',
                  borderBottom: '1px solid #0d0d0d',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                {/* Symbol */}
                <span style={{ color: active ? '#ffa028' : '#d4d4d4', fontSize: 11, fontWeight: 'bold', minWidth: 80, letterSpacing: '0.04em' }}>
                  {s.displaySymbol}
                </span>

                {/* Name */}
                <span style={{ color: '#666', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.description}
                </span>

                {/* Exchange */}
                <span style={{ color: '#444', fontSize: 9, minWidth: 40, textAlign: 'right', letterSpacing: '0.04em' }}>
                  {exch}
                </span>

                {/* Type badge */}
                <span style={{
                  color: badgeColor, fontSize: 8, minWidth: 28, textAlign: 'center',
                  border: `1px solid ${badgeColor}55`, padding: '1px 4px', letterSpacing: '0.04em',
                }}>
                  {badge}
                </span>
              </div>
            )
          })}

          {/* Footer hint */}
          <div style={{ padding: '3px 10px', display: 'flex', gap: 16, borderTop: '1px solid #111' }}>
            {[['↑↓', 'navigate'], ['↵', 'select'], ['Esc', 'dismiss']].map(([key, label]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#ffa028', fontSize: 8, border: '1px solid #333', padding: '0 3px' }}>{key}</span>
                <span style={{ color: '#333', fontSize: 8 }}>{label}</span>
              </span>
            ))}
            <span style={{ marginLeft: 'auto', color: '#222', fontSize: 8 }}>append GIP · DES · FA · OPT after symbol</span>
          </div>
        </div>
      )}
    </div>
  )
}
