'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Competitor, SearchResults } from '@/lib/types'
import { PriceHistogram } from './PriceHistogram'

interface Props {
  results: SearchResults
  onClose: () => void
}

export function ProductModal({ results, onClose }: Props) {
  const [leftItems, setLeftItems] = useState<Competitor[]>(results.competitors.slice(0, 5))
  const [rightItems, setRightItems] = useState<Competitor[]>(results.competitors.slice(5))

  const moveToRight = (item: Competitor) => {
    setLeftItems(prev => prev.filter(c => itemKey(c) !== itemKey(item)))
    setRightItems(prev => [item, ...prev])
  }

  const moveToLeft = (item: Competitor) => {
    setRightItems(prev => prev.filter(c => itemKey(c) !== itemKey(item)))
    setLeftItems(prev => [...prev, item])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 12 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="flex flex-col overflow-hidden"
        style={{
          width: '92vw',
          height: '88vh',
          background: 'linear-gradient(145deg, #111122 0%, #0d0d1e 100%)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        {/* macOS title bar */}
        <div
          className="flex items-center gap-2 px-5 flex-shrink-0"
          style={{
            height: 44,
            background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <button
            onClick={onClose}
            className="group flex items-center justify-center rounded-full transition-all"
            style={{ width: 12, height: 12, background: '#FF5F57', flexShrink: 0 }}
            title="Close"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[8px] leading-none font-bold text-[#7a0000]">✕</span>
          </button>
          <div style={{ width: 12, height: 12, background: '#FFBD2E', borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ width: 12, height: 12, background: '#28C840', borderRadius: '50%', flexShrink: 0 }} />
          <div className="flex-1 text-center" style={{ marginLeft: -52 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              Product Substitute Finder
              {results.product_name && (
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {' '}— {results.product_name.length > 60 ? results.product_name.slice(0, 60) + '…' : results.product_name}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── LEFT PANEL: Suggested Items ── */}
          <div
            className="flex flex-col overflow-hidden"
            style={{ width: '40%', borderRight: '1px solid rgba(255,255,255,0.07)' }}
          >
            <PanelHeader title="Suggested Items" count={leftItems.length} accent />
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                <AnimatePresence>
                  {leftItems.map(item => (
                    <motion.div
                      key={itemKey(item)}
                      layout
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.88 }}
                      transition={{ duration: 0.18 }}
                    >
                      <ProductTile item={item} variant="suggested" onAction={() => moveToRight(item)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              {leftItems.length === 0 && (
                <EmptyState message="No suggested items" />
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Top half: Might Also Match */}
            <div
              className="flex flex-col overflow-hidden"
              style={{ height: '52%', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <PanelHeader title="Might Also Match" count={rightItems.length} />
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-3 gap-3">
                  <AnimatePresence>
                    {rightItems.map(item => (
                      <motion.div
                        key={itemKey(item)}
                        layout
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.88 }}
                        transition={{ duration: 0.18 }}
                      >
                        <ProductTile item={item} variant="alternative" onAction={() => moveToLeft(item)} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                {rightItems.length === 0 && (
                  <EmptyState message="No additional matches" />
                )}
              </div>
            </div>

            {/* Bottom half: Price Histogram */}
            <div className="flex flex-col flex-1 overflow-hidden p-5">
              <p
                className="mb-3 uppercase tracking-widest"
                style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}
              >
                Price Distribution
              </p>
              <div className="flex-1">
                <PriceHistogram suggestedItems={leftItems} alternativeItems={rightItems} userPrice={results.user_price} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function itemKey(item: Competitor): string {
  return item.reference ?? item.competitor_product_name ?? Math.random().toString()
}

function PanelHeader({ title, count, accent }: { title: string; count: number; accent?: boolean }) {
  return (
    <div
      className="flex items-center gap-2 px-4 flex-shrink-0"
      style={{
        height: 42,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.015)',
      }}
    >
      <span style={{ color: accent ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 600 }}>
        {title}
      </span>
      <span
        className="rounded-full px-2 py-0.5"
        style={{
          fontSize: 11,
          background: accent ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
          color: accent ? 'rgba(165,167,255,0.9)' : 'rgba(255,255,255,0.3)',
        }}
      >
        {count}
      </span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-24">
      <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: 13 }}>{message}</p>
    </div>
  )
}

// ── Product Tile ──────────────────────────────────────────────────────────────

interface TileProps {
  item: Competitor
  variant: 'suggested' | 'alternative'
  onAction: () => void
}

function ProductTile({ item, variant, onAction }: TileProps) {
  const isSuggested = variant === 'suggested'

  return (
    <div
      className="relative flex flex-col gap-1.5 rounded-xl p-3 transition-all"
      style={{
        background: isSuggested
          ? 'linear-gradient(135deg, rgba(79,70,229,0.18) 0%, rgba(109,40,217,0.12) 100%)'
          : 'rgba(255,255,255,0.03)',
        border: isSuggested
          ? '1px solid rgba(99,102,241,0.28)'
          : '1px solid rgba(255,255,255,0.07)',
        opacity: isSuggested ? 1 : 0.65,
      }}
    >
      {/* Action button */}
      <button
        onClick={onAction}
        className="absolute top-2.5 right-2.5 flex items-center justify-center rounded-full transition-all"
        style={{
          width: 20,
          height: 20,
          fontSize: 10,
          fontWeight: 700,
          background: isSuggested ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
          color: isSuggested ? '#F87171' : '#4ADE80',
          border: isSuggested ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(34,197,94,0.25)',
          flexShrink: 0,
        }}
        title={isSuggested ? 'Move to Might Also Match' : 'Move to Suggested'}
      >
        {isSuggested ? '✕' : '✓'}
      </button>

      {/* Product image */}
      {item.image_url && (
        <div
          style={{
            width: '100%',
            height: 80,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.05)',
            flexShrink: 0,
            marginBottom: 2,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image_url}
            alt={item.competitor_product_name || ''}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}

      {/* Product name */}
      <p
        className="leading-snug pr-6"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: isSuggested ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.55)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {item.competitor_product_name || 'Unknown Product'}
      </p>

      {/* Retailer */}
      {item.competitor_retailer && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.competitor_retailer}
        </span>
      )}

      {/* Price */}
      {item.competitor_price != null && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: isSuggested ? '#A5B4FC' : 'rgba(255,255,255,0.35)',
          }}
        >
          €{item.competitor_price.toFixed(2)}
        </span>
      )}

      {/* Link */}
      {item.competitor_url && (
        <a
          href={item.competitor_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ fontSize: 10, color: 'rgba(99,102,241,0.6)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(165,180,252,0.9)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(99,102,241,0.6)' }}
        >
          View →
        </a>
      )}
    </div>
  )
}
