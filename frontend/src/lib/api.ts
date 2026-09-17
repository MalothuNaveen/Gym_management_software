/**
 * The single HTTP client.
 *
 * Every call goes through here so that authentication, error messages and
 * session expiry are handled in exactly one place. The backend already returns
 * plain-English messages; this layer only has to cope with the cases where the
 * request never reached it at all.
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
const TOKEN_KEY = 'gym.token'

export class ApiError extends Error {
  status: number
  field?: string
  errors?: { field: string; message: string }[]

  constructor(message: string, status: number, field?: string, errors?: ApiError['errors']) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
    this.errors = errors
  }

  /** True when retrying the same request might actually work. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500
  }
}

// --- Token storage --------------------------------------------------------

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null // private browsing with storage disabled
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* the session simply will not persist across reloads */
  }
}

/** Notified when the server rejects our token, so the app can show the login. */
type SessionExpiredHandler = () => void
let onSessionExpired: SessionExpiredHandler = () => {}
export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler
}

// --- Core request ---------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** FormData for uploads; Content-Type is left to the browser. */
  formData?: FormData
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, signal } = options
  const headers: Record<string, string> = {}

  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw new ApiError(
      navigator.onLine
        ? 'Could not reach the server. Please try again.'
        : 'You appear to be offline. Check your connection and try again.',
      0,
    )
  }

  if (response.status === 401) {
    setToken(null)
    onSessionExpired()
    throw new ApiError('Your session has expired. Please sign in again.', 401)
  }

  if (!response.ok) {
    let message = 'Something went wrong. Please try again.'
    let field: string | undefined
    let errors: ApiError['errors']
    try {
      const payload = await response.json()
      if (payload?.message) message = payload.message
      field = payload?.field
      errors = payload?.errors
    } catch {
      /* a non-JSON error body: keep the generic message */
    }
    throw new ApiError(message, response.status, field, errors)
  }

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return (await response.json()) as T
  return (await response.text()) as unknown as T
}

/** Fetches a protected binary file (receipt PDF, photo, backup) as a Blob. */
export async function fetchBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, { headers })
  } catch {
    throw new ApiError('Could not reach the server. Please try again.', 0)
  }
  if (response.status === 401) {
    setToken(null)
    onSessionExpired()
    throw new ApiError('Your session has expired. Please sign in again.', 401)
  }
  if (!response.ok) {
    throw new ApiError('That file could not be downloaded.', response.status)
  }
  return response.blob()
}

function query(params: Record<string, unknown> = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) =>
    request<T>(`${path}${query(params)}`),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', formData }),
  blob: fetchBlob,
  baseUrl: BASE_URL,
}

/** Turns any thrown value into a sentence safe to show the owner. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Please try again.'
}
