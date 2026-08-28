'use client'

import { useState } from 'react'
import type { GradeColumn, Criterion, Student, Grade } from '@/lib/types'

interface Group {
  id: string
  name: string
  work_group_members: { student_id: string }[]
}

interface Props {
  column: GradeColumn
  criteria: Criterion[]
  groups: Group[]
  students: Student[]
  grades: Grade[]
  onSave: (updatedGrades: Grade[]) => void
  onClose: () => void
}

interface CriterionScore {
  criterion_id: string
  score: number
}

export default function GroupGradeModal({ column, criteria, groups, students, grades, onSave, onClose }: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id ?? '')
  const [score, setScore] = useState<string>('')
  const [criterionScores, setCriterionScores] = useState<CriterionScore[]>(
    criteria.map((c) => ({ criterion_id: c.id, score: 0 }))
  )
  const [saving, setSaving] = useState(false)
  const [overrideAdjusted, setOverrideAdjusted] = useState(false)

  const selectedGroup = groups.find((g) => g.id === selectedGroupId)
  const memberStudents = students.filter((s) =>
    selectedGroup?.work_group_members.some((m) => m.student_id === s.id)
  )
  const adjustedMembers = memberStudents.filter((s) =>
    grades.find((g) => g.student_id === s.id && g.column_id === column.id && g.is_manually_adjusted)
  )

  const totalCriteriaScore = criterionScores.reduce((sum, cs) => sum + Number(cs.score), 0)
  const totalMaxScore = criteria.reduce((sum, c) => sum + Number(c.max_score), 0)
  const hasCriteria = criteria.length > 0
  const finalScore = hasCriteria ? totalCriteriaScore : parseFloat(score)

  async function applyToGroup() {
    if (memberStudents.length === 0) { alert('El grupo no tiene integrantes'); return }
    if (!hasCriteria && (isNaN(finalScore) || finalScore < 0 || finalScore > 10)) {
      alert('Escribe una nota válida entre 0 y 10'); return
    }

    setSaving(true)

    try {
      const method = overrideAdjusted ? 'PUT' : 'POST'
      const res = await fetch('/api/grades/group', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: selectedGroupId,
          column_id: column.id,
          score: hasCriteria ? totalCriteriaScore : finalScore,
          criterion_grades: hasCriteria ? criterionScores : undefined,
        }),
      })
      if (res.redirected || res.url.includes('/login')) {
        alert('Tu sesión expiró. Recarga la página e inicia sesión de nuevo.')
        return
      }
      const data = await res.json()
      if (data.ok) {
        onSave(data.results)
        onClose()
      } else {
        alert('Error: ' + data.error)
      }
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Calificar por grupo</h2>
            <p className="text-sm text-gray-500">{column.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Group selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Grupo</label>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    selectedGroupId === g.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {g.name}
                  <span className="ml-1 text-xs opacity-70">({g.work_group_members.length})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Members preview */}
          {selectedGroup && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-2">Integrantes que recibirán esta nota:</p>
              <div className="flex flex-wrap gap-1">
                {memberStudents.map((s) => {
                  const isAdjusted = adjustedMembers.some((a) => a.id === s.id)
                  return (
                    <span
                      key={s.id}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        isAdjusted && !overrideAdjusted
                          ? 'bg-orange-100 text-orange-700 line-through'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                      title={isAdjusted ? 'Tiene nota ajustada individualmente' : ''}
                    >
                      {s.name.split(',')[0]}
                      {isAdjusted && !overrideAdjusted ? ' (ajustada)' : ''}
                    </span>
                  )
                })}
              </div>
              {adjustedMembers.length > 0 && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideAdjusted}
                    onChange={(e) => setOverrideAdjusted(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-orange-700">
                    Sobrescribir también las notas ajustadas individualmente ({adjustedMembers.length})
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Score input */}
          {hasCriteria ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Puntaje por criterios
                <span className="ml-2 font-bold text-blue-700">{totalCriteriaScore.toFixed(1)} / {totalMaxScore.toFixed(1)}</span>
              </label>
              <div className="space-y-2">
                {criteria.map((c) => {
                  const cs = criterionScores.find((x) => x.criterion_id === c.id)
                  const val = cs?.score ?? 0
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="flex-1 text-sm text-gray-700">{c.name}</span>
                      <span className="text-xs text-gray-400">/ {c.max_score}</span>
                      <input
                        type="number"
                        min={0}
                        max={c.max_score}
                        step={0.5}
                        value={val}
                        onChange={(e) => {
                          const v = Math.min(c.max_score, Math.max(0, Number(e.target.value)))
                          setCriterionScores((prev) =>
                            prev.map((x) => x.criterion_id === c.id ? { ...x, score: v } : x)
                          )
                        }}
                        className="w-16 text-center border-2 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nota del grupo (0 – 10)
              </label>
              <input
                autoFocus
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Ej: 8.5"
                className="w-full text-center text-3xl font-bold border-2 rounded-xl py-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={applyToGroup}
            disabled={saving || memberStudents.length === 0}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Aplicando...' : `Aplicar a ${memberStudents.length} integrantes`}
          </button>
        </div>
      </div>
    </div>
  )
}
