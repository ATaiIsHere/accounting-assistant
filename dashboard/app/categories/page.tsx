'use client'
import { useEffect, useState } from 'react'
import { api, type Category } from '../../lib/api'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.categories().then(setCategories).finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: number, name: string) => {
    const other = categories.filter(c => c.id !== id)
    if (other.length === 0) {
      alert('至少需要保留一個分類！')
      return
    }
    const targetName = prompt(`刪除「${name}」分類後，相關帳目要移轉到哪個分類？\n\n可用分類：\n${other.map(c => `- ${c.name} (ID: ${c.id})`).join('\n')}\n\n請輸入目標分類名稱：`)
    const target = other.find(c => c.name === targetName)
    if (!target) { alert('找不到指定的目標分類！'); return }
    await api.deleteCategory(id, target.id)
    setCategories(other)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">📂 分類管理</h1>
      {loading ? (
        <div className="text-center text-gray-500 py-16">載入中...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60">
              <tr>
                {['ID','分類名稱','操作'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} className="border-t border-gray-800 hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3 text-gray-500">{cat.id}</td>
                  <td className="px-4 py-3 font-medium">{cat.name}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(cat.id, cat.name)}
                      className="text-red-500 hover:text-red-400 text-xs transition-colors">刪除並移轉</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-500">
            共 {categories.length} 個分類（透過 Telegram Bot 的自然語言指令或 `/categories` 指令管理）
          </div>
        </div>
      )}
    </div>
  )
}
