import type { ChatApiResponse, ChatMessage, ProductsResponse, StatsResponse, BackgroundTask } from './types'

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

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch('/api/stats')
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

export async function fetchProducts(params: {
  page?: number
  limit?: number
  scraped?: string
  q?: string
}): Promise<ProductsResponse> {
  const p = new URLSearchParams()
  if (params.page) p.set('page', String(params.page))
  if (params.limit) p.set('limit', String(params.limit))
  if (params.scraped) p.set('scraped', params.scraped)
  if (params.q) p.set('q', params.q)
  const res = await fetch(`/api/products?${p}`)
  if (!res.ok) throw new Error('Failed to fetch products')
  return res.json()
}

export async function startScrape(keywords: string[], outputFile: string): Promise<{ task_id: string }> {
  const res = await fetch('/api/scrape/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords, output_file: outputFile }),
  })
  if (!res.ok) throw new Error('Failed to start scrape')
  return res.json()
}

export async function getScrapeStatus(taskId: string): Promise<BackgroundTask> {
  const res = await fetch(`/api/scrape/status/${taskId}`)
  if (!res.ok) throw new Error('Task not found')
  return res.json()
}

export async function startIndex(filePath: string, scraped: boolean, reset: boolean): Promise<{ task_id: string }> {
  const res = await fetch('/api/index/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath, scraped, reset }),
  })
  if (!res.ok) throw new Error('Failed to start index')
  return res.json()
}

export async function getIndexStatus(taskId: string): Promise<BackgroundTask> {
  const res = await fetch(`/api/index/status/${taskId}`)
  if (!res.ok) throw new Error('Task not found')
  return res.json()
}

export async function startIndexUpload(
  payload: { file?: File; jsonContent?: string },
  scraped: boolean,
  reset: boolean,
): Promise<{ task_id: string }> {
  const form = new FormData()
  if (payload.file) {
    form.append('file', payload.file)
  } else if (payload.jsonContent) {
    form.append('json_content', payload.jsonContent)
  }
  form.append('scraped', String(scraped))
  form.append('reset', String(reset))
  const res = await fetch('/api/index/upload', { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || 'Failed to start index')
  }
  return res.json()
}
