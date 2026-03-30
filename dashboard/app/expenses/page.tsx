'use client'
import { useEffect, useState } from 'react'
import { api, type Expense } from '../../lib/api'

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const loadData = () => {
    setLoading(true)
    api.expenses({ start: startDate || undefined, end: endDate || undefined })
      .then(setExpenses).finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這筆帳目嗎？')) return
    await api.deleteExpense(id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">📋 帳目管理</h1>

      {/* Filter */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">開始日期</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">結束日期</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={loadData}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-1.5 rounded-lg transition-colors">
          套用篩選
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-500 py-16">載入中...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60">
              <tr>
                {['#','日期','品項','金額','分類','操作'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-600 py-12">查無帳目</td></tr>
              ) : expenses.map(e => (
                <tr key={e.id} className="border-t border-gray-800 hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3 text-gray-500">{e.id}</td>
                  <td className="px-4 py-3">{e.date}</td>
                  <td className="px-4 py-3">{e.item}</td>
                  <td className="px-4 py-3 text-indigo-400 font-medium">${e.amount.toLocaleString()}</td>
                  <td className="px-4 py-3"><span className="bg-gray-800 px-2 py-0.5 rounded text-xs">{e.category_name}</span></td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(e.id)}
                      className="text-red-500 hover:text-red-400 text-xs transition-colors">刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {expenses.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-500">
              共 {expenses.length} 筆，總計 ${expenses.reduce((a, e) => a + e.amount, 0).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
