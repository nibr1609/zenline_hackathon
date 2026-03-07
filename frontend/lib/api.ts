import type { ChatApiResponse, ChatMessage } from './types'

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
): Promise<ChatApiResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(`/api/suggestions?q=${encodeURIComponent(q)}&limit=8`, { signal })
  if (!res.ok) return []
  return res.json()
}
