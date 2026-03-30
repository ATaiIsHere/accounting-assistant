// API client — 所有對 Worker API 的呼叫都集中在此
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? ''

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
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

export const api = {
  expenses: (params?: { start?: string; end?: string; category?: string }): Promise<Expense[]> => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return apiFetch(`/api/expenses${qs ? '?' + qs : ''}`)
  },
  summary: (year: number, month: number): Promise<SummaryData[]> =>
    apiFetch(`/api/summary?year=${year}&month=${month}`),
  categories: (): Promise<Category[]> =>
    apiFetch('/api/categories'),
  deleteExpense: (id: number) =>
    apiFetch(`/api/expenses/${id}`, { method: 'DELETE' }),
  deleteCategory: (id: number, replaceCategoryId: number) =>
    apiFetch(`/api/categories/${id}?replace=${replaceCategoryId}`, { method: 'DELETE' }),
}
