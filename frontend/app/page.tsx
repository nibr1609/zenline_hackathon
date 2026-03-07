'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SearchResults, Competitor } from '@/lib/types'
import { ChatInterface } from '@/components/ChatInterface'
import { PriceHistogram } from '@/components/PriceHistogram'

// ─── Product card ────────────────────────────────────────────────────────────

function ProductCard({ c, rank }: { c: Competitor; rank: number }) {
  const isScraped = c.scraped
  const accentColor = isScraped ? '#06b6d4' : '#6366f1'
  const accentBg = isScraped ? 'rgba(6,182,212,0.08)' : 'rgba(99,102,241,0.08)'
  const accentBorder = isScraped ? 'rgba(6,182,212,0.2)' : 'rgba(99,102,241,0.2)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: rank * 0.02 }}
      style={{
        background: '#0f1628',
        border: `1px solid ${accentBorder}`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 10,
        padding: '11px 13px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
      }}
    >
      {/* Rank badge */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        fontSize: 9, fontWeight: 700, color: accentColor,
        background: accentBg, borderRadius: 4, padding: '2px 5px',
        letterSpacing: '0.05em',
      }}>
        #{rank + 1} {isScraped ? '· web' : '· db'}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* Thumbnail */}
        <div style={{
          width: 52, height: 52, flexShrink: 0,
          background: 'rgba(255,255,255,0.04)', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {c.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <span style={{ fontSize: 20, opacity: 0.25 }}>📦</span>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: '#cbd5e1', lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', marginBottom: 5,
          }}>
            {c.competitor_product_name || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {c.competitor_price != null && (
              <span style={{ fontSize: 13, fontWeight: 700, color: accentColor }}>
                €{c.competitor_price.toFixed(2)}
              </span>
            )}
            {c.competitor_retailer && (
              <span style={{
                fontSize: 10, color: '#475569', background: 'rgba(255,255,255,0.05)',
                borderRadius: 4, padding: '2px 6px', fontWeight: 500,
              }}>
                {c.competitor_retailer}
              </span>
            )}
          </div>
        </div>
      </div>

      {c.competitor_url && (
        <a
          href={c.competitor_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '5px 0', borderRadius: 6,
            background: accentBg, border: `1px solid ${accentBorder}`,
            color: accentColor, fontSize: 11, fontWeight: 600, textDecoration: 'none',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          View product
          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}
    </motion.div>
  )
}

// ─── Results panel ───────────────────────────────────────────────────────────

function ResultsPanel({ results }: { results: SearchResults | null }) {
  if (!results) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        padding: 40,
      }}>
        <div style={{
          width: 72, height: 72,
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.15)',
          borderRadius: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30,
        }}>
          ◈
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#334155', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            No results yet
          </div>
          <div style={{ color: '#1e293b', fontSize: 13, maxWidth: 280 }}>
            Describe a product with your budget in the chat to find substitutes and alternatives.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          {['Samsung 65" QLED, budget €800', 'Bosch washing machine 8kg, €600', 'Sony WH-1000XM5, €250'].map(ex => (
            <div key={ex} style={{
              fontSize: 11, color: '#334155',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20, padding: '5px 12px',
            }}>{ex}</div>
          ))}
        </div>
      </div>
    )
  }

  const dbItems = results.competitors.filter(c => !c.scraped)
  const scrapedItems = results.competitors.filter(c => c.scraped)

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14 }}>
            {results.product_name}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
              {dbItems.length} database
            </span>
            <span style={{ fontSize: 11, color: '#06b6d4', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#06b6d4', display: 'inline-block' }} />
              {scrapedItems.length} web scraped
            </span>
            {results.user_price && (
              <span style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9 }}>●</span>
                Your budget: €{results.user_price.toFixed(0)}
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#1e293b' }}>
          {results.competitors.length} total
        </div>
      </div>

      {/* Two-column results */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', gap: 16 }}>
        {/* DB column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
            Database ({dbItems.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dbItems.map((c, i) => <ProductCard key={c.reference || i} c={c} rank={i} />)}
            {dbItems.length === 0 && (
              <div style={{ fontSize: 12, color: '#1e293b', padding: 12, textAlign: 'center' }}>No database matches</div>
            )}
          </div>
        </div>

        {/* Scraped column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4', display: 'inline-block' }} />
            Web Scraped ({scrapedItems.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scrapedItems.map((c, i) => <ProductCard key={c.reference || i} c={c} rank={i} />)}
            {scrapedItems.length === 0 && (
              <div style={{ fontSize: 12, color: '#1e293b', padding: 12, textAlign: 'center' }}>No scraped matches</div>
            )}
          </div>
        </div>
      </div>

      {/* Histogram */}
      {results.competitors.length > 0 && (
        <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.055)', padding: '12px 20px 16px' }}>
          <div style={{ fontSize: 10, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>
            Price Distribution
          </div>
          <PriceHistogram
            suggestedItems={dbItems}
            alternativeItems={scrapedItems}
            userPrice={results.user_price}
          />
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [results, setResults] = useState<SearchResults | null>(null)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Chat column */}
      <div style={{
        width: '38%', minWidth: 320, maxWidth: 480,
        borderRight: '1px solid rgba(255,255,255,0.055)',
        display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg, #07090f 0%, #080c18 100%)',
      }}>
        <ChatInterface onResults={setResults} embedded />
      </div>

      {/* Results column */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(ellipse 80% 50% at 60% -10%, rgba(99,102,241,0.07) 0%, transparent 60%), #07090f',
        overflow: 'hidden',
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={results ? results.product_name : 'empty'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <ResultsPanel results={results} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
