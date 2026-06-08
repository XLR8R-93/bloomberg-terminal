'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTerminalStore } from '@/lib/store'
import { parseCommand } from '@/lib/command-parser'
import type { SearchResult } from '@/lib/providers/finnhub'

export function CommandBar() {
  const {
    commandInput, setCommandInput,
    commandHistory, historyIndex, setHistoryIndex, pushCommand,
    openTab, setActiveView, setMenuOpen, activeTicker, activeView,
  } = useTerminalStore()

  const inputRef = useRef<HTMLInputElement>(null)
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [suggestIdx, setSuggestIdx] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus on / or Escape-clear
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

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (q.length < 1) { setSuggestions([]); return }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        setSuggestions((json.result || []).slice(0, 8))
      } catch {
        setSuggestions([])
      }
    }, 250)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setCommandInput(val)
    setSuggestIdx(-1)
    const parts = val.trim().split(/\s+/)
    const tickerPart = parts[0]
    if (tickerPart && /^[A-Z]{1,5}$/i.test(tickerPart)) {
      search(tickerPart)
    } else {
      setSuggestions([])
    }
  }

  const submit = (raw: string) => {
    const input = raw.trim()
    if (!input) return
    pushCommand(input)
    setCommandInput('')
    setSuggestions([])
    setSuggestIdx(-1)
    const parsed = parseCommand(input)
    if (parsed.menu) {
      setMenuOpen(true)
    } else if (parsed.ticker || parsed.view) {
      openTab(parsed.ticker || activeTicker, parsed.view || activeView)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (suggestIdx >= 0 && suggestions[suggestIdx]) {
        const sym = suggestions[suggestIdx].symbol
        const parts = commandInput.trim().split(/\s+/)
        const newVal = parts.length > 1 ? `${sym} ${parts.slice(1).join(' ')}` : sym
        submit(newVal)
      } else {
        submit(commandInput)
      }
    } else if (e.key === 'Escape') {
      setCommandInput('')
      setSuggestions([])
      setSuggestIdx(-1)
      setMenuOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setSuggestIdx((i) => Math.max(0, i - 1))
      } else {
        const next = Math.min(historyIndex + 1, commandHistory.length - 1)
        setHistoryIndex(next)
        setCommandInput(commandHistory[next] || '')
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setSuggestIdx((i) => Math.min(suggestions.length - 1, i + 1))
      } else {
        const next = historyIndex - 1
        if (next < 0) { setHistoryIndex(-1); setCommandInput('') }
        else { setHistoryIndex(next); setCommandInput(commandHistory[next] || '') }
      }
    }
  }

  return (
    <div className="relative" style={{ borderBottom: '1px solid #1f1f1f' }}>
      <div style={{
        background: '#000',
        border: '1px solid #ffa028',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        height: 28,
        gap: 8,
      }}>
        <span style={{ color: '#ffa028', fontWeight: 'bold', fontSize: 11, letterSpacing: '0.1em', flexShrink: 0 }}>
          BBG&gt;
        </span>
        <input
          ref={inputRef}
          value={commandInput}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter command: AAPL DES · TSLA GIP · NVDA FA · HELP"
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#ffa028',
            font: 'inherit',
            fontSize: 12,
            flex: 1,
            caretColor: '#ffa028',
          }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
        />
        <span className="cursor-blink" style={{ color: '#ffa028', fontSize: 14 }}>█</span>
      </div>

      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#050505',
          border: '1px solid #2a2a2a',
          borderTop: 'none',
          zIndex: 100,
          maxHeight: 200,
          overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.symbol}
              onClick={() => {
                const parts = commandInput.trim().split(/\s+/)
                const newVal = parts.length > 1 ? `${s.symbol} ${parts.slice(1).join(' ')}` : s.symbol
                submit(newVal)
              }}
              style={{
                padding: '3px 8px',
                cursor: 'pointer',
                background: i === suggestIdx ? '#0f1a0f' : 'transparent',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#4d9fff', width: 60, flexShrink: 0, fontSize: 11 }}>{s.displaySymbol}</span>
              <span style={{ color: '#888', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.description}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
