'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import type { SearchResults, Competitor } from '@/lib/types'
import { ChatInterface } from '@/components/ChatInterface'
import { PriceHistogram } from '@/components/PriceHistogram'

// ─── Selected product row (left panel) ───────────────────────────────────────

function SelectedRow({ c, rank, onDeselect }: { c: Competitor; rank: number; onDeselect: () => void }) {
  const isScraped = c.scraped
  const accent = isScraped ? '#06b6d4' : '#6366f1'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.16 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${isScraped ? 'rgba(6,182,212,0.18)' : 'rgba(99,102,241,0.18)'}`,
        borderLeft: `3px solid ${accent}`,
        position: 'relative',
      }}
    >
      {/* Rank */}
      <div style={{ fontSize: 10, fontWeight: 800, color: accent, width: 16, flexShrink: 0, textAlign: 'center' }}>
        {rank + 1}
      </div>

      {/* Thumbnail */}
      <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 7, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {c.image_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={c.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          : <span style={{ fontSize: 16, opacity: 0.2 }}>📦</span>}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#cbd5e1', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.competitor_product_name || '—'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
          {c.competitor_price != null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>€{c.competitor_price.toFixed(2)}</span>
          )}
          {c.competitor_retailer && (
            <span style={{ fontSize: 9.5, color: '#334155', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '1px 5px' }}>
              {c.competitor_retailer}
            </span>
          )}
          <span style={{ fontSize: 9, color: isScraped ? '#0e7490' : '#4338ca', fontWeight: 700 }}>
            {isScraped ? 'web' : 'db'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {c.competitor_url && (
          <a href={c.competitor_url} target="_blank" rel="noopener noreferrer"
            style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', color: '#475569', textDecoration: 'none', fontSize: 11, transition: 'all 0.1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#94a3b8' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#475569' }}
          >↗</a>
        )}
        <button onClick={onDeselect}
          style={{ width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 12, transition: 'all 0.1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)' }}
        >✕</button>
      </div>
    </motion.div>
  )
}

// ─── Available product row (right panel) ─────────────────────────────────────

function AvailableRow({ c, onSelect }: { c: Competitor; onSelect: () => void }) {
  const isScraped = c.scraped
  const accent = isScraped ? '#06b6d4' : '#6366f1'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.16 }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 6, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {c.image_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={c.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          : <span style={{ fontSize: 12, opacity: 0.2 }}>📦</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.competitor_product_name || '—'}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center' }}>
          {c.competitor_price != null && <span style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>€{c.competitor_price.toFixed(2)}</span>}
          <span style={{ fontSize: 9, color: isScraped ? '#0e7490' : '#4338ca', fontWeight: 700 }}>{isScraped ? 'web' : 'db'}</span>
        </div>
      </div>
      <button onClick={onSelect}
        style={{ width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `rgba(${accent === '#06b6d4' ? '6,182,212' : '99,102,241'},0.1)`, color: accent, fontSize: 14, fontWeight: 700, flexShrink: 0, transition: 'all 0.1s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `rgba(${accent === '#06b6d4' ? '6,182,212' : '99,102,241'},0.22)` }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `rgba(${accent === '#06b6d4' ? '6,182,212' : '99,102,241'},0.1)` }}
      >+</button>
    </motion.div>
  )
}

// ─── macOS-style results window ───────────────────────────────────────────────

function ResultsWindow({ results, onClose }: { results: SearchResults; onClose: () => void }) {
  const [selected, setSelected] = useState<Competitor[]>(results.competitors.slice(0, 5))
  const [available, setAvailable] = useState<Competitor[]>(results.competitors.slice(5))

  const deselect = (c: Competitor) => {
    setSelected(prev => prev.filter(x => x.reference !== c.reference))
    setAvailable(prev => [c, ...prev])
  }

  const select = (c: Competitor) => {
    setAvailable(prev => prev.filter(x => x.reference !== c.reference))
    setSelected(prev => [...prev, c])
  }

  const dbSel = selected.filter(c => !c.scraped)
  const scrapedSel = selected.filter(c => c.scraped)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 8 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1200px, 96vw)',
          height: 'min(820px, 92vh)',
          background: 'linear-gradient(180deg, #0d1120 0%, #090d18 100%)',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Title bar */}
        <div style={{
          height: 44, flexShrink: 0,
          background: 'rgba(255,255,255,0.025)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center',
          padding: '0 16px',
          position: 'relative',
        }}>
          {/* Traffic lights */}
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            {[
              { color: '#ff5f57', hover: '#ff3b30', action: onClose },
              { color: '#febc2e', hover: '#ffad00', action: () => {} },
              { color: '#28c840', hover: '#1aaa32', action: () => {} },
            ].map(({ color, hover, action }, i) => (
              <button key={i} onClick={action}
                style={{ width: 13, height: 13, borderRadius: '50%', border: 'none', cursor: i === 0 ? 'pointer' : 'default', background: color, transition: 'background 0.1s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = hover }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = color }}
              />
            ))}
          </div>

          {/* Window title */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.6)', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {results.product_name}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 10, color: '#6366f1', background: 'rgba(99,102,241,0.12)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                {dbSel.length} db
              </span>
              <span style={{ fontSize: 10, color: '#06b6d4', background: 'rgba(6,182,212,0.12)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                {scrapedSel.length} web
              </span>
              {results.user_price != null && (
                <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                  budget €{results.user_price.toFixed(0)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: selected */}
          <div style={{ width: '45%', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                Selected ({selected.length})
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <AnimatePresence>
                {selected.map((c, i) => (
                  <SelectedRow key={c.reference || i} c={c} rank={i} onDeselect={() => deselect(c)} />
                ))}
              </AnimatePresence>
              {selected.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontSize: 12 }}>
                  Select products from the right →
                </div>
              )}
            </div>
          </div>

          {/* Right: available + histogram */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            {/* Available pool — takes remaining space, scrolls */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  Available ({available.length})
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
                <AnimatePresence>
                  {available.map((c, i) => (
                    <AvailableRow key={c.reference || i} c={c} onSelect={() => select(c)} />
                  ))}
                </AnimatePresence>
                {available.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60, color: '#1e293b', fontSize: 12 }}>
                    All products selected
                  </div>
                )}
              </div>
            </div>

            {/* Histogram — fixed height, never grows */}
            <div style={{ flexShrink: 0, height: 200, padding: '10px 16px 12px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6, flexShrink: 0 }}>
                Price Distribution (selected)
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {selected.length > 0 ? (
                  <PriceHistogram
                    suggestedItems={selected}
                    alternativeItems={available}
                    userPrice={results.user_price}
                  />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontSize: 11 }}>
                    Select products to see distribution
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.replace('/login')
    } else {
      setReady(true)
    }
  }, [router])

  const handleResults = (r: SearchResults) => {
    setResults(r)
    setShowResults(true)
  }

  if (!ready) return null

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      <ChatInterface onResults={handleResults} />
    </div>
  )
}
