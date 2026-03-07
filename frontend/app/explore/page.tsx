'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchProducts } from '@/lib/api'
import type { ProductItem, ProductsResponse } from '@/lib/types'
import { useRouter } from 'next/navigation'

function ProductCard({ item, onFindSubs }: { item: ProductItem; onFindSubs: (name: string) => void }) {
  const accentColor = item.scraped ? '#06b6d4' : '#6366f1'
  const accentBg = item.scraped ? 'rgba(6,182,212,0.08)' : 'rgba(99,102,241,0.08)'
  const accentBorder = item.scraped ? 'rgba(6,182,212,0.18)' : 'rgba(99,102,241,0.18)'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.16 }}
      style={{
        background: '#0e1422', borderRadius: 12,
        border: `1px solid ${accentBorder}`,
        borderTop: `2px solid ${accentColor}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 4px 24px rgba(0,0,0,0.4)`)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Image area */}
      <div style={{
        height: 130, background: 'rgba(255,255,255,0.025)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: `1px solid ${accentBorder}`, position: 'relative',
      }}>
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <span style={{ fontSize: 36, opacity: 0.12 }}>📦</span>
        )}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: accentBg, border: `1px solid ${accentBorder}`,
          borderRadius: 6, padding: '2px 7px',
          fontSize: 9, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {item.scraped ? 'web' : 'db'}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', lineHeight: 1.38,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          {item.price != null && (
            <span style={{ fontSize: 14, fontWeight: 800, color: accentColor }}>
              €{item.price.toFixed(2)}
            </span>
          )}
          {item.retailer && (
            <span style={{
              fontSize: 10, color: '#475569', background: 'rgba(255,255,255,0.05)',
              borderRadius: 4, padding: '2px 6px',
            }}>
              {item.retailer}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${accentBorder}` }}>
        <button
          onClick={() => onFindSubs(item.name)}
          style={{
            flex: 1, padding: '9px 0', border: 'none', background: 'transparent',
            color: accentColor, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            borderRight: `1px solid ${accentBorder}`, transition: 'background 0.1s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = accentBg)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Find substitutes
        </button>
        {item.url && (
          <a
            href={item.url} target="_blank" rel="noopener noreferrer"
            style={{
              flex: 1, padding: '9px 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#475569', fontSize: 11, textDecoration: 'none', transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLAnchorElement).style.color = '#94a3b8' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.color = '#475569' }}
          >
            Open ↗
          </a>
        )}
      </div>
    </motion.div>
  )
}

export default function ExplorePage() {
  const router = useRouter()
  const [data, setData] = useState<ProductsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [scraped, setScraped] = useState('all')
  const [page, setPage] = useState(1)

  const load = useCallback(async (query: string, scrapedFilter: string, pageNum: number) => {
    setLoading(true)
    try {
      const result = await fetchProducts({ page: pageNum, limit: 48, scraped: scrapedFilter, q: query })
      setData(result)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      load(q, scraped, 1)
    }, 250)
    return () => clearTimeout(timer)
  }, [q, scraped, load])

  useEffect(() => {
    load(q, scraped, page)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleFindSubs = (name: string) => {
    // Navigate to search page with the product name pre-filled via query param
    router.push(`/?q=${encodeURIComponent(name)}`)
  }

  const FILTER_OPTS = [
    { value: 'all', label: 'All', color: '#64748b' },
    { value: 'database', label: 'Database', color: '#6366f1' },
    { value: 'scraped', label: 'Web Scraped', color: '#06b6d4' },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.055)',
        display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
        background: 'rgba(255,255,255,0.01)',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em' }}>
            Product Catalog
          </h1>
          <div style={{ fontSize: 12, color: '#334155', marginTop: 3 }}>
            {data ? `${data.total.toLocaleString()} products indexed` : 'Loading…'}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
          <svg width="14" height="14" fill="none" stroke="#475569" strokeWidth="2" viewBox="0 0 24 24"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search products…"
            style={{
              width: '100%', padding: '9px 14px 9px 36px', borderRadius: 10,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
              color: '#e2e8f0', fontSize: 13, outline: 'none',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}
          />
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTER_OPTS.map(opt => (
            <button key={opt.value} onClick={() => setScraped(opt.value)}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: scraped === opt.value
                  ? `rgba(${opt.color === '#6366f1' ? '99,102,241' : opt.color === '#06b6d4' ? '6,182,212' : '100,116,139'},0.18)`
                  : 'rgba(255,255,255,0.04)',
                color: scraped === opt.value ? opt.color : '#475569',
                border: scraped === opt.value ? `1px solid ${opt.color}40` : '1px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {loading && !data ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} style={{ height: 280, background: 'rgba(255,255,255,0.03)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : data && data.items.length > 0 ? (
          <motion.div layout style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            <AnimatePresence>
              {data.items.map(item => (
                <ProductCard key={item.reference} item={item} onFindSubs={handleFindSubs} />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
            <div style={{ fontSize: 40, opacity: 0.15 }}>🔍</div>
            <div style={{ color: '#334155', fontSize: 15 }}>No products found</div>
            {q && <div style={{ color: '#1e293b', fontSize: 13 }}>Try a different search term</div>}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div style={{
          padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.055)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0,
        }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.09)', background: 'transparent', color: page === 1 ? '#1e293b' : '#64748b', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: '#475569' }}>
            Page {page} of {data.pages}
          </span>
          <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages}
            style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.09)', background: 'transparent', color: page === data.pages ? '#1e293b' : '#64748b', fontSize: 12, cursor: page === data.pages ? 'not-allowed' : 'pointer' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
