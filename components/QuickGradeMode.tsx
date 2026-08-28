'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GradeColumn, Criterion, Student, Grade, CriterionGrade } from '@/lib/types'
import { computeCriteriaTotal } from '@/lib/calculations'

interface Props {
  column: GradeColumn
  criteria: Criterion[]
  students: Student[]
  grades: Grade[]
  criterionGrades: CriterionGrade[]
  onClose: () => void
  onSave: (grades: Grade[], criterionGrades: CriterionGrade[]) => void
}

interface StudentScores {
  [studentId: string]: { [criterionId: string]: string }
}

export default function QuickGradeMode({ column, criteria, students, grades, criterionGrades, onClose, onSave }: Props) {
  const [currentStudentIdx, setCurrentStudentIdx] = useState(0)
  const [scores, setScores] = useState<StudentScores>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    // Initialize scores from existing grades
    const initial: StudentScores = {}
    for (const student of students) {
      initial[student.id] = {}
      const grade = grades.find((g) => g.student_id === student.id && g.column_id === column.id)
      if (grade) {
        for (const criterion of criteria) {
          const cg = criterionGrades.find((cg) => cg.grade_id === grade.id && cg.criterion_id === criterion.id)
          initial[student.id][criterion.id] = cg ? cg.score.toString() : ''
        }
      } else {
        for (const criterion of criteria) {
          initial[student.id][criterion.id] = ''
        }
      }
    }
    setScores(initial)
  }, [])

  useEffect(() => {
    // Focus first criterion of current student
    inputRefs.current[0]?.focus()
  }, [currentStudentIdx])

  const currentStudent = students[currentStudentIdx]

  function getTotal(studentId: string): number {
    if (!scores[studentId]) return 0
    return criteria.reduce((sum, c) => {
      const v = parseFloat(scores[studentId]?.[c.id] ?? '0')
      return sum + (isNaN(v) ? 0 : v)
    }, 0)
  }

  function handleChange(criterionIdx: number, value: string, criterion: Criterion) {
    const studentId = currentStudent.id
    const num = parseFloat(value)

    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [criterion.id]: value,
      },
    }))

  }

  function getFirstInvalidCriterionIdx(): number {
    const studentScores = scores[currentStudent?.id] ?? {}
    return criteria.findIndex((c) => {
      const v = parseFloat(studentScores[c.id] ?? '0')
      return !isNaN(v) && v > c.max_score
    })
  }

  function handleKeyDown(e: React.KeyboardEvent, criterionIdx: number) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const nextCritIdx = criterionIdx + 1
      if (nextCritIdx < criteria.length) {
        inputRefs.current[nextCritIdx]?.focus()
      } else {
        // Validate before advancing
        const invalidIdx = getFirstInvalidCriterionIdx()
        if (invalidIdx !== -1) {
          inputRefs.current[invalidIdx]?.focus()
          inputRefs.current[invalidIdx]?.select()
          return
        }
        const studentId = currentStudent.id
        saveCurrentStudent(studentId).then((ok) => {
          if (ok && currentStudentIdx < students.length - 1) {
            setCurrentStudentIdx((i) => i + 1)
          }
        })
      }
    }
    if (e.key === 'Escape') onClose()
  }

  async function saveCurrentStudent(studentId: string): Promise<boolean> {
    setSaving(true)
    const studentScores = scores[studentId] ?? {}

    const invalidIdx = criteria.findIndex((c) => {
      const v = parseFloat(studentScores[c.id] ?? '0')
      return !isNaN(v) && v > c.max_score
    })
    if (invalidIdx !== -1) {
      inputRefs.current[invalidIdx]?.focus()
      inputRefs.current[invalidIdx]?.select()
      setSaving(false)
      return false
    }

    try {
      const gradeRes = await fetch('/api/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, column_id: column.id, score: getTotal(studentId) }),
      })
      if (gradeRes.redirected || gradeRes.url.includes('/login')) {
        alert('Tu sesión expiró. Recarga la página e inicia sesión de nuevo.')
        return false
      }
      if (!gradeRes.ok) {
        alert('Error al guardar la nota. Verifica tu conexión.')
        return false
      }
      const gradeData = await gradeRes.json()

      if (gradeData.id) {
        const criterionGradesData = criteria.map((c) => ({
          criterion_id: c.id,
          score: parseFloat(studentScores[c.id] ?? '0') || 0,
        }))

        await fetch('/api/grades/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grade_id: gradeData.id, criterion_grades: criterionGradesData }),
        })

        setSaved((prev) => new Set<string>([...Array.from(prev), studentId]))
        onSave(
          [gradeData],
          criteria.map((c, i) => ({
            id: '',
            grade_id: gradeData.id,
            criterion_id: c.id,
            score: criterionGradesData[i].score,
            created_at: '',
          }))
        )
      }
      return true
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function saveAll() {
    setSaving(true)
    for (const student of students) {
      await saveCurrentStudent(student.id)
    }
    setSaving(false)
    onClose()
  }

  if (criteria.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Sin criterios definidos</h2>
          <p className="text-gray-600 mb-6">Primero define los criterios de evaluación para esta columna sumativa.</p>
          <button onClick={onClose} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex">
      {/* Left: student list */}
      <div className="w-72 bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-white font-bold text-lg">{column.name}</h2>
          <p className="text-gray-400 text-sm mt-1">Calificación por criterios</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {students.map((s, idx) => {
            const total = getTotal(s.id)
            const isCurrent = idx === currentStudentIdx
            const isDone = saved.has(s.id)
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStudentIdx(idx)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                  isCurrent ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <span className="text-sm truncate flex-1">{s.name}</span>
                <span className={`text-sm font-bold ml-2 ${isCurrent ? 'text-white' : total > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                  {total > 0 ? total.toFixed(1) : isDone ? '✓' : '—'}
                </span>
              </button>
            )
          })}
        </div>
        <div className="p-4 border-t border-gray-700 space-y-2">
          <button
            onClick={() => {
              const invalidIdx = getFirstInvalidCriterionIdx()
              if (invalidIdx !== -1) {
                inputRefs.current[invalidIdx]?.focus()
                inputRefs.current[invalidIdx]?.select()
                return
              }
              saveCurrentStudent(currentStudent.id)
            }}
            disabled={saving}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? 'Guardando...' : 'Guardar estudiante (Enter)'}
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            Guardar todos y cerrar
          </button>
          <button onClick={onClose} className="w-full text-gray-400 hover:text-white text-sm py-1">
            Cancelar (Esc)
          </button>
        </div>
      </div>

      {/* Right: criteria grading panel */}
      <div className="flex-1 flex flex-col bg-white">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{currentStudent?.name}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {currentStudentIdx + 1} de {students.length}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-700">
              {getTotal(currentStudent?.id ?? '').toFixed(1)}
            </div>
            <div className="text-sm text-gray-500">/ 10.0</div>
          </div>
        </div>

        {column.description && (
          <div className="mx-6 mt-4 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
            {column.description}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {criteria.map((criterion, idx) => {
            const val = scores[currentStudent?.id]?.[criterion.id] ?? ''
            const num = parseFloat(val)
            const isOver = !isNaN(num) && num > criterion.max_score
            const isInvalid = !isNaN(num) && (num < 0 || num > criterion.max_score)

            return (
              <div key={criterion.id} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-medium text-gray-800">{criterion.name}</label>
                  <span className="text-sm text-gray-500">Máx. {criterion.max_score}</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    ref={(el) => { inputRefs.current[idx] = el }}
                    type="number"
                    min={0}
                    max={criterion.max_score}
                    step={0.5}
                    value={val}
                    onChange={(e) => handleChange(idx, e.target.value, criterion)}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    className={`w-24 text-center text-xl font-bold border-2 rounded-xl py-3 focus:outline-none focus:ring-2 transition-colors ${
                      isInvalid
                        ? 'border-red-400 bg-red-50 focus:ring-red-300 text-red-700'
                        : 'border-gray-300 focus:ring-blue-300 focus:border-blue-400'
                    }`}
                    placeholder="0"
                  />
                  <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${isOver ? 'bg-red-400' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(100, (num / criterion.max_score) * 100) || 0}%` }}
                    />
                  </div>
                  {isOver && <span className="text-red-600 text-sm font-medium">¡Excede máx!</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => currentStudentIdx > 0 && setCurrentStudentIdx((i) => i - 1)}
            disabled={currentStudentIdx === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 text-sm"
          >
            ← Anterior
          </button>
          <button
            onClick={() => saveCurrentStudent(currentStudent.id).then((ok) => {
              if (ok && currentStudentIdx < students.length - 1) setCurrentStudentIdx((i) => i + 1)
            })}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            Guardar y siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}
