/**
 * Charts, drawn by hand in SVG.
 *
 * A charting library would add well over 100 KB gzipped to a bundle this app
 * deliberately keeps small, for three shapes. These three are the shapes the
 * dashboard actually needs, they inherit the theme tokens, and they animate
 * with the same motion system as everything else.
 *
 * Every one of them takes real values and draws them to scale. None of them
 * invents a data point to make a line look better.
 */
import { useEffect, useId, useState, type ReactNode } from 'react'

import { usePrefersReducedMotion } from '@/lib/motion'

// --------------------------------------------------------------------------
// Area chart - revenue over time
// --------------------------------------------------------------------------

export interface SeriesPoint {
  label: string
  value: number
  /** A second, subordinate value drawn as a lighter line (expenses). */
  compare?: number
}

export function AreaChart({
  points, height = 200, format, ariaLabel,
}: {
  points: SeriesPoint[]
  height?: number
  format: (value: number) => string
  ariaLabel: string
}) {
  const gradientId = useId()
  const reduced = usePrefersReducedMotion()
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) return null

  const width = 100          // a viewBox in percent; the SVG scales to its box
  const top = 6
  const usable = height - top - 22          // room for the axis labels

  const peak = Math.max(
    1,
    ...points.map((p) => Math.max(p.value, p.compare ?? 0)),
  )
  const x = (index: number) =>
    points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
  const y = (value: number) => top + usable - (value / peak) * usable

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${top + usable} L${x(0)},${top + usable} Z`
  const hasCompare = points.some((p) => p.compare !== undefined)
  const compareLine = hasCompare
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.compare ?? 0)}`).join(' ')
    : null

  // Only ever three labels: a phone cannot read thirty dates along an axis.
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)

  const active = hover === null ? null : points[hover]

  return (
    <figure className="relative m-0" aria-label={ariaLabel}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Baselines, so a flat series still reads as a chart. */}
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1="0" x2={width}
            y1={top + usable * fraction} y2={top + usable * fraction}
            stroke="var(--color-ink-200)" strokeWidth="0.35"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill={`url(#${gradientId})`} className={reduced ? '' : 'chart-area'} />
        {compareLine && (
          <path
            d={compareLine}
            fill="none"
            stroke="var(--color-ink-400)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            className={reduced ? '' : 'chart-line'}
          />
        )}
        <path
          d={line}
          fill="none"
          stroke="var(--color-brand-500)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={reduced ? '' : 'chart-line'}
        />

        {hover !== null && (
          <>
            <line
              x1={x(hover)} x2={x(hover)} y1={top} y2={top + usable}
              stroke="var(--color-brand-500)" strokeWidth="1" strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(hover)} cy={y(points[hover].value)} r="3"
              fill="var(--color-brand-500)" stroke="var(--color-surface)" strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {/* Invisible hit areas: one wide band per point, so a finger can
            reach a value without having to land on a 2px line. */}
        {points.map((point, index) => (
          <rect
            key={point.label + index}
            x={index === 0 ? 0 : x(index) - width / (points.length - 1 || 1) / 2}
            y={0}
            width={width / (points.length || 1)}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      <div className="mt-1 flex justify-between px-0.5 text-[11px] text-ink-400">
        {ticks.map((index) => (
          <span key={index}>{points[index]?.label}</span>
        ))}
      </div>

      {active && (
        <div className="pointer-events-none absolute top-0 right-0 rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-xs shadow-e2">
          <p className="font-medium text-ink-900">{active.label}</p>
          <p className="text-brand-600 tnum">{format(active.value)}</p>
          {active.compare !== undefined && (
            <p className="text-ink-500 tnum">Spent {format(active.compare)}</p>
          )}
        </div>
      )}
    </figure>
  )
}

// --------------------------------------------------------------------------
// Donut - payment status
// --------------------------------------------------------------------------

export interface Slice {
  label: string
  value: number
  color: string
}

export function Donut({
  slices, size = 148, thickness = 18, centre,
}: {
  slices: Slice[]
  size?: number
  thickness?: number
  centre?: ReactNode
}) {
  const reduced = usePrefersReducedMotion()
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius

  const [drawn, setDrawn] = useState(reduced)
  useEffect(() => {
    if (reduced) return
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [reduced])

  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="presentation">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--color-ink-200)" strokeWidth={thickness}
        />
        {total > 0 && slices.map((slice) => {
          const fraction = slice.value / total
          const length = circumference * fraction
          const element = (
            <circle
              key={slice.label}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={thickness}
              strokeLinecap={fraction < 1 ? 'butt' : 'round'}
              strokeDasharray={`${drawn ? length : 0} ${circumference}`}
              strokeDashoffset={-offset}
              style={{
                transition: reduced
                  ? undefined
                  : 'stroke-dasharray var(--duration-base) var(--ease-out-quint)',
              }}
            />
          )
          offset += length
          return element
        })}
      </svg>
      {centre && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centre}
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// Progress ring - attendance
// --------------------------------------------------------------------------

export function ProgressRing({
  percent, size = 132, thickness = 12, centre, tone = 'var(--color-brand-500)',
}: {
  percent: number
  size?: number
  thickness?: number
  centre?: ReactNode
  tone?: string
}) {
  const reduced = usePrefersReducedMotion()
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  // Clamped: a ratio above 100% would wrap the ring and read as a low score.
  const safe = Math.max(0, Math.min(100, percent))

  const [drawn, setDrawn] = useState(reduced)
  useEffect(() => {
    if (reduced) return
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [reduced])

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="presentation">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--color-ink-200)" strokeWidth={thickness}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${(drawn ? safe : 0) / 100 * circumference} ${circumference}`}
          style={{
            transition: reduced
              ? undefined
              : 'stroke-dasharray 700ms var(--ease-out-quint)',
          }}
        />
      </svg>
      {centre && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centre}
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// Horizontal bar - a breakdown that needs labels beside it
// --------------------------------------------------------------------------

export function BarRow({
  label, value, total, amount, color,
}: {
  label: string
  value: number
  total: number
  amount?: string
  color: string
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-ink-700">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-medium text-ink-900 tnum">
          {amount ?? value}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-200">
        <div
          className="chart-bar h-full rounded-full"
          style={{ width: `${percent}%`, background: color }}
        />
      </div>
    </div>
  )
}
