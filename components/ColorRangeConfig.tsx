'use client'

import { useState } from 'react'
import type { ColorRange } from '@/lib/types'

interface Props {
  courseId: string
  ranges: ColorRange[]
  onSave: (ranges: ColorRange[]) => void
  onClose: () => void
}

interface Draft {
  id?: string
  label: string
  min_score: number
  max_score: number
  color: string
}

const PRESET_COLORS = [
  '#fca5a5', '#fde68a', '#bbf7d0', '#93c5fd', '#c4b5fd', '#f9a8d4',
]

export default function ColorRangeConfig({ courseId, ranges, onSave, onClose }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>(
    ranges.length > 0
      ? ranges.map((r) => ({ id: r.id, label: r.label, min_score: r.min_score, max_score: r.max_score, color: r.color }))
      : [
          { label: 'En riesgo', min_score: 0, max_score: 6.4, color: '#fca5a5' },
          { label: 'En proceso', min_score: 6.5, max_score: 8.0, color: '#fde68a' },
          { label: 'Aprobado', min_score: 8.01, max_score: 10.0, color: '#bbf7d0' },
        ]
  )
  const [saving, setSaving] = useState(false)

  function update(idx: number, field: string, value: string | number) {
    setDrafts((prev) => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/color-ranges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_id: courseId, ranges: drafts }),
    })
    const data = await res.json()
    setSaving(false)
    onSave(data)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold">Configurar semáforo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {drafts.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg border border-gray-300 flex-shrink-0 cursor-pointer"
                style={{ backgroundColor: d.color }}
                title="Color"
              />
              <input
                value={d.label}
                onChange={(e) => update(idx, 'label', e.target.value)}
                placeholder="Etiqueta"
                className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="number"
                value={d.min_score}
                onChange={(e) => update(idx, 'min_score', Number(e.target.value))}
                className="w-16 border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                step={0.1}
              />
              <span className="text-gray-400 text-sm">–</span>
              <input
                type="number"
                value={d.max_score}
                onChange={(e) => update(idx, 'max_score', Number(e.target.value))}
                className="w-16 border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                step={0.1}
              />
              <div className="flex gap-0.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => update(idx, 'color', c)}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${d.color === c ? 'border-gray-700 scale-125' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500">✕</button>
            </div>
          ))}

          <button
            onClick={() => setDrafts((prev) => [...prev, { label: 'Nuevo rango', min_score: 0, max_score: 10, color: PRESET_COLORS[0] }])}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Agregar rango
          </button>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={save} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
