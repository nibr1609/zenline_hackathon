'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { Competitor } from '@/lib/types'

interface Props {
  suggestedItems: Competitor[]
  alternativeItems: Competitor[]
  userPrice: number | null
}

interface Bin {
  label: string
  suggested: number
  alternative: number
  minVal: number
  maxVal: number
  containsUser: boolean
}

export function PriceHistogram({ suggestedItems, alternativeItems, userPrice }: Props) {
  const { bins, userBinLabel } = useMemo(() => {
    const allItems = [...suggestedItems, ...alternativeItems]
    const allPrices = allItems
      .map(c => c.competitor_price)
      .filter((p): p is number => p !== null)

    if (allPrices.length === 0) return { bins: [], userBinLabel: null }

    const withUser = userPrice !== null ? [...allPrices, userPrice] : allPrices
    const rawMin = Math.min(...withUser)
    const rawMax = Math.max(...withUser)

    const BIN_COUNT = 8
    const range = rawMax - rawMin || 200
    const rawBinSize = range / BIN_COUNT
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawBinSize)))
    const binSize = Math.ceil(rawBinSize / magnitude) * magnitude || 50

    const min = Math.floor(rawMin / binSize) * binSize
    const bins: Bin[] = []
    for (let i = 0; i < BIN_COUNT + 1; i++) {
      const lo = min + i * binSize
      bins.push({
        label: `€${lo.toLocaleString()}`,
        suggested: 0,
        alternative: 0,
        minVal: lo,
        maxVal: lo + binSize,
        containsUser: false,
      })
    }

    const assignPrices = (items: Competitor[], key: 'suggested' | 'alternative') => {
      for (const item of items) {
        if (item.competitor_price == null) continue
        const idx = bins.findIndex(b => item.competitor_price! >= b.minVal && item.competitor_price! < b.maxVal)
        if (idx !== -1) bins[idx][key]++
      }
    }
    assignPrices(suggestedItems, 'suggested')
    assignPrices(alternativeItems, 'alternative')

    let userBinLabel: string | null = null
    if (userPrice !== null) {
      const uIdx = bins.findIndex(b => userPrice >= b.minVal && userPrice < b.maxVal)
      if (uIdx !== -1) {
        bins[uIdx].containsUser = true
        userBinLabel = bins[uIdx].label
      }
    }

    // Trim trailing empty bins
    while (
      bins.length > 1 &&
      bins[bins.length - 1].suggested === 0 &&
      bins[bins.length - 1].alternative === 0 &&
      !bins[bins.length - 1].containsUser
    ) {
      bins.pop()
    }

    return { bins, userBinLabel }
  }, [suggestedItems, alternativeItems, userPrice])

  if (bins.length === 0) {
    return <p className="text-white/20 text-xs text-center mt-6">No price data available</p>
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={bins} margin={{ top: 8, right: 12, left: -28, bottom: 28 }} stackOffset="none">
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: '#4B5563', fontSize: 10 }}
          angle={-35}
          textAnchor="end"
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis
          tick={{ fill: '#4B5563', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={28}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={{
            background: 'rgba(10,10,20,0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            color: '#E5E7EB',
            fontSize: 12,
            padding: '6px 10px',
          }}
          formatter={(value: number, name: string) => [
            `${value} product${value !== 1 ? 's' : ''}`,
            name === 'suggested' ? 'Selected' : 'Available',
          ]}
          labelFormatter={(label: string) => label}
        />
        {/* Suggested items — indigo, stacked on bottom */}
        <Bar dataKey="suggested" stackId="a" fill="rgba(99,102,241,0.7)" radius={[0, 0, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        {/* Alternative items — muted, stacked on top */}
        <Bar dataKey="alternative" stackId="a" fill="rgba(255,255,255,0.12)" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        {userBinLabel && (
          <ReferenceLine
            x={userBinLabel}
            stroke="#F59E0B"
            strokeWidth={2}
            strokeDasharray="4 3"
            label={{
              value: `Your price${userPrice ? ` €${userPrice.toLocaleString()}` : ''}`,
              fill: '#F59E0B',
              fontSize: 10,
              position: 'insideTopRight',
            }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}
