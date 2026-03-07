'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ChatMessage, SearchResults } from '@/lib/types'
import { sendChatMessage, fetchSuggestions, type Suggestion } from '@/lib/api'
import { ProductModal } from './ProductModal'

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! Describe any product you're interested in — include your price or budget and I'll find the best substitutes and alternatives for you.",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [modalResults, setModalResults] = useState<SearchResults | null>(null)

  // Autocomplete state
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

  // Real-time suggestions: cancel previous request, fire immediately
  const handleInputChange = (value: string) => {
    setInput(value)

    if (abortRef.current) abortRef.current.abort()

    if (value.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    fetchSuggestions(value, controller.signal).then(results => {
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
      setActiveSuggestion(-1)
    }).catch(() => { /* aborted — ignore */ })
  }

  const selectSuggestion = (s: Suggestion) => {
    const filled = s.price != null
      ? `${s.name} at €${s.price.toFixed(2)}`
      : s.name
    setInput(filled)
    setSuggestions([])
    setShowSuggestions(false)
    setActiveSuggestion(-1)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveSuggestion(i => Math.max(i - 1, -1))
        return
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false)
        return
      }
      if (e.key === 'Tab' && activeSuggestion >= 0) {
        e.preventDefault()
        selectSuggestion(suggestions[activeSuggestion])
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (activeSuggestion >= 0 && showSuggestions) {
        e.preventDefault()
        selectSuggestion(suggestions[activeSuggestion])
      } else {
        e.preventDefault()
        handleSend()
      }
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    setShowSuggestions(false)
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const response = await sendChatMessage(text, messages)
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        results: response.type === 'results' && response.results ? response.results : undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: err instanceof Error ? `Something went wrong: ${err.message}` : 'Something went wrong. Please try again.',
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
      <div
        className="flex flex-col"
        style={{
          height: '100vh',
          background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 60%), linear-gradient(180deg, #07070f 0%, #09091a 100%)',
        }}
      >
        {/* Header */}
        <header
          className="flex items-center gap-3 px-6 flex-shrink-0"
          style={{ height: 60, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <span style={{ color: '#fff', fontSize: 16 }}>◈</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 15, letterSpacing: '0.01em' }}>
            Product Match
          </span>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-8 px-4">
          <div className="mx-auto flex flex-col gap-5" style={{ maxWidth: 700 }}>
            <AnimatePresence initial={false}>
              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`} style={{ maxWidth: '82%' }}>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-0.5">
                        <div
                          className="flex items-center justify-center rounded-lg"
                          style={{ width: 22, height: 22, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', fontSize: 11 }}
                        >
                          ◈
                        </div>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Product Match</span>
                      </div>
                    )}

                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                        fontSize: 14,
                        lineHeight: 1.55,
                        ...(msg.role === 'user'
                          ? {
                              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                              color: 'rgba(255,255,255,0.92)',
                              boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
                            }
                          : {
                              background: 'rgba(255,255,255,0.055)',
                              color: 'rgba(255,255,255,0.82)',
                              border: '1px solid rgba(255,255,255,0.08)',
                            }),
                      }}
                    >
                      {msg.content}
                    </div>

                    {msg.results && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => setModalResults(msg.results!)}
                        className="flex items-center gap-2"
                        style={{
                          padding: '8px 16px',
                          borderRadius: 12,
                          background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))',
                          border: '1px solid rgba(99,102,241,0.4)',
                          color: '#A5B4FC',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: '0 4px 20px rgba(99,102,241,0.15)',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(99,102,241,0.38), rgba(139,92,246,0.3))' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))' }}
                      >
                        <span>View {msg.results.competitors.length} Results</span>
                        <span>→</span>
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div
                  className="flex items-center gap-1.5"
                  style={{
                    padding: '10px 16px',
                    borderRadius: '4px 16px 16px 16px',
                    background: 'rgba(255,255,255,0.055)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.18 }}
                      style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.35)' }}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div
          className="flex-shrink-0 px-4 py-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="mx-auto relative" style={{ maxWidth: 700 }}>
            {/* Suggestions dropdown */}
            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.div
                  ref={suggestionsRef}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    right: 0,
                    marginBottom: 8,
                    background: 'rgba(13,13,26,0.97)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 14,
                    overflow: 'hidden',
                    boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
                    zIndex: 10,
                  }}
                >
                  <div style={{ padding: '6px 12px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                      From your database
                    </span>
                  </div>
                  {suggestions.map((s, idx) => (
                    <button
                      key={s.reference}
                      onMouseDown={e => { e.preventDefault(); selectSuggestion(s) }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        width: '100%',
                        padding: '9px 14px',
                        background: idx === activeSuggestion ? 'rgba(99,102,241,0.15)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => { if (idx !== activeSuggestion) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { if (idx !== activeSuggestion) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      {s.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.image_url}
                          alt=""
                          style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <span style={{ fontSize: 16, flexShrink: 0 }}>📦</span>
                      )}
                      <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.82)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.name}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {s.retailer && (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{s.retailer}</span>
                        )}
                        {s.price != null && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#A5B4FC' }}>
                            €{s.price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input row */}
            <div className="flex gap-3">
              <input
                ref={inputRef}
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Describe a product with your price or budget to find substitutes…"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocusCapture={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(99,102,241,0.5)' }}
                onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                style={{
                  padding: '12px 20px',
                  borderRadius: 14,
                  background: loading || !input.trim() ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #7c3aed)',
                  color: loading || !input.trim() ? 'rgba(255,255,255,0.35)' : '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  border: 'none',
                  transition: 'all 0.15s',
                  boxShadow: loading || !input.trim() ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
                  whiteSpace: 'nowrap',
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {modalResults && (
          <ProductModal results={modalResults} onClose={() => setModalResults(null)} />
        )}
      </AnimatePresence>
    </>
  )
}
