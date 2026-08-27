'use client'

import { useState } from 'react'
import type { GradeColumn, Criterion, Phase, Course } from '@/lib/types'

interface Props {
  phase?: Phase
  column?: GradeColumn
  defaultType?: string
  periodId: string
  course: Course
  phaseName?: string
  onSave: (column: GradeColumn, criteria?: Criterion[]) => void
  onClose: () => void
}

interface CriterionDraft {
  id?: string
  name: string
  max_score: number
}

export default function ColumnModal({ phase, column, defaultType, periodId, course, phaseName, onSave, onClose }: Props) {
  const isEdit = !!column
  const [name, setName] = useState(column?.name ?? '')
  const [type, setType] = useState<'formativa' | 'sumativa' | 'bonus'>(
    (column?.type ?? defaultType ?? 'formativa') as 'formativa' | 'sumativa' | 'bonus'
  )
  const [description, setDescription] = useState(column?.description ?? '')
  const [criteria, setCriteria] = useState<CriterionDraft[]>([])
  const [loadingCriteria, setLoadingCriteria] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDescLoading, setAiDescLoading] = useState(false)
  const [aiHint, setAiHint] = useState('')
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'info' | 'criteria'>(column?.type === 'sumativa' ? 'info' : 'info')
  const [bonusWithCriteria, setBonusWithCriteria] = useState(false)

  // Load existing criteria when editing a sumativa or bonus-with-criteria
  useState(() => {
    if ((column?.type === 'sumativa' || column?.type === 'bonus') && column.id) {
      setLoadingCriteria(true)
      fetch(`/api/criteria?columnId=${column.id}`)
        .then((r) => r.json())
        .then((data) => {
          setCriteria(data.map((c: Criterion) => ({ id: c.id, name: c.name, max_score: c.max_score })))
          if (column.type === 'bonus' && data.length > 0) setBonusWithCriteria(true)
          setLoadingCriteria(false)
        })
    }
  })

  async function generateDescription() {
    if (!name.trim()) { alert('Escribe primero el nombre de la columna'); return }
    setAiDescLoading(true)
    try {
      const res = await fetch('/api/ai/description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: name,
          phase: phaseName ?? phase?.name ?? '',
          course: course.name,
          type,
          notes: aiHint,
        }),
      })
      const data = await res.json()
      if (data.description) setDescription(data.description)
      else if (data.error) alert('Error IA: ' + data.error)
    } catch {
      alert('No se pudo conectar con la IA. Verifica que ANTHROPIC_API_KEY esté configurada en .env.local')
    }
    setAiDescLoading(false)
  }

  async function generateCriteria() {
    if (!description.trim()) { alert('Escribe primero la descripción de la actividad'); return }
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          activity: name,
          phase: phaseName ?? phase?.name ?? '',
          course: course.name,
        }),
      })
      const data = await res.json()
      if (data.criteria) setCriteria(data.criteria)
      else if (data.error) alert('Error IA: ' + data.error)
    } catch {
      alert('No se pudo conectar con la IA. Verifica que ANTHROPIC_API_KEY esté configurada en .env.local')
    }
    setAiLoading(false)
  }

  const criteriaTotal = criteria.reduce((sum, c) => sum + Number(c.max_score), 0)

  async function save() {
    if (!name.trim()) { alert('Escribe el nombre de la columna'); return }
    if (!description.trim()) { alert('La descripción es obligatoria antes de poder calificar'); return }
    if (type === 'sumativa' && criteria.length === 0 && !isEdit) {
      if (!confirm('¿Guardar sin criterios? Podrás agregarlos después editando la columna.')) return
    }
    if (type === 'sumativa' && criteria.length > 0) {
      const total = criteria.reduce((s, c) => s + Number(c.max_score), 0)
      if (Math.abs(total - 10) > 0.01) {
        alert(`Los puntajes máximos deben sumar 10.0 (actualmente: ${total.toFixed(1)})`)
        return
      }
    }
    if (type === 'bonus' && bonusWithCriteria && criteria.length === 0 && !isEdit) {
      if (!confirm('¿Guardar sin criterios? Podrás agregarlos después editando la columna.')) return
    }

    setSaving(true)

    let savedColumn: GradeColumn

    if (isEdit && column) {
      const res = await fetch(`/api/columns/${column.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      savedColumn = await res.json()
    } else {
      const res = await fetch('/api/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase_id: type !== 'bonus' ? (phase?.id ?? (column as GradeColumn | undefined)?.phase_id) : null,
          period_id: periodId,
          name,
          description,
          type,
          sort_order: 99,
        }),
      })
      savedColumn = await res.json()
    }

    let savedCriteria: Criterion[] | undefined

    if ((type === 'sumativa' || (type === 'bonus' && bonusWithCriteria)) && criteria.length > 0) {
      const res = await fetch('/api/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_id: savedColumn.id, criteria }),
      })
      savedCriteria = await res.json()
    }

    setSaving(false)
    onSave(savedColumn, savedCriteria)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Editar columna' : 'Nueva columna de nota'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Type selector */}
          {!isEdit && (
            <div className="flex gap-2">
              {(['formativa', 'sumativa', 'bonus'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                    type === t
                      ? t === 'formativa' ? 'bg-green-100 border-green-400 text-green-800'
                        : t === 'sumativa' ? 'bg-blue-100 border-blue-400 text-blue-800'
                        : 'bg-purple-100 border-purple-400 text-purple-800'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la columna *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'formativa' ? 'Ej: Formativa – Boceto inicial' : type === 'sumativa' ? 'Ej: Sumativa – Personaje Illustrator' : 'Ej: Participación'}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* AI hint */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Indicaciones para IA (opcional)
            </label>
            <input
              value={aiHint}
              onChange={(e) => setAiHint(e.target.value)}
              placeholder="Ej: usa herramienta pluma, capas, cuentagotas..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">
                Descripción de la actividad *
                <span className="ml-1 text-xs text-gray-400">(obligatoria para calificar)</span>
              </label>
              <button
                onClick={generateDescription}
                disabled={aiDescLoading}
                className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                {aiDescLoading ? 'Generando...' : '✨ Ayúdame a redactar'}
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe qué evalúa esta actividad, herramientas y habilidades involucradas..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Criteria toggle for bonus */}
          {type === 'bonus' && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bonusWithCriteria}
                onChange={(e) => {
                  setBonusWithCriteria(e.target.checked)
                  if (!e.target.checked) setCriteria([])
                }}
                className="w-4 h-4 accent-purple-600"
              />
              <span className="text-sm font-medium text-gray-700">Calificar con criterios de evaluación</span>
            </label>
          )}

          {/* Criteria (for sumativas and bonus-with-criteria) */}
          {(type === 'sumativa' || (type === 'bonus' && bonusWithCriteria)) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-medium text-gray-700">Criterios de evaluación</span>
                  <span className={`ml-2 text-xs font-bold ${type === 'sumativa' && Math.abs(criteriaTotal - 10) > 0.01 && criteria.length > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {type === 'sumativa' ? `${criteriaTotal.toFixed(1)} / 10.0` : `Total: ${criteriaTotal.toFixed(1)}`}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCriteria((prev) => [...prev, { name: '', max_score: 1 }])}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    + Agregar
                  </button>
                  <button
                    onClick={generateCriteria}
                    disabled={aiLoading}
                    className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                  >
                    {aiLoading ? 'Generando...' : '✨ Sugerir criterios'}
                  </button>
                </div>
              </div>

              {loadingCriteria ? (
                <div className="text-sm text-gray-400">Cargando criterios...</div>
              ) : (
                <div className="space-y-2">
                  {criteria.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                      <input
                        value={c.name}
                        onChange={(e) => {
                          setCriteria((prev) => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))
                        }}
                        placeholder="Nombre del criterio"
                        className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">Máx:</span>
                        <input
                          type="number"
                          min={0.5}
                          max={10}
                          step={0.5}
                          value={c.max_score}
                          onChange={(e) => {
                            setCriteria((prev) => prev.map((x, i) => i === idx ? { ...x, max_score: Number(e.target.value) } : x))
                          }}
                          className="w-14 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        onClick={() => setCriteria((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-gray-300 hover:text-red-500 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {criteria.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-4">
                      Sin criterios — usa "Sugerir criterios" o agrégalos manualmente
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear columna'}
          </button>
        </div>
      </div>
    </div>
  )
}
