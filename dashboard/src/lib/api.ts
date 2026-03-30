const API_BASE = '/api'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `API error ${response.status}: ${path}`)
  }

  return response.json() as Promise<T>
}

export interface Expense {
  id: number
  date: string
  item: string
  amount: number
  category_name: string
}

export interface SummaryData {
  category_name: string
  total: number
}

export interface Category {
  id: number
  name: string
}

export interface SessionInfo {
  email: string | null
  accessProtected: boolean
}

export const api = {
  expenses: (params?: { start?: string; end?: string; category?: string }) => {
    const qs = new URLSearchParams()

    if (params?.start) qs.set('start', params.start)
    if (params?.end) qs.set('end', params.end)
    if (params?.category) qs.set('category', params.category)

    return apiFetch<Expense[]>(`/expenses${qs.size ? `?${qs.toString()}` : ''}`)
  },
  summary: (year: number, month: number) =>
    apiFetch<SummaryData[]>(`/summary?year=${year}&month=${month}`),
  categories: () => apiFetch<Category[]>('/categories'),
  session: () => apiFetch<SessionInfo>('/session'),
  deleteExpense: (id: number) =>
    apiFetch<{ ok: true }>(`/expenses/${id}`, { method: 'DELETE' }),
  deleteCategory: (id: number, replaceCategoryId: number) =>
    apiFetch<{ ok: true }>(`/categories/${id}?replace=${replaceCategoryId}`, {
      method: 'DELETE',
    }),
}
