'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ChatMessage, SearchResults } from '@/lib/types'
import { sendChatMessage, fetchSuggestions, type Suggestion } from '@/lib/api'

interface ChatInterfaceProps {
  /** When provided, results are emitted up instead of opening a modal */
  onResults?: (results: SearchResults) => void
  /** Compact mode: no standalone header, fits inside a parent column */
  embedded?: boolean
}

export function ChatInterface({ onResults, embedded }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! Describe any product you're interested in — include your price or budget and I'll find the best substitutes and alternatives for you.",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const abortRef = useRef<AbortController | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleInputChange = (value: string) => {
    setInput(value)
    if (abortRef.current) abortRef.current.abort()
    if (value.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    const controller = new AbortController()
    abortRef.current = controller
    fetchSuggestions(value, controller.signal)
      .then(results => { setSuggestions(results); setShowSuggestions(results.length > 0); setActiveSuggestion(-1) })
      .catch(() => {})
  }

  const selectSuggestion = (s: Suggestion) => {
    const filled = s.price != null ? `${s.name} at €${s.price.toFixed(2)}` : s.name
    setInput(filled); setSuggestions([]); setShowSuggestions(false); setActiveSuggestion(-1)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(i => Math.max(i - 1, -1)); return }
      if (e.key === 'Escape') { setShowSuggestions(false); return }
      if (e.key === 'Tab' && activeSuggestion >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeSuggestion]); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (activeSuggestion >= 0 && showSuggestions) { e.preventDefault(); selectSuggestion(suggestions[activeSuggestion]) }
      else { e.preventDefault(); handleSend() }
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setShowSuggestions(false)
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text }])
    setInput('')
    setLoading(true)
    try {
      const response = await sendChatMessage(text, messages)
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`, role: 'assistant', content: response.message,
        results: response.type === 'results' && response.results ? response.results : undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
      if (response.type === 'results' && response.results && onResults) {
        onResults(response.results)
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: err instanceof Error ? `Error: ${err.message}` : 'Something went wrong.',
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: embedded ? '100%' : '100vh',
      background: embedded ? 'transparent' : 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 60%), linear-gradient(180deg,#07070f,#09091a)',
    }}>
      {/* Header */}
      {!embedded ? (
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', height: 58, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>◈</div>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 14 }}>Product Match</span>
        </header>
      ) : (
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>AI Search</div>
          <div style={{ fontSize: 11, color: '#1e293b', marginTop: 2 }}>Describe a product with your budget</div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
                style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
              >
                <div style={{ maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 5, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.role === 'assistant' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: -2 }}>
                      <div style={{ width: 16, height: 16, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>◈</div>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>SubstituteIQ</span>
                    </div>
                  )}
                  <div style={{
                    padding: '9px 12px', fontSize: 13, lineHeight: 1.5,
                    borderRadius: msg.role === 'user' ? '13px 3px 13px 13px' : '3px 13px 13px 13px',
                    ...(msg.role === 'user'
                      ? { background: 'linear-gradient(135deg,#6366f1,#7c3aed)', color: 'rgba(255,255,255,0.93)', boxShadow: '0 3px 14px rgba(99,102,241,0.28)' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.07)' }),
                  }}>
                    {msg.content}
                  </div>
                  {msg.results && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      onClick={() => onResults && onResults(msg.results!)}
                      style={{
                        padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: embedded ? 'rgba(6,182,212,0.12)' : 'rgba(99,102,241,0.15)',
                        border: embedded ? '1px solid rgba(6,182,212,0.25)' : '1px solid rgba(99,102,241,0.3)',
                        color: embedded ? '#22d3ee' : '#a5b4fc',
                        cursor: onResults ? 'pointer' : 'default',
                      }}
                    >
                      ✓ {msg.results.competitors.length} results {embedded ? 'shown →' : '— click to view'}
                    </motion.button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex' }}>
              <div style={{ padding: '9px 13px', borderRadius: '3px 13px 13px 13px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <motion.div key={i} animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.16 }}
                    style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, padding: '10px 12px 14px', borderTop: '1px solid rgba(255,255,255,0.055)' }}>
        <div style={{ position: 'relative' }}>
          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div ref={suggestionsRef} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.1 }}
                style={{
                  position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6,
                  background: 'rgba(10,14,28,0.98)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12, overflow: 'hidden', boxShadow: '0 -8px 32px rgba(0,0,0,0.6)', zIndex: 10,
                }}
              >
                <div style={{ padding: '5px 12px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Catalog</span>
                </div>
                {suggestions.map((s, idx) => (
                  <button key={s.reference}
                    onMouseDown={e => { e.preventDefault(); selectSuggestion(s) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 12px', background: idx === activeSuggestion ? 'rgba(99,102,241,0.15)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (idx !== activeSuggestion) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (idx !== activeSuggestion) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    {s.image_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={s.image_url} alt="" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 5, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <span style={{ fontSize: 14, flexShrink: 0 }}>📦</span>}
                    <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {s.retailer && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{s.retailer}</span>}
                      {s.price != null && <span style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc' }}>€{s.price.toFixed(2)}</span>}
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={inputRef} value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="e.g. Samsung QLED 65″ at €800…"
              disabled={loading}
              style={{
                flex: 1, padding: '10px 13px', borderRadius: 10,
                background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)',
                color: 'rgba(255,255,255,0.9)', fontSize: 13, outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocusCapture={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(99,102,241,0.45)' }}
              onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.09)' }}
            />
            <button onClick={handleSend} disabled={loading || !input.trim()}
              style={{
                padding: '10px 15px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700,
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                background: loading || !input.trim() ? 'rgba(99,102,241,0.18)' : 'linear-gradient(135deg,#6366f1,#7c3aed)',
                color: loading || !input.trim() ? 'rgba(255,255,255,0.22)' : '#fff',
                boxShadow: loading || !input.trim() ? 'none' : '0 3px 14px rgba(99,102,241,0.38)',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
