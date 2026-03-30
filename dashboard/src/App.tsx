import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, type Category, type Expense, type SessionInfo, type SummaryData } from './lib/api'

type RoutePath = '/' | '/expenses' | '/categories'

const NAV_ITEMS: Array<{ href: RoutePath; label: string; eyebrow: string }> = [
  { href: '/', label: 'Overview', eyebrow: '總覽' },
  { href: '/expenses', label: 'Expenses', eyebrow: '帳目' },
  { href: '/categories', label: 'Categories', eyebrow: '分類' },
]

const CHART_COLORS = ['#f97316', '#14b8a6', '#facc15', '#fb7185', '#60a5fa', '#34d399']

function currency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function getRoute(pathname: string): RoutePath {
  if (pathname === '/expenses') return '/expenses'
  if (pathname === '/categories') return '/categories'
  return '/'
}

function navigate(path: RoutePath, setRoute: (path: RoutePath) => void) {
  if (window.location.pathname === path) return
  window.history.pushState({}, '', path)
  setRoute(path)
}

function Shell({
  activeRoute,
  session,
  onNavigate,
  children,
}: {
  activeRoute: RoutePath
  session: SessionInfo | null
  onNavigate: (path: RoutePath) => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="glass-panel overflow-hidden">
          <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">
                Accounting Assistant
              </p>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                Financial control with a lighter frontend footprint.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                This dashboard is built for Cloudflare Pages, while the existing
                Worker keeps serving the accounting and agent-tool APIs behind the scenes.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-200 shadow-[0_20px_80px_rgba(8,15,32,0.45)]">
              <p className="text-xs uppercase tracking-[0.25em] text-teal-300/70">
                Zero Trust
              </p>
              <p className="mt-2 font-medium text-white">
                {session?.email ?? 'Waiting for Cloudflare Access identity'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {session?.accessProtected
                  ? 'Authenticated session detected from Cloudflare Access.'
                  : 'Add Cloudflare Access to the Pages domain to require sign-in.'}
              </p>
            </div>
          </div>

          <nav className="border-t border-white/10 px-3 py-3">
            <ul className="grid gap-2 sm:grid-cols-3">
              {NAV_ITEMS.map((item) => {
                const isActive = item.href === activeRoute
                return (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.href)}
                      className={`nav-chip ${isActive ? 'nav-chip-active' : ''}`}
                    >
                      <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                        {item.eyebrow}
                      </span>
                      <span className="text-base font-medium text-white">{item.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        </header>

        <main>{children}</main>
      </div>
    </div>
  )
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="glass-panel p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return <div className="glass-panel p-10 text-center text-sm text-slate-300">{label}</div>
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-rose-400/30 bg-rose-950/40 p-4 text-sm text-rose-100">
      {message}
    </div>
  )
}

function OverviewPage() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const [summary, setSummary] = useState<SummaryData[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    setLoading(true)
    setError(null)

    Promise.all([
      api.summary(year, month),
      api.expenses({
        start: `${year}-${String(month).padStart(2, '0')}-01`,
        end: `${year}-${String(month).padStart(2, '0')}-31`,
      }),
    ])
      .then(([nextSummary, nextExpenses]) => {
        if (!alive) return
        setSummary(nextSummary)
        setExpenses(nextExpenses)
      })
      .catch((nextError: Error) => {
        if (alive) setError(nextError.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [month, year])

  const totalAmount = summary.reduce((acc, entry) => acc + entry.total, 0)
  const trendData = useMemo(() => {
    const trendMap: Record<string, number> = {}

    for (const expense of expenses) {
      trendMap[expense.date] = (trendMap[expense.date] ?? 0) + expense.amount
    }

    return Object.entries(trendMap)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, total]) => ({ date: date.slice(5), total }))
  }, [expenses])

  if (loading) return <LoadingState label="Loading monthly dashboard..." />
  if (error) return <ErrorState message={error} />

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Month Total" value={currency(totalAmount)} detail={`${year}-${String(month).padStart(2, '0')} spend`} />
        <StatCard label="Expenses" value={expenses.length.toString()} detail="Captured accounting rows" />
        <StatCard label="Categories" value={summary.length.toString()} detail="Buckets active this month" />
        <StatCard
          label="Average Ticket"
          value={expenses.length ? currency(Math.round(totalAmount / expenses.length)) : '$0'}
          detail="Rounded per-entry average"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-panel p-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Trend</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Daily outflow for this month</h2>
            </div>
            <p className="text-sm text-slate-400">{expenses.length} expense records</p>
          </div>

          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => currency(Number(value))}
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.24)',
                    borderRadius: 20,
                  }}
                />
                <Line type="monotone" dataKey="total" stroke="#f97316" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-20 text-center text-sm text-slate-400">No expense data for this month yet.</p>
          )}
        </div>

        <div className="glass-panel p-6">
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Breakdown</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Category share</h2>
          </div>

          {summary.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={summary}
                  dataKey="total"
                  nameKey="category_name"
                  innerRadius={62}
                  outerRadius={104}
                  paddingAngle={4}
                  label={({ category_name, percent }) =>
                    `${category_name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {summary.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => currency(Number(value))}
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid rgba(148, 163, 184, 0.24)',
                    borderRadius: 20,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-20 text-center text-sm text-slate-400">No categorized data available yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const loadData = useEffectEvent(async () => {
    setLoading(true)
    setError(null)

    try {
      const nextExpenses = await api.expenses({
        start: startDate || undefined,
        end: endDate || undefined,
      })
      setExpenses(nextExpenses)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load expenses')
    } finally {
      setLoading(false)
    }
  })

  useEffect(() => {
    // Run the initial load once; subsequent reloads are user-driven via filters.
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  const handleDelete = async (id: number) => {
    const accepted = window.confirm('Delete this expense record?')
    if (!accepted) return

    try {
      await api.deleteExpense(id)
      setExpenses((current) => current.filter((expense) => expense.id !== id))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to delete expense')
    }
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Explorer</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Expense ledger</h2>
            <p className="mt-2 text-sm text-slate-400">
              Filter by date, inspect what was captured by the bot, and prune noisy entries.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Start</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="field-input"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">End</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="field-input"
              />
            </label>
            <button type="button" onClick={() => void loadData()} className="action-button h-[46px] xl:self-end">
              Apply filters
            </button>
          </div>
        </div>
      </section>

      {error ? <ErrorState message={error} /> : null}

      {loading ? (
        <LoadingState label="Loading expenses..." />
      ) : (
        <section className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-100">
              <thead className="bg-white/5 text-xs uppercase tracking-[0.24em] text-slate-400">
                <tr>
                  <th className="px-4 py-4">ID</th>
                  <th className="px-4 py-4">Date</th>
                  <th className="px-4 py-4">Item</th>
                  <th className="px-4 py-4">Amount</th>
                  <th className="px-4 py-4">Category</th>
                  <th className="px-4 py-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                      No expense records matched this filter.
                    </td>
                  </tr>
                ) : (
                  expenses.map((expense) => (
                    <tr key={expense.id} className="border-t border-white/8">
                      <td className="px-4 py-4 text-slate-400">{expense.id}</td>
                      <td className="px-4 py-4">{expense.date}</td>
                      <td className="px-4 py-4 font-medium text-white">{expense.item}</td>
                      <td className="px-4 py-4 text-amber-300">{currency(expense.amount)}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200">
                          {expense.category_name}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => void handleDelete(expense.id)}
                          className="text-xs uppercase tracking-[0.24em] text-rose-300 transition hover:text-rose-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/8 px-4 py-4 text-xs uppercase tracking-[0.24em] text-slate-400">
            {expenses.length} rows • {currency(total)}
          </div>
        </section>
      )}
    </div>
  )
}

function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [replacementMap, setReplacementMap] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    api.categories()
      .then((nextCategories) => {
        if (!alive) return

        setCategories(nextCategories)
        setReplacementMap(() => {
          const nextMap: Record<number, number> = {}

          for (const category of nextCategories) {
            const fallback = nextCategories.find((candidate) => candidate.id !== category.id)
            if (fallback) nextMap[category.id] = fallback.id
          }

          return nextMap
        })
      })
      .catch((nextError: Error) => {
        if (alive) setError(nextError.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  const handleDelete = async (category: Category) => {
    const replacementId = replacementMap[category.id]

    if (!replacementId) {
      setError('Choose a replacement category before deleting this one.')
      return
    }

    const accepted = window.confirm(
      `Delete "${category.name}" and move its expenses to the selected replacement category?`,
    )
    if (!accepted) return

    try {
      await api.deleteCategory(category.id, replacementId)
      setCategories((current) => current.filter((entry) => entry.id !== category.id))
      setReplacementMap((current) => {
        const next = { ...current }
        delete next[category.id]
        return next
      })
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to delete category')
    }
  }

  if (loading) return <LoadingState label="Loading categories..." />

  return (
    <div className="space-y-6">
      <section className="glass-panel p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Categories</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Keep the taxonomy tidy</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Category management stays in the same accounting Worker, so the dashboard,
          Telegram flow, and future agent tools can all work from one shared source of truth.
        </p>
      </section>

      {error ? <ErrorState message={error} /> : null}

      <section className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-100">
            <thead className="bg-white/5 text-xs uppercase tracking-[0.24em] text-slate-400">
              <tr>
                <th className="px-4 py-4">ID</th>
                <th className="px-4 py-4">Name</th>
                <th className="px-4 py-4">Reassign to</th>
                <th className="px-4 py-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const options = categories.filter((entry) => entry.id !== category.id)

                return (
                  <tr key={category.id} className="border-t border-white/8">
                    <td className="px-4 py-4 text-slate-400">{category.id}</td>
                    <td className="px-4 py-4 font-medium text-white">{category.name}</td>
                    <td className="px-4 py-4">
                      {options.length > 0 ? (
                        <select
                          value={replacementMap[category.id] ?? ''}
                          onChange={(event) =>
                            setReplacementMap((current) => ({
                              ...current,
                              [category.id]: Number(event.target.value),
                            }))
                          }
                          className="field-input min-w-[220px]"
                        >
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-400">No replacement available</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        disabled={options.length === 0}
                        onClick={() => void handleDelete(category)}
                        className="text-xs uppercase tracking-[0.24em] text-rose-300 transition hover:text-rose-100 disabled:cursor-not-allowed disabled:text-slate-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-white/8 px-4 py-4 text-xs uppercase tracking-[0.24em] text-slate-400">
          {categories.length} categories available for the bot and future agent tools
        </div>
      </section>
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState<RoutePath>(() => getRoute(window.location.pathname))
  const [session, setSession] = useState<SessionInfo | null>(null)

  useEffect(() => {
    const handlePopState = () => setRoute(getRoute(window.location.pathname))

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    let alive = true

    api
      .session()
      .then((nextSession) => {
        if (alive) setSession(nextSession)
      })
      .catch(() => {
        if (alive) setSession({ email: null, accessProtected: false })
      })

    return () => {
      alive = false
    }
  }, [])

  return (
    <Shell
      activeRoute={route}
      session={session}
      onNavigate={(nextRoute) => navigate(nextRoute, setRoute)}
    >
      {route === '/' ? <OverviewPage /> : null}
      {route === '/expenses' ? <ExpensesPage /> : null}
      {route === '/categories' ? <CategoriesPage /> : null}
    </Shell>
  )
}
