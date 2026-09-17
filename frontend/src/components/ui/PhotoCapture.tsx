/**
 * Member / staff photo capture.
 *
 * On a phone "Take Photo" opens the camera directly through the file input's
 * `capture` attribute - no camera permission prompt, no getUserMedia plumbing,
 * and it works identically on iOS and Android. Uploading from the gallery is
 * always offered as a fallback, and the photo is never required.
 *
 * Images are downscaled in the browser before upload, so a 4 MB phone photo
 * leaves the device as roughly 60 KB. That matters on a gym's mobile data.
 */
import { useEffect, useRef, useState } from 'react'

import { Button } from './Button'
import { Icon } from './Icon'

const MAX_DIMENSION = 900
const QUALITY = 0.82

/** Downscale and re-encode to JPEG. Returns the original on any failure. */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    )
    if (!blob || blob.size >= file.size) return file
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
  } catch {
    // Older browsers without createImageBitmap: let the server resize instead.
    return file
  }
}

interface PhotoCaptureProps {
  /** Current photo, if the member already has one. */
  currentUrl?: string | null
  onSelect: (file: File | null) => void
  label?: string
  disabled?: boolean
}

export function PhotoCapture({
  currentUrl, onSelect, label = 'Photo', disabled,
}: PhotoCaptureProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset so picking the same file twice still fires a change event.
    event.target.value = ''
    if (!file) return

    setBusy(true)
    try {
      const compressed = await compressImage(file)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(compressed))
      onSelect(compressed)
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    onSelect(null)
  }

  const shown = preview ?? currentUrl ?? null

  return (
    <div>
      <p className="mb-1.5 block text-sm font-medium text-ink-700">{label}</p>
      <div className="flex items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink-300 bg-ink-50">
          {shown ? (
            <img src={shown} alt="Selected photo" className="size-full object-cover" />
          ) : (
            <Icon name="user" className="size-9 text-ink-300" strokeWidth={1.5} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              loadingText="Processing…"
              disabled={disabled}
              onClick={() => cameraRef.current?.click()}
              icon={<Icon name="camera" className="size-4" strokeWidth={2} />}
            >
              Take Photo
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || busy}
              onClick={() => uploadRef.current?.click()}
              icon={<Icon name="share" className="size-4" strokeWidth={2} />}
            >
              Upload
            </Button>
            {shown && (
              <Button size="sm" variant="ghost" disabled={disabled || busy} onClick={clear}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-500">Optional. Photos are resized automatically.</p>
        </div>
      </div>

      {/* `capture` makes a phone open the camera straight away. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  )
}
