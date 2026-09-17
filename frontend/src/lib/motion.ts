/**
 * Motion helpers.
 *
 * Two rules hold throughout: every animation is driven by transform or opacity
 * so it never triggers a re-layout, and every one of them collapses to nothing
 * when the operating system asks for reduced motion.
 */
import { useEffect, useRef, useState } from 'react'

/** Follows the OS setting live, so toggling it does not need a reload. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * Keeps a component mounted while it animates away.
 *
 * Rendering `open ? <Dialog/> : null` means a dialog can only ever animate in -
 * on close it vanishes instantly, which reads as a glitch. This holds the node
 * in the tree for the length of the exit and reports the state the CSS should
 * be showing.
 */
export function usePresence(open: boolean, exitMs = 240) {
  const reduced = usePrefersReducedMotion()
  const [mounted, setMounted] = useState(open)
  const [state, setState] = useState<'open' | 'closed'>('closed')

  useEffect(() => {
    if (open) {
      setMounted(true)
      // One frame with the closed styles applied, so the browser has something
      // to transition *from*. Without it the element simply appears open.
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setState('open'))
      })
      return () => cancelAnimationFrame(frame)
    }

    setState('closed')
    const timer = window.setTimeout(() => setMounted(false), reduced ? 0 : exitMs)
    return () => window.clearTimeout(timer)
  }, [open, exitMs, reduced])

  return { mounted, state }
}

/**
 * Counts a number up to its target.
 *
 * Used only on the dashboard tiles, where it does a real job: the eye is drawn
 * to the figure that just changed. Money is never animated mid-edit, and the
 * count is skipped entirely for reduced motion and for the first paint of a
 * value that is already on screen.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    if (reduced || !Number.isFinite(target)) {
      setDisplay(target)
      fromRef.current = target
      return
    }

    const from = fromRef.current
    if (from === target) return

    let raf = 0
    const started = performance.now()

    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs)
      // easeOutQuint - most of the distance is covered early, so the number
      // settles rather than crawling.
      const eased = 1 - Math.pow(1 - progress, 5)
      setDisplay(from + (target - from) * eased)
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs, reduced])

  return display
}
