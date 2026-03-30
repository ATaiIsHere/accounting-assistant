'use client'
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { api, type SummaryData, type Expense } from '../lib/api'

const COLORS = ['#6366f1','#22d3ee','#f59e0b','#10b981','#f43f5e','#a78bfa','#fb923c','#34d399']

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-3xl font-bold text-white">{value}</span>
    </div>
  )
}

export default function HomePage() {
  const now = new Date()
  const [year] = useState(now.getFullYear())
  const [month] = useState(now.getMonth() + 1)
  const [summary, setSummary] = useState<SummaryData[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.summary(year, month),
      api.expenses({
        start: `${year}-${String(month).padStart(2,'0')}-01`,
        end: `${year}-${String(month).padStart(2,'0')}-31`
      })
    ]).then(([sum, exp]) => {
      setSummary(sum)
      setExpenses(exp)
    }).finally(() => setLoading(false))
  }, [year, month])

  const totalAmount = summary.reduce((acc, s) => acc + s.total, 0)
  const categoryCount = summary.length

  // Group expenses by day for trend line
  const trendMap: Record<string, number> = {}
  for (const e of expenses) {
    trendMap[e.date] = (trendMap[e.date] ?? 0) + e.amount
  }
  const trendData = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date: date.slice(5), total }))

  if (loading) return <div className="text-center text-gray-500 py-20">載入中...</div>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">本月總覽</h1>
        <p className="text-gray-500 text-sm">{year} 年 {month} 月</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="總花費" value={`$${totalAmount.toLocaleString()}`} />
        <StatCard label="筆數" value={`${expenses.length} 筆`} />
        <StatCard label="分類數" value={`${categoryCount} 個`} />
        <StatCard label="平均每筆" value={expenses.length ? `$${Math.round(totalAmount / expenses.length)}` : '-'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">📊 分類分佈</h2>
          {summary.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={summary} dataKey="total" nameKey="category_name" cx="50%" cy="50%" outerRadius={90} label={(props) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const { category_name, percent } = props as any
                  return `${category_name} ${((percent ?? 0)*100).toFixed(0)}%`
                }}>
                  {summary.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-600 text-center py-16">本月尚無帳目</p>}
        </div>

        {/* Line Chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">📈 每日花費趨勢</h2>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip formatter={(v) => `$${Number(v)}`} contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-600 text-center py-16">本月尚無帳目</p>}
        </div>
      </div>
    </div>
  )
}
