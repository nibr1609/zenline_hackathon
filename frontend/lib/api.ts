import type { ChatApiResponse, ChatMessage } from './types'

function getToken(): string {
  return typeof window !== 'undefined' ? (localStorage.getItem('auth_token') ?? '') : ''
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || 'Invalid credentials')
  }
  const { token } = await res.json()
  localStorage.setItem('auth_token', token)
}

export function logout(): void {
  localStorage.removeItem('auth_token')
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
): Promise<ChatApiResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      message,
      history: history.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Request failed: ${res.status}`)
  }

  return res.json()
}

export interface Suggestion {
  reference: string
  name: string
  price: number | null
  retailer: string | null
  image_url: string | null
}

export async function fetchSuggestions(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  if (q.trim().length < 2) return []
  const res = await fetch(`/api/suggestions?q=${encodeURIComponent(q)}&limit=8`, {
    signal,
    headers: authHeaders(),
  })
  if (!res.ok) return []
  return res.json()
}
