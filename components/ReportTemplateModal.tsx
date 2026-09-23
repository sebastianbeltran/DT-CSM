'use client'

import { useState, useEffect } from 'react'
import type { Student, Period } from '@/lib/types'

interface Template {
  id: string
  text: string
  studentIds: Set<string>
}

interface Props {
  students: Student[]
  period: Period
  onClose: () => void
}

const COLORS = [
  { border: 'border-blue-200',   bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',     check: 'accent-blue-600'   },
  { border: 'border-orange-200', bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700',  check: 'accent-orange-500' },
  { border: 'border-green-200',  bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',    check: 'accent-green-600'  },
  { border: 'border-purple-200', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700',  check: 'accent-purple-600' },
]

function newTemplate(): Template {
  return { id: crypto.randomUUID(), text: '', studentIds: new Set() }
}

function loadSaved(): Template[] {
  try {
    const raw = localStorage.getItem('report-templates')
    if (!raw) return [newTemplate()]
    const texts: string[] = JSON.parse(raw)
    if (!Array.isArray(texts) || texts.length === 0) return [newTemplate()]
    return texts.map((text) => ({ id: crypto.randomUUID(), text, studentIds: new Set() }))
  } catch {
    return [newTemplate()]
  }
}

function save(templates: Template[]) {
  localStorage.setItem('report-templates', JSON.stringify(templates.map((t) => t.text)))
}

// "ESPINOSA CALDERÓN, MARÍA DEL MAR" → "María Del Mar"
function firstName(fullName: string): string {
  const after = fullName.includes(',') ? fullName.split(',')[1] : fullName
  return after.trim().toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function ReportTemplateModal({ students, period, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>(loadSaved)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ done: number; errors: number } | null>(null)

  useEffect(() => { save(templates) }, [templates])

  const totalAssigned = templates.reduce((sum, t) => sum + t.studentIds.size, 0)

  function addTemplate() {
    setTemplates((prev) => [...prev, newTemplate()])
  }

  function removeTemplate(id: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  function updateText(id: string, text: string) {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)))
  }

  function toggleStudent(templateId: string, studentId: string) {
    setTemplates((prev) =>
      prev.map((t) => {
        if (t.id === templateId) {
          const next = new Set(t.studentIds)
          if (next.has(studentId)) next.delete(studentId)
          else next.add(studentId)
          return { ...t, studentIds: next }
        }
        // Remove from other templates — a student belongs to only one
        const next = new Set(t.studentIds)
        next.delete(studentId)
        return { ...t, studentIds: next }
      })
    )
  }

  function selectAvailable(templateId: string) {
    setTemplates((prev) => {
      const otherAssigned = new Set(
        prev.filter((t) => t.id !== templateId).flatMap((t) => Array.from(t.studentIds))
      )
      const available = new Set(students.filter((s) => !otherAssigned.has(s.id)).map((s) => s.id))
      return prev.map((t) =>
        t.id === templateId
          ? { ...t, studentIds: available }
          : { ...t, studentIds: new Set(Array.from(t.studentIds).filter((id) => !available.has(id))) }
      )
    })
  }

  function deselectAll(templateId: string) {
    setTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...t, studentIds: new Set() } : t)))
  }

  async function generate() {
    const hasTextMissing = templates.some((t) => t.studentIds.size > 0 && !t.text.trim())
    if (hasTextMissing) {
      alert('Hay plantillas con estudiantes asignadas pero sin texto. Completa el texto o quita las estudiantes.')
      return
    }
    if (totalAssigned === 0) {
      alert('Asigna al menos una estudiante a una plantilla.')
      return
    }

    setGenerating(true)
    setResult(null)
    let done = 0, errors = 0

    for (const tpl of templates) {
      for (const studentId of Array.from(tpl.studentIds)) {
        const student = students.find((s) => s.id === studentId)
        if (!student) continue
        const content = tpl.text.replace(/\[Nombre\]/gi, firstName(student.name))
        try {
          const res = await fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: student.id, period_id: period.id, content }),
          })
          if (res.ok) done++
          else errors++
        } catch {
          errors++
        }
      }
    }

    setGenerating(false)
    setResult({ done, errors })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Generar informes por plantilla</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Período: {period.name} · Usa <code className="bg-gray-100 px-1 rounded">[Nombre]</code> para el nombre de pila (ej: <em>María Juliana</em>)
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {templates.map((tpl, idx) => {
            const color = COLORS[idx % COLORS.length]
            const otherAssigned = new Set(
              templates.filter((t) => t.id !== tpl.id).flatMap((t) => Array.from(t.studentIds))
            )

            return (
              <div key={tpl.id} className={`rounded-xl border-2 ${color.border} ${color.bg} p-4 space-y-3`}>

                {/* Template header */}
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>
                    Plantilla {idx + 1}
                  </span>
                  <span className="text-xs text-gray-400">
                    {tpl.studentIds.size} estudiante{tpl.studentIds.size !== 1 ? 's' : ''}
                  </span>
                  {templates.length > 1 && (
                    <button
                      onClick={() => removeTemplate(tpl.id)}
                      className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                {/* Textarea */}
                <textarea
                  value={tpl.text}
                  onChange={(e) => updateText(tpl.id, e.target.value)}
                  rows={4}
                  placeholder={`[Nombre] ha demostrado un desarrollo sobresaliente en las actividades de análisis...`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white"
                />
                {tpl.text.trim() && !/\[nombre\]/i.test(tpl.text) && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    ⚠️ Esta plantilla no tiene <code className="bg-amber-50 px-1 rounded">[Nombre]</code> — los informes generados no incluirán el nombre de la estudiante.
                  </p>
                )}

                {/* Students grid */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500">Estudiantes</span>
                    <div className="flex gap-3 text-xs">
                      <button onClick={() => selectAvailable(tpl.id)} className="text-blue-600 hover:underline">
                        Seleccionar disponibles
                      </button>
                      <button onClick={() => deselectAll(tpl.id)} className="text-gray-400 hover:underline">
                        Quitar todas
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {students.map((s) => {
                      const inOther = otherAssigned.has(s.id)
                      const checked = tpl.studentIds.has(s.id)
                      return (
                        <label
                          key={s.id}
                          className={`flex items-center gap-2 text-xs ${inOther ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer hover:text-gray-900'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={inOther}
                            onChange={() => !inOther && toggleStudent(tpl.id, s.id)}
                            className={`${color.check} w-3.5 h-3.5 flex-shrink-0`}
                          />
                          <span className={inOther ? 'line-through text-gray-400' : 'text-gray-700 truncate'}>
                            {s.name}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add template */}
          <button
            onClick={addTemplate}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            + Agregar otra plantilla
          </button>

          {/* Result */}
          {result && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${result.errors === 0 ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}`}>
              {result.errors === 0
                ? `✓ ${result.done} informes generados correctamente.`
                : `✓ ${result.done} generados · ${result.errors} con error.`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50"
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            onClick={generate}
            disabled={generating || totalAssigned === 0}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generando...
              </>
            ) : (
              `Generar ${totalAssigned > 0 ? totalAssigned : ''} informes`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
