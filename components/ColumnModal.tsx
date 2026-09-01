'use client'

import { useState } from 'react'
import type { GradeColumn, Criterion, CriterionLevel, Course } from '@/lib/types'
import type { CompetencyKey } from '@/lib/competencies'
import { COMPETENCIES } from '@/lib/competencies'

interface Props {
  competencyKey?: CompetencyKey
  column?: GradeColumn
  defaultType?: string
  periodId: string
  course: Course
  onSave: (column: GradeColumn, criteria?: Criterion[]) => void
  onClose: () => void
}

interface CriterionDraft {
  id?: string
  name: string
  max_score: number
  levels?: CriterionLevel[]
}

export default function ColumnModal({ competencyKey, column, defaultType, periodId, course, onSave, onClose }: Props) {
  const isEdit = !!column
  const [name, setName] = useState(column?.name ?? '')
  const [isEntrega, setIsEntrega] = useState(column?.type === 'entrega')
  const [type, setType] = useState<'formativa' | 'sumativa' | 'bonus'>(
    (column?.type === 'entrega' ? 'bonus' : column?.type ?? defaultType ?? 'formativa') as 'formativa' | 'sumativa' | 'bonus'
  )
  const [description, setDescription] = useState(column?.description ?? '')
  const [criteria, setCriteria] = useState<CriterionDraft[]>([])
  const [loadingCriteria, setLoadingCriteria] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDescLoading, setAiDescLoading] = useState(false)
  const [aiHint, setAiHint] = useState('')
  const [saving, setSaving] = useState(false)
  const [bonusWithCriteria, setBonusWithCriteria] = useState(false)
  const [formativaWithCriteria, setFormativaWithCriteria] = useState(false)
  const [showJsonImport, setShowJsonImport] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState('')

  const effectiveCompetencyKey = competencyKey ?? (column?.competency_key as CompetencyKey | undefined)
  const competency = effectiveCompetencyKey ? COMPETENCIES[effectiveCompetencyKey] : null

  useState(() => {
    if (column?.id && column.type !== 'formativa' || (column?.type === 'formativa' && column.id)) {
      if (!column?.id) return
      setLoadingCriteria(true)
      fetch(`/api/criteria?columnId=${column.id}`)
        .then((r) => r.json())
        .then((data) => {
          setCriteria(data.map((c: Criterion) => ({ id: c.id, name: c.name, max_score: c.max_score, levels: c.levels })))
          if (column.type === 'bonus' && data.length > 0) setBonusWithCriteria(true)
          if (column.type === 'formativa' && data.length > 0) setFormativaWithCriteria(true)
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
          phase: competency?.name ?? '',
          course: course.name,
          type,
          notes: aiHint,
        }),
      })
      const data = await res.json()
      if (data.description) setDescription(data.description)
      else if (data.error) alert('Error IA: ' + data.error)
    } catch {
      alert('No se pudo conectar con la IA. Verifica que ANTHROPIC_API_KEY esté configurada.')
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
          phase: competency?.name ?? '',
          course: course.name,
        }),
      })
      const data = await res.json()
      if (data.criteria) setCriteria(data.criteria)
      else if (data.error) alert('Error IA: ' + data.error)
    } catch {
      alert('No se pudo conectar con la IA. Verifica que ANTHROPIC_API_KEY esté configurada.')
    }
    setAiLoading(false)
  }

  function importFromJson() {
    setJsonError('')
    try {
      const parsed = JSON.parse(jsonInput)
      const raw: unknown[] = Array.isArray(parsed) ? parsed : parsed?.criteria
      if (!Array.isArray(raw) || raw.length === 0) {
        setJsonError('El JSON debe tener un array "criteria" con al menos un criterio.')
        return
      }
      const imported: CriterionDraft[] = raw.map((c: unknown) => {
        const item = c as Record<string, unknown>
        return {
          name: String(item.name ?? ''),
          max_score: Number(item.points_available ?? item.max_score ?? 0),
          levels: Array.isArray(item.levels) ? (item.levels as CriterionLevel[]) : undefined,
        }
      })
      if (imported.some((c) => !c.name.trim() || !c.max_score)) {
        setJsonError('Cada criterio debe tener "name" y "points_available" (o "max_score").')
        return
      }
      if (type === 'sumativa') {
        const total = imported.reduce((s, c) => s + c.max_score, 0)
        if (Math.abs(total - 10) > 0.01) {
          setJsonError(`Los puntajes deben sumar 10.0 para sumativa (actualmente: ${total.toFixed(1)}).`)
          return
        }
      }
      if (criteria.length > 0 && !confirm('¿Reemplazar los criterios actuales con los del JSON?')) return
      setCriteria(imported)
      setShowJsonImport(false)
      setJsonInput('')
    } catch {
      setJsonError('JSON inválido. Verifica el formato e intenta de nuevo.')
    }
  }

  const criteriaTotal = criteria.reduce((sum, c) => sum + Number(c.max_score), 0)

  async function save() {
    if (!name.trim()) { alert('Escribe el nombre de la columna'); return }
    if (!isEntrega && !description.trim()) { alert('La descripción es obligatoria antes de poder calificar'); return }
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

    try {
      let savedColumn: GradeColumn

      if (isEdit && column) {
        const res = await fetch(`/api/columns/${column.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        })
        if (res.redirected || res.url.includes('/login')) {
          alert('Tu sesión expiró. Recarga la página e inicia sesión de nuevo.')
          return
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          alert('Error al guardar la columna: ' + (data.error ?? 'Error desconocido'))
          return
        }
        savedColumn = await res.json()
      } else {
        const res = await fetch('/api/columns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            competency_key: type !== 'bonus' ? (effectiveCompetencyKey ?? null) : null,
            period_id: periodId,
            name,
            description,
            type: isEntrega ? 'entrega' : type,
            sort_order: 99,
          }),
        })
        if (res.redirected || res.url.includes('/login')) {
          alert('Tu sesión expiró. Recarga la página e inicia sesión de nuevo.')
          return
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          alert('Error al crear la columna: ' + (data.error ?? 'Error desconocido'))
          return
        }
        savedColumn = await res.json()
      }

      let savedCriteria: Criterion[] | undefined
      if ((type === 'sumativa' || (type === 'bonus' && bonusWithCriteria) || (type === 'formativa' && formativaWithCriteria)) && criteria.length > 0) {
        const res = await fetch('/api/criteria', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ column_id: savedColumn.id, criteria }),
        })
        if (res.ok) savedCriteria = await res.json()
      }

      onSave(savedColumn, savedCriteria)
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? 'Editar evaluación' : 'Nueva evaluación'}
            </h2>
            {competency && (
              <p className={`text-xs mt-0.5 font-medium ${competency.textColor}`}>
                {competency.short} — {competency.name}
              </p>
            )}
          </div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la evaluación *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'formativa' ? 'Ej: Boceto inicial' : type === 'sumativa' ? 'Ej: Personaje en Illustrator' : 'Ej: Participación'}
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

          {/* Criteria toggle for formativa */}
          {type === 'formativa' && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formativaWithCriteria}
                onChange={(e) => {
                  setFormativaWithCriteria(e.target.checked)
                  if (!e.target.checked) setCriteria([])
                }}
                className="w-4 h-4 accent-green-600"
              />
              <span className="text-sm font-medium text-gray-700">Calificar con rúbrica (criterios opcionales)</span>
            </label>
          )}

          {/* Criteria toggle for bonus */}
          {type === 'bonus' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isEntrega}
                  onChange={(e) => {
                    setIsEntrega(e.target.checked)
                    if (e.target.checked) { setBonusWithCriteria(false); setCriteria([]) }
                  }}
                  className="w-4 h-4 accent-purple-600"
                />
                <span className="text-sm font-medium text-gray-700">Solo entrega / no entrega <span className="text-gray-400 font-normal">(sin nota, no afecta la calificación)</span></span>
              </label>
              {!isEntrega && (
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
            </div>
          )}

          {/* Criteria */}
          {!isEntrega && (type === 'sumativa' || (type === 'bonus' && bonusWithCriteria) || (type === 'formativa' && formativaWithCriteria)) && (
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
                    onClick={() => { setShowJsonImport((v) => !v); setJsonError('') }}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    📥 Importar rúbrica
                  </button>
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

              {showJsonImport && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-2">
                  <p className="text-xs text-purple-700 mb-2 font-medium">
                    Pega el JSON de la rúbrica detallada (con niveles por criterio):
                  </p>
                  <textarea
                    value={jsonInput}
                    onChange={(e) => { setJsonInput(e.target.value); setJsonError('') }}
                    rows={5}
                    placeholder={'{\n  "criteria": [\n    { "name": "...", "points_available": 3, "levels": [...] }\n  ]\n}'}
                    className="w-full border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                  {jsonError && <p className="text-xs text-red-600 mt-1">{jsonError}</p>}
                  <div className="flex gap-2 mt-2 justify-end">
                    <button
                      onClick={() => { setShowJsonImport(false); setJsonInput(''); setJsonError('') }}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={importFromJson}
                      className="text-xs bg-purple-600 text-white px-3 py-1 rounded-lg hover:bg-purple-700"
                    >
                      Importar
                    </button>
                  </div>
                </div>
              )}

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
                      {c.levels && c.levels.length > 0 && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                          {c.levels.length} niveles
                        </span>
                      )}
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
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear evaluación'}
          </button>
        </div>
      </div>
    </div>
  )
}
