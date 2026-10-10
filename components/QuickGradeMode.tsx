'use client'

import { useState, useEffect, useRef } from 'react'
import type { GradeColumn, Criterion, CriterionLevel, Student, Grade, CriterionGrade } from '@/lib/types'

export interface ColumnSession {
  column: GradeColumn
  criteria: Criterion[]
}

interface Props {
  sessions: ColumnSession[]
  students: Student[]
  grades: Grade[]
  criterionGrades: CriterionGrade[]
  initialStudentId?: string
  onClose: () => void
  onSave: (grades: Grade[], criterionGrades: CriterionGrade[]) => void
}

// studentId -> columnId -> criterionId -> value
interface StudentScores {
  [studentId: string]: { [columnId: string]: { [criterionId: string]: string } }
}

export default function QuickGradeMode({ sessions, students, grades, criterionGrades, initialStudentId, onClose, onSave }: Props) {
  const [currentStudentIdx, setCurrentStudentIdx] = useState(() => {
    if (!initialStudentId) return 0
    const idx = students.findIndex((s) => s.id === initialStudentId)
    return idx >= 0 ? idx : 0
  })
  const [scores, setScores] = useState<StudentScores>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const criterionRefs = useRef<(HTMLDivElement | null)[]>([])
  const scoresRef = useRef<StudentScores>({})

  const [activeCriterionIdx, setActiveCriterionIdx] = useState(0)
  const [activeSessionIdx, setActiveSessionIdx] = useState(0)
  const [hoveredLevelIdx, setHoveredLevelIdx] = useState(0)
  const [inRangeMode, setInRangeMode] = useState(false)
  const [rangeStepIdx, setRangeStepIdx] = useState(0)

  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})

  const activeSession = sessions[activeSessionIdx] ?? sessions[0]
  const activeCriteria = activeSession?.criteria ?? []

  useEffect(() => {
    criterionRefs.current[activeCriterionIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeCriterionIdx])

  useEffect(() => {
    const initial: StudentScores = {}
    for (const student of students) {
      initial[student.id] = {}
      for (const session of sessions) {
        initial[student.id][session.column.id] = {}
        const grade = grades.find((g) => g.student_id === student.id && g.column_id === session.column.id)
        if (grade) {
          for (const criterion of session.criteria) {
            const cg = criterionGrades.find((cg) => cg.grade_id === grade.id && cg.criterion_id === criterion.id)
            initial[student.id][session.column.id][criterion.id] = cg ? cg.score.toString() : ''
          }
        } else {
          for (const criterion of session.criteria) {
            initial[student.id][session.column.id][criterion.id] = ''
          }
        }
      }
    }
    setScores(initial)
    scoresRef.current = initial
  }, [])

  useEffect(() => {
    setActiveCriterionIdx(0)
    setActiveSessionIdx(0)
    setHoveredLevelIdx(0)
    setInRangeMode(false)
    const firstCriteria = sessions[0]?.criteria ?? []
    if (firstCriteria[0]?.levels?.length) {
      setTimeout(() => panelRef.current?.focus(), 50)
    } else {
      setTimeout(() => inputRefs.current[0]?.focus(), 50)
    }
  }, [currentStudentIdx])

  const currentStudent = students[currentStudentIdx]

  function parseLevelPoints(points: number | string): number[] {
    if (typeof points === 'number') return [points]
    const parts = String(points).split('-').map(Number)
    if (parts.length !== 2 || parts.some(isNaN)) return []
    const [min, max] = parts
    const steps: number[] = []
    for (let v = min; v <= max + 0.001; v += 0.5) steps.push(Math.round(v * 10) / 10)
    return steps
  }

  function isLevelSelected(level: CriterionLevel, val: string): boolean {
    const num = parseFloat(val)
    if (isNaN(num)) return false
    return parseLevelPoints(level.points).includes(num)
  }

  function getTotal(studentId: string, columnId: string, src?: StudentScores): number {
    const s = src ?? scores
    const colScores = s[studentId]?.[columnId] ?? {}
    const session = sessions.find(sess => sess.column.id === columnId)
    if (!session) return 0
    return session.criteria.reduce((sum, c) => {
      const v = parseFloat(colScores[c.id] ?? '0')
      return sum + (isNaN(v) ? 0 : v)
    }, 0)
  }

  function getActiveTotal(studentId: string): number {
    return getTotal(studentId, activeSession.column.id)
  }

  function handleChange(criterionIdx: number, value: string, criterion: Criterion) {
    const studentId = currentStudent.id
    const columnId = activeSession.column.id
    const updated: StudentScores = {
      ...scoresRef.current,
      [studentId]: {
        ...scoresRef.current[studentId],
        [columnId]: {
          ...scoresRef.current[studentId]?.[columnId],
          [criterion.id]: value,
        },
      },
    }
    scoresRef.current = updated
    setScores(updated)
  }

  function composeFeedback(studentId: string): string {
    const lines: string[] = []
    for (const session of sessions) {
      const colScores = scoresRef.current[studentId]?.[session.column.id] ?? {}
      for (const c of session.criteria) {
        if (!c.levels?.length) continue
        const val = colScores[c.id] ?? ''
        const num = parseFloat(val)
        const selected = c.levels!.find((l) => isLevelSelected(l, val))
        if (!selected) continue
        lines.push(`• ${c.name} (${isNaN(num) ? '—' : num}/${c.max_score} — ${selected.label}): ${selected.description}.`)
      }
    }
    return lines.join('\n')
  }

  function switchToSession(sessionIdx: number, criterionIdx = 0) {
    setActiveSessionIdx(sessionIdx)
    setActiveCriterionIdx(criterionIdx)
    setHoveredLevelIdx(0)
    setInRangeMode(false)
    const nextSession = sessions[sessionIdx]
    if (!nextSession) return
    if (!nextSession.criteria[criterionIdx]?.levels?.length) {
      setTimeout(() => inputRefs.current[criterionIdx]?.focus(), 50)
    } else {
      setTimeout(() => panelRef.current?.focus(), 50)
    }
  }

  function advanceCriterion(fromIdx: number) {
    const nextIdx = fromIdx + 1
    if (nextIdx < activeCriteria.length) {
      setActiveCriterionIdx(nextIdx)
      setHoveredLevelIdx(0)
      setInRangeMode(false)
      if (!activeCriteria[nextIdx].levels?.length) {
        setTimeout(() => inputRefs.current[nextIdx]?.focus(), 0)
      } else {
        panelRef.current?.focus()
      }
    } else {
      const nextSessionIdx = activeSessionIdx + 1
      if (nextSessionIdx < sessions.length) {
        switchToSession(nextSessionIdx, 0)
      } else {
        saveCurrentStudent(currentStudent.id).then((ok) => {
          if (ok && currentStudentIdx < students.length - 1) {
            setCurrentStudentIdx((i) => i + 1)
          }
        })
      }
    }
  }

  function handlePanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }

    const criterion = activeCriteria[activeCriterionIdx]
    if (!criterion) return

    if (!criterion.levels?.length) {
      inputRefs.current[activeCriterionIdx]?.focus()
      return
    }

    if (inRangeMode) {
      const level = criterion.levels[hoveredLevelIdx]
      const steps = parseLevelPoints(level.points)
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = Math.min(rangeStepIdx + 1, steps.length - 1)
        setRangeStepIdx(next)
        handleChange(activeCriterionIdx, String(steps[next]), criterion)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = Math.max(rangeStepIdx - 1, 0)
        setRangeStepIdx(prev)
        handleChange(activeCriterionIdx, String(steps[prev]), criterion)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setInRangeMode(false)
        advanceCriterion(activeCriterionIdx)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHoveredLevelIdx((i) => Math.min(i + 1, criterion.levels!.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHoveredLevelIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const level = criterion.levels[hoveredLevelIdx]
      const steps = parseLevelPoints(level.points)
      if (steps.length > 1) {
        handleChange(activeCriterionIdx, String(steps[0]), criterion)
        setRangeStepIdx(0)
        setInRangeMode(true)
      } else {
        handleChange(activeCriterionIdx, String(steps[0]), criterion)
        advanceCriterion(activeCriterionIdx)
      }
    }
  }

  function getFirstInvalidCriterionIdx(): number {
    const columnId = activeSession.column.id
    const studentScores = scoresRef.current[currentStudent?.id]?.[columnId] ?? {}
    return activeCriteria.findIndex((c) => {
      const v = parseFloat(studentScores[c.id] ?? '0')
      return !isNaN(v) && v > c.max_score
    })
  }

  function handleKeyDown(e: React.KeyboardEvent, criterionIdx: number) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const nextCritIdx = criterionIdx + 1
      if (nextCritIdx < activeCriteria.length) {
        if (activeCriteria[nextCritIdx].levels?.length) {
          setActiveCriterionIdx(nextCritIdx)
          setHoveredLevelIdx(0)
          setInRangeMode(false)
          setTimeout(() => panelRef.current?.focus(), 0)
        } else {
          inputRefs.current[nextCritIdx]?.focus()
        }
      } else {
        const invalidIdx = getFirstInvalidCriterionIdx()
        if (invalidIdx !== -1) {
          inputRefs.current[invalidIdx]?.focus()
          inputRefs.current[invalidIdx]?.select()
          return
        }
        advanceCriterion(criterionIdx)
      }
    }
    if (e.key === 'Escape') onClose()
  }

  async function saveCurrentStudent(studentId: string): Promise<boolean> {
    setSaving(true)
    const allSavedGrades: Grade[] = []
    const allSavedCriterionGrades: CriterionGrade[] = []

    try {
      for (const session of sessions) {
        const { column, criteria: sessionCriteria } = session
        const studentScores = scoresRef.current[studentId]?.[column.id] ?? {}

        // Skip sessions where the user never entered any score (all empty strings)
        // to avoid overwriting grades that were entered via other methods
        const hasAnyInput = sessionCriteria.some((c) => studentScores[c.id] !== '' && studentScores[c.id] !== undefined)
        if (!hasAnyInput) continue

        const invalidIdx = sessionCriteria.findIndex((c) => {
          const v = parseFloat(studentScores[c.id] ?? '0')
          return !isNaN(v) && v > c.max_score
        })
        if (invalidIdx !== -1) {
          const sessionIdx = sessions.indexOf(session)
          switchToSession(sessionIdx, invalidIdx)
          setTimeout(() => {
            inputRefs.current[invalidIdx]?.focus()
            inputRefs.current[invalidIdx]?.select()
          }, 100)
          setSaving(false)
          return false
        }

        const total = sessionCriteria.reduce((sum, c) => {
          const v = parseFloat(studentScores[c.id] ?? '0')
          return sum + (isNaN(v) ? 0 : v)
        }, 0)

        const gradeRes = await fetch('/api/grades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: studentId, column_id: column.id, score: Math.max(1, total) }),
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
          const criterionGradesData = sessionCriteria.map((c) => ({
            criterion_id: c.id,
            score: parseFloat(studentScores[c.id] ?? '0') || 0,
          }))

          await fetch('/api/grades/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grade_id: gradeData.id, criterion_grades: criterionGradesData }),
          })

          allSavedGrades.push(gradeData)
          allSavedCriterionGrades.push(
            ...sessionCriteria.map((c, i) => ({
              id: '',
              grade_id: gradeData.id,
              criterion_id: c.id,
              score: criterionGradesData[i].score,
              created_at: '',
            }))
          )
        }
      }

      setSaved((prev) => new Set<string>([...Array.from(prev), studentId]))

      const fb = composeFeedback(studentId)
      if (fb) setFeedbacks((prev) => ({ ...prev, [studentId]: fb }))

      onSave(allSavedGrades, allSavedCriterionGrades)
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

  const allCriteriaCount = sessions.reduce((sum, s) => sum + s.criteria.length, 0)

  if (allCriteriaCount === 0) {
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

  const hasLevelsCriteria = sessions.some((s) => s.criteria.some((c) => c.levels?.length))

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex">
      {/* Left: student list */}
      <div className="w-72 bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-white font-bold text-lg">
            {sessions.length === 1 ? sessions[0].column.name : `${sessions.length} actividades`}
          </h2>
          <p className="text-gray-400 text-sm mt-1">Calificación por criterios</p>
          {hasLevelsCriteria && (
            <p className="text-gray-500 text-xs mt-1">↑↓ navegar niveles · Enter confirmar</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {students.map((s, idx) => {
            const totals = sessions.map(sess => getTotal(s.id, sess.column.id))
            const anyScore = sessions.some(sess =>
              Object.values(scores[s.id]?.[sess.column.id] ?? {}).some(v => v !== '')
            )
            const allZero = anyScore && totals.every(t => t === 0)
            const isCurrent = idx === currentStudentIdx
            const isDone = saved.has(s.id)
            const displayScore = sessions.length === 1
              ? (totals[0] > 0 ? totals[0].toFixed(1) : allZero ? '0.0' : isDone ? '✓' : '—')
              : totals.some(t => t > 0)
              ? totals.map(t => t > 0 ? t.toFixed(1) : '—').join(' / ')
              : isDone ? '✓' : '—'

            return (
              <button
                key={s.id}
                onClick={() => setCurrentStudentIdx(idx)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                  isCurrent
                    ? 'bg-blue-600 text-white'
                    : allZero
                    ? 'bg-red-900/30 text-gray-200 hover:bg-red-900/50'
                    : anyScore
                    ? 'bg-emerald-900/40 text-gray-200 hover:bg-emerald-900/60'
                    : 'text-gray-400 hover:bg-gray-700'
                }`}
              >
                <span className="text-sm truncate flex-1">{s.name}</span>
                <span className={`text-sm font-bold ml-2 ${isCurrent ? 'text-white' : allZero ? 'text-red-400' : anyScore ? 'text-green-400' : 'text-gray-500'}`}>
                  {displayScore}
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
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
        className="flex-1 flex flex-col bg-white outline-none"
      >
        <div className="p-6 border-b border-gray-200">
          {/* Session tabs — only shown when there are multiple sessions */}
          {sessions.length > 1 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {sessions.map((session, idx) => {
                const total = getTotal(currentStudent?.id ?? '', session.column.id)
                const hasAny = Object.values(scores[currentStudent?.id]?.[session.column.id] ?? {}).some(v => v !== '')
                const isActive = idx === activeSessionIdx
                return (
                  <button
                    key={session.column.id}
                    onClick={() => switchToSession(idx)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                      isActive
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : hasAny
                        ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {session.column.name}
                    {hasAny && !isActive && <span className="ml-1 text-xs opacity-75">({total.toFixed(1)})</span>}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">{currentStudent?.name}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {currentStudentIdx + 1} de {students.length}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-700">
                {getActiveTotal(currentStudent?.id ?? '').toFixed(1)}
              </div>
              <div className="text-sm text-gray-500">/ {activeSession.column.name}</div>
            </div>
          </div>
        </div>

        {activeSession.column.description && (
          <div className="mx-6 mt-4 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
            {activeSession.column.description}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeCriteria.map((criterion, idx) => {
            const columnId = activeSession.column.id
            const val = scores[currentStudent?.id]?.[columnId]?.[criterion.id] ?? ''
            const num = parseFloat(val)
            const hasLevels = !!(criterion.levels?.length)
            const isActive = activeCriterionIdx === idx

            if (hasLevels) {
              return (
                <div
                  key={`${columnId}-${criterion.id}`}
                  ref={(el) => { criterionRefs.current[idx] = el }}
                  className={`rounded-xl p-4 border-2 transition-colors cursor-default ${
                    isActive ? 'border-blue-400 bg-blue-50/30' : 'border-transparent bg-gray-50'
                  }`}
                  onClick={() => {
                    setActiveCriterionIdx(idx)
                    setHoveredLevelIdx(0)
                    setInRangeMode(false)
                    panelRef.current?.focus()
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-medium text-gray-800">{criterion.name}</label>
                    <div className="flex items-center gap-2">
                      {isActive && !inRangeMode && (
                        <span className="text-xs text-blue-500 font-medium">↑↓ · Enter</span>
                      )}
                      {isActive && inRangeMode && (
                        <span className="text-xs text-amber-600 font-medium">←→ valor exacto · Enter</span>
                      )}
                      <span className="text-sm text-gray-500">
                        {isNaN(num) ? '—' : num} / {criterion.max_score} pts
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {criterion.levels!.map((level, levelIdx) => {
                      const selected = isLevelSelected(level, val)
                      const hovered = isActive && !inRangeMode && hoveredLevelIdx === levelIdx
                      const steps = parseLevelPoints(level.points)
                      const isRange = steps.length > 1

                      return (
                        <div key={levelIdx}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveCriterionIdx(idx)
                              setHoveredLevelIdx(levelIdx)
                              if (isRange) {
                                handleChange(idx, String(steps[0]), criterion)
                                setRangeStepIdx(0)
                                setInRangeMode(true)
                              } else {
                                handleChange(idx, String(steps[0]), criterion)
                                setInRangeMode(false)
                              }
                              panelRef.current?.focus()
                            }}
                            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                              selected && hovered
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-amber-400'
                                : selected
                                ? 'border-blue-500 bg-blue-50'
                                : hovered
                                ? 'border-amber-400 bg-amber-50'
                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <span className={`font-semibold text-sm ${selected || hovered ? 'text-gray-900' : 'text-gray-700'}`}>
                                  {level.label}
                                </span>
                                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{level.description}</p>
                              </div>
                              <span className={`font-bold text-sm whitespace-nowrap mt-0.5 ${
                                selected ? 'text-blue-700' : hovered ? 'text-amber-700' : 'text-gray-400'
                              }`}>
                                {level.points} pts
                              </span>
                            </div>
                          </button>

                          {isRange && selected && (
                            <div className="flex items-center gap-1.5 mt-1.5 ml-4">
                              <span className="text-xs text-gray-500">Exacto:</span>
                              {steps.map((v) => (
                                <button
                                  key={v}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleChange(idx, String(v), criterion)
                                    panelRef.current?.focus()
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-sm font-bold border-2 transition-colors ${
                                    num === v
                                      ? 'border-blue-500 bg-blue-100 text-blue-700'
                                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                  }`}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }

            // Simple numeric input (criteria without levels)
            const isOver = !isNaN(num) && num > criterion.max_score
            const isInvalid = !isNaN(num) && (num < 0 || num > criterion.max_score)

            return (
              <div
                key={`${columnId}-${criterion.id}`}
                ref={(el) => { criterionRefs.current[idx] = el }}
                className={`rounded-xl p-4 border-2 transition-colors ${
                  isActive ? 'border-blue-300 bg-blue-50/20' : 'border-transparent bg-gray-50'
                }`}
              >
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
                    onChange={(e) => {
                      setActiveCriterionIdx(idx)
                      handleChange(idx, e.target.value, criterion)
                    }}
                    onFocus={() => setActiveCriterionIdx(idx)}
                    onSelect={(e) => (e.target as HTMLInputElement).select()}
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

          {feedbacks[currentStudent?.id] && (
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Retroalimentación</span>
                <button
                  onClick={() => navigator.clipboard.writeText(feedbacks[currentStudent.id])}
                  className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-0.5"
                >
                  Copiar
                </button>
              </div>
              <textarea
                value={feedbacks[currentStudent.id]}
                onChange={(e) => setFeedbacks((prev) => ({ ...prev, [currentStudent.id]: e.target.value }))}
                rows={sessions.reduce((sum, s) => sum + s.criteria.filter((c) => c.levels?.length).length, 0) + 1}
                className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none leading-relaxed"
              />
            </div>
          )}
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
