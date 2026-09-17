/**
 * Member and staff photos.
 *
 * Photos sit behind an authenticated endpoint, so a plain <img src> would not
 * carry the token. We fetch the bytes and hand the <img> an object URL instead,
 * with a small in-memory cache so scrolling a list does not refetch faces.
 */
import { useEffect, useState } from 'react'

import { fetchBlob } from '@/lib/api'

const cache = new Map<string, string>()
const inFlight = new Map<string, Promise<string | null>>()

async function loadImage(path: string): Promise<string | null> {
  const cached = cache.get(path)
  if (cached) return cached

  const existing = inFlight.get(path)
  if (existing) return existing

  const promise = fetchBlob(path)
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      cache.set(path, url)
      return url
    })
    .catch(() => null)
    .finally(() => inFlight.delete(path))

  inFlight.set(path, promise)
  return promise
}

/** Drops a cached photo after it is replaced, so the new one shows at once. */
export function invalidatePhoto(path: string): void {
  const url = cache.get(path)
  if (url) {
    URL.revokeObjectURL(url)
    cache.delete(path)
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SIZES = {
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-lg',
  xl: 'size-24 text-2xl sm:size-28 sm:text-3xl',
}

export function Avatar({
  name, photoPath, hasPhoto = true, size = 'md', className = '',
}: {
  name: string
  /** API path, e.g. '/members/42/photo'. */
  photoPath?: string
  hasPhoto?: boolean
  size?: keyof typeof SIZES
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(
    photoPath ? (cache.get(photoPath) ?? null) : null,
  )

  useEffect(() => {
    if (!photoPath || !hasPhoto) {
      setUrl(null)
      return
    }
    let cancelled = false
    void loadImage(photoPath).then((result) => {
      if (!cancelled) setUrl(result)
    })
    return () => {
      cancelled = true
    }
  }, [photoPath, hasPhoto])

  const base = `shrink-0 overflow-hidden rounded-full font-semibold ${SIZES[size]} ${className}`

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        loading="lazy"
        decoding="async"
        className={`${base} bg-ink-100 object-cover`}
      />
    )
  }

  return (
    <span
      aria-hidden
      title={name}
      className={`${base} flex items-center justify-center bg-ink-200 text-ink-600`}
    >
      {initials(name)}
    </span>
  )
}
