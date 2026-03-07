'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { fetchStats } from '@/lib/api'
import type { StatsResponse } from '@/lib/types'

const SearchIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)
const GridIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
)
const LayersIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
)

const NAV = [
  { href: '/', label: 'Search', icon: SearchIcon, desc: 'Find substitutes' },
  { href: '/explore', label: 'Explore', icon: GridIcon, desc: 'Browse catalog' },
  { href: '/manage', label: 'Index', icon: LayersIcon, desc: 'Scrape & index' },
]

export function Sidebar() {
  const path = usePathname()
  const [stats, setStats] = useState<StatsResponse | null>(null)

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {})
  }, [])

  return (
    <aside style={{
      width: 220,
      height: '100vh',
      background: '#060914',
      borderRight: '1px solid rgba(255,255,255,0.055)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 18px 20px', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{
            width: 34, height: 34, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
          }}>◈</div>
          <div>
            <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
              SubstituteIQ
            </div>
            <div style={{ color: '#334155', fontSize: 10, marginTop: 2, letterSpacing: '0.03em' }}>
              Product Intelligence
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '14px 10px' }}>
        <div style={{ fontSize: 10, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, padding: '0 8px 8px' }}>
          Platform
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ href, label, icon: Icon, desc }) => {
            const active = path === href
            return (
              <Link key={href} href={href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', borderRadius: 8,
                color: active ? '#a5b4fc' : '#475569',
                background: active
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.08))'
                  : 'transparent',
                textDecoration: 'none',
                fontSize: 13.5, fontWeight: active ? 600 : 400,
                border: active ? '1px solid rgba(99,102,241,0.22)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
              >
                <span style={{ opacity: active ? 1 : 0.5 }}><Icon /></span>
                <div>
                  <div style={{ lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontSize: 10, color: active ? 'rgba(165,180,252,0.6)' : '#334155', marginTop: 1, lineHeight: 1 }}>{desc}</div>
                </div>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Index stats */}
      <div style={{ padding: '14px 18px 20px', borderTop: '1px solid rgba(255,255,255,0.055)' }}>
        <div style={{ fontSize: 10, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 10 }}>
          Index Status
        </div>
        {stats ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { label: 'Total', value: stats.total, color: '#64748b' },
              { label: 'Database', value: stats.database, color: '#6366f1' },
              { label: 'Scraped', value: stats.scraped, color: '#06b6d4' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: 12, color: '#334155' }}>{label}</span>
                </div>
                <span style={{ fontSize: 12, color: '#475569', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {value.toLocaleString()}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 4, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
              {stats.total > 0 && (
                <div style={{
                  height: '100%', borderRadius: 99,
                  background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
                  width: `${Math.min(100, (stats.scraped / stats.total) * 100)}%`,
                  transition: 'width 0.5s',
                }} />
              )}
            </div>
            <div style={{ fontSize: 10, color: '#1e293b', textAlign: 'center' }}>
              {stats.total > 0 ? `${Math.round((stats.scraped / stats.total) * 100)}% scraped` : 'No products indexed'}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#1e293b' }}>Loading…</div>
        )}
      </div>
    </aside>
  )
}
