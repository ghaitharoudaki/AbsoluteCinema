// Client for the server API (/api/app/*) and Auth.js (/api/auth/*).
// The browser never talks to the database directly any more.

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export async function api<T = unknown>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/app/${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(response.status, data.error || `Request failed (${response.status})`, data.code)
  }
  return data as T
}

/** Message suitable for showing to the user. */
export function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

/* ------------------------------------------------------------------ auth */

export interface SessionUser {
  id: string
  email: string | null
  name: string | null
  image: string | null
}

export async function fetchSession(): Promise<SessionUser | null> {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin' })
  if (!response.ok) return null
  const session = await response.json().catch(() => null)
  const user = session?.user
  return user?.id ? { id: user.id, email: user.email ?? null, name: user.name ?? null, image: user.image ?? null } : null
}

async function csrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  if (!response.ok) throw new Error('Sign-in service is unavailable')
  const { csrfToken } = await response.json()
  return csrfToken
}

/** Starts Google sign-in. Auth.js expects a real form POST so it can redirect to Google. */
export async function signInWithGoogle(callbackPath = '/') {
  const token = await csrfToken()
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = '/api/auth/signin/google'
  for (const [name, value] of Object.entries({ csrfToken: token, callbackUrl: new URL(callbackPath, window.location.origin).href })) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

export async function signOut() {
  const token = await csrfToken()
  await fetch('/api/auth/signout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
    body: new URLSearchParams({ csrfToken: token, callbackUrl: window.location.origin + '/login' }),
  })
}
