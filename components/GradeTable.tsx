'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import * as XLSX from 'xlsx'
import type { Course, Period, Student, GradeColumn, Criterion, Grade, CriterionGrade, ColorRange, PeriodCompetency } from '@/lib/types'
import type { CompetencyKey } from '@/lib/competencies'
import { COMPETENCIES } from '@/lib/competencies'
import {
  computePeriodFinalFromCompetencies,
  computeCompetencyGrade,
  getStudentScore,
  getColorForGrade,
} from '@/lib/calculations'
import QuickGradeMode from './QuickGradeMode'
import ColumnModal from './ColumnModal'
import ReportModal from './ReportModal'
import ColorRangeConfig from './ColorRangeConfig'
import GroupsPanel from './GroupsPanel'
import GroupGradeModal from './GroupGradeModal'
import MoveStudentModal from './MoveStudentModal'

interface Group {
  id: string
  name: string
  course_id: string
  work_group_members: { student_id: string }[]
}

interface GradeTableProps {
  course: Course
  period: Period
  students: Student[]
  initialGroups: Group[]
  onArchiveStudent: (id: string, name: string) => void
}

export default function GradeTable({ course, period, students, initialGroups, onArchiveStudent }: GradeTableProps) {
  const [periodCompetencies, setPeriodCompetencies] = useState<PeriodCompetency[]>([])
  const [columns, setColumns] = useState<GradeColumn[]>([])
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [criterionGrades, setCriterionGrades] = useState<CriterionGrade[]>([])
  const [colorRanges, setColorRanges] = useState<ColorRange[]>([])
  const [loading, setLoading] = useState(true)

  const [quickGradeCol, setQuickGradeCol] = useState<GradeColumn | null>(null)
  const [columnModal, setColumnModal] = useState<{ competencyKey?: CompetencyKey; column?: GradeColumn; type?: string } | null>(null)
  const [reportStudent, setReportStudent] = useState<Student | null>(null)
  const [showColorConfig, setShowColorConfig] = useState(false)
  const [showGroupsPanel, setShowGroupsPanel] = useState(false)
  const [moveStudent, setMoveStudent] = useState<Student | null>(null)
  const [addingStudentInline, setAddingStudentInline] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [groupGradeCol, setGroupGradeCol] = useState<GradeColumn | null>(null)
  const headerRow1Ref = useRef<HTMLTableRowElement>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortByGrade, setSortByGrade] = useState<'asc' | 'desc' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const [weights, setWeights] = useState(period.grade_weights ?? course.grade_weights ?? { formativa: 40, sumativa: 60 })
  const [bonusCap, setBonusCap] = useState(period.bonus_cap ?? course.bonus_cap ?? 10)
  const [localStudents, setLocalStudents] = useState(students)
  const [archivedStudents, setArchivedStudents] = useState<Student[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)

  useEffect(() => { setLocalStudents(students) }, [students])

  useEffect(() => {
    if (!headerRow1Ref.current) return
    const h = headerRow1Ref.current.getBoundingClientRect().height
    document.documentElement.style.setProperty('--grade-header-row1-height', `${h}px`)
  }, [periodCompetencies])

  async function loadArchived() {
    setLoadingArchived(true)
    try {
      const res = await fetch(`/api/students/archived?courseId=${course.id}`)
      const data = await res.json()
      setArchivedStudents(data)
    } catch {
      // silently fail
    } finally {
      setLoadingArchived(false)
    }
  }

  async function reactivateStudent(student: Student) {
    try {
      const res = await fetch(`/api/students/${student.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: false, archived_at: null, archive_reason: null }),
      })
      if (!res.ok) { alert('Error al reactivar la estudiante.'); return }
      setArchivedStudents((prev) => prev.filter((s) => s.id !== student.id))
      setLocalStudents((prev) => [...prev, { ...student, is_archived: false }].sort((a, b) => a.sort_order - b.sort_order))
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    }
  }

  async function deleteStudentPermanently(student: Student) {
    if (!confirm(`¿Eliminar PERMANENTEMENTE a "${student.name}"?\n\nEsta acción borra todas sus notas, asistencia e informes y NO se puede deshacer.`)) return
    try {
      const res = await fetch(`/api/students/${student.id}/permanent`, { method: 'DELETE' })
      if (!res.ok) { alert('Error al eliminar la estudiante.'); return }
      setArchivedStudents((prev) => prev.filter((s) => s.id !== student.id))
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    }
  }

  async function addStudentInline() {
    if (!newStudentName.trim()) return
    const formatted = newStudentName.trim().toUpperCase()
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: course.id, name: formatted }),
      })
      if (res.redirected || res.url.includes('/login')) {
        alert('Tu sesión expiró. Recarga la página e inicia sesión de nuevo.')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert('Error al agregar la estudiante: ' + (data.error ?? 'Error desconocido'))
        return
      }
      const data = await res.json()
      if (data.id) {
        setLocalStudents((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order))
        setNewStudentName('')
        setAddingStudentInline(false)
      }
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    }
  }

  useEffect(() => { loadData() }, [period.id, course.id])

  async function loadData() {
    setLoading(true)
    try {
      const [pcRes, columnsRes, gradesRes, cgRes, crRes, colorRes] = await Promise.all([
        fetch(`/api/period-competencies?periodId=${period.id}`).then((r) => r.json()),
        fetch(`/api/columns?periodId=${period.id}`).then((r) => r.json()),
        fetch(`/api/grades?periodId=${period.id}`).then((r) => r.json()),
        fetch(`/api/criterion-grades?periodId=${period.id}`).then((r) => r.json()),
        fetch(`/api/criteria?periodId=${period.id}`).then((r) => r.json()),
        fetch(`/api/color-ranges?courseId=${course.id}`).then((r) => r.json()),
      ])
      setPeriodCompetencies(pcRes)
      setColumns(columnsRes)
      setGrades(gradesRes)
      setCriterionGrades(cgRes)
      setCriteria(crRes)
      setColorRanges(colorRes)
    } catch {
      alert('Error al cargar la tabla de notas. Verifica tu conexión e intenta recargar la página.')
    } finally {
      setLoading(false)
    }
  }

  const saveGrade = useCallback(async (studentId: string, columnId: string, score: number | null) => {
    if (score === null) {
      try {
        const res = await fetch('/api/grades', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: studentId, column_id: columnId }),
        })
        if (!res.ok) { console.error('Grade delete failed', res.status); return }
        setGrades((prev) => prev.filter((g) => !(g.student_id === studentId && g.column_id === columnId)))
      } catch {
        console.error('Grade delete network error')
      }
      return
    }
    try {
      const res = await fetch('/api/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, column_id: columnId, score }),
      })
      if (!res.ok) { console.error('Grade save failed', res.status); return }
      const data = await res.json()
      if (data.id) {
        setGrades((prev) => {
          const existing = prev.find((g) => g.student_id === studentId && g.column_id === columnId)
          if (existing) return prev.map((g) => (g.id === existing.id ? data : g))
          return [...prev, data]
        })
        setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, has_grades: true } : c)))
      }
    } catch {
      console.error('Grade save network error')
    }
  }, [])

  async function deleteColumn(col: GradeColumn) {
    if (!confirm(`¿Eliminar la evaluación "${col.name}"? ${col.has_grades ? 'ADVERTENCIA: tiene notas registradas que se perderán.' : ''}`)) return
    try {
      const res = await fetch(`/api/columns/${col.id}`, { method: 'DELETE' })
      if (!res.ok) { alert('Error al eliminar la evaluación.'); return }
      setColumns((prev) => prev.filter((c) => c.id !== col.id))
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    }
  }

  async function updateCompetencyWeight(pc: PeriodCompetency, manualWeight: number | null) {
    try {
      const res = await fetch(`/api/period-competencies/${pc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual_weight: manualWeight }),
      })
      if (!res.ok) { alert('Error al guardar el peso.'); return }
      setPeriodCompetencies((prev) =>
        prev.map((p) => p.id === pc.id ? { ...p, manual_weight: manualWeight } : p)
      )
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    }
  }

  function onColumnSaved(column: GradeColumn, newCriteria?: Criterion[]) {
    const exists = columns.find((c) => c.id === column.id)
    if (exists) {
      setColumns((prev) => prev.map((c) => (c.id === column.id ? column : c)))
    } else {
      setColumns((prev) => [...prev, column])
    }
    if (newCriteria) {
      setCriteria((prev) => [...prev.filter((c) => c.column_id !== column.id), ...newCriteria])
    }
    setColumnModal(null)
  }

  function onQuickGradeSaved(savedGrades: Grade[], savedCriterionGrades: CriterionGrade[]) {
    setGrades((prev) => {
      let updated = [...prev]
      for (const g of savedGrades) {
        const idx = updated.findIndex((x) => x.student_id === g.student_id && x.column_id === g.column_id)
        if (idx >= 0) updated[idx] = g
        else updated.push(g)
      }
      return updated
    })
    setCriterionGrades((prev) => {
      let updated = [...prev]
      for (const cg of savedCriterionGrades) {
        const idx = updated.findIndex((x) => x.grade_id === cg.grade_id && x.criterion_id === cg.criterion_id)
        if (idx >= 0) updated[idx] = cg
        else updated.push(cg)
      }
      return updated
    })
    if (quickGradeCol) {
      setColumns((prev) => prev.map((c) => (c.id === quickGradeCol.id ? { ...c, has_grades: true } : c)))
    }
  }

  const bonusColumns = columns.filter((c) => c.type === 'bonus' && !c.competency_key)

  const filteredStudents = localStudents
    .filter((s) => !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()))

  const studentsWithGrades = filteredStudents.map((s) => ({
    ...s,
    finalGrade: computePeriodFinalFromCompetencies(s.id, periodCompetencies, columns, grades, criterionGrades, weights, bonusCap),
  }))

  const sortedStudents = sortByGrade
    ? [...studentsWithGrades].sort((a, b) => {
        const aG = a.finalGrade ?? -1
        const bG = b.finalGrade ?? -1
        return sortByGrade === 'asc' ? aG - bG : bG - aG
      })
    : studentsWithGrades

  const atRisk = sortedStudents.filter((s) => s.finalGrade !== null && s.finalGrade < 6.5)

  function exportColumn(col: GradeColumn) {
    const header = ['Estudiante', col.name]
    const rows = localStudents.map((student) => {
      const score = getStudentScore(student.id, col, grades, criterionGrades)
      return [student.name, score !== null ? score : '']
    })
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [{ wch: 32 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Notas')
    XLSX.writeFile(wb, `${col.name} - ${course.name}.xlsx`)
  }

  // Auto-weights for display
  function getCompetencyWeight(pc: PeriodCompetency): number {
    if (pc.manual_weight !== null && pc.manual_weight !== undefined) return Number(pc.manual_weight)
    return Math.max(columns.filter(c => c.competency_key === pc.competency_key && c.type === 'sumativa').length, 1)
  }
  const totalAutoWeight = periodCompetencies.reduce((s, pc) => s + getCompetencyWeight(pc), 0)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400">Cargando tabla de notas...</div>
      </div>
    )
  }

  if (periodCompetencies.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium text-gray-600">Este trimestre no tiene competencias configuradas.</p>
          <p className="text-sm mt-1">Elimina el trimestre y créalo de nuevo con el archivo de competencias.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Controls bar */}
      <div className="flex items-center gap-2 py-2 flex-wrap bg-gray-50 border-b border-gray-200 px-1">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar estudiante..."
          className="border rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          onClick={() => setSortByGrade(sortByGrade === 'asc' ? 'desc' : sortByGrade === 'desc' ? null : 'asc')}
          className={`text-sm px-3 py-1.5 border rounded-lg transition-colors ${sortByGrade ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
        >
          {sortByGrade === 'asc' ? '↑ Nota' : sortByGrade === 'desc' ? '↓ Nota' : 'Ord. por nota'}
        </button>

        <button
          onClick={() => setShowColorConfig(true)}
          className="text-sm px-3 py-1.5 border border-gray-300 bg-white rounded-lg hover:bg-gray-50"
        >
          Semáforo
        </button>

        <button
          onClick={() => setShowGroupsPanel(true)}
          className="text-sm px-3 py-1.5 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 flex items-center gap-1"
        >
          👥 Grupos {groups.length > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 rounded-full">{groups.length}</span>}
        </button>

        {atRisk.length > 0 && (
          <span className="text-sm px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {atRisk.length} en riesgo
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <WeightsEditor
            weights={weights}
            bonusCap={bonusCap}
            onSave={async (w, bc) => {
              try {
                const res = await fetch(`/api/periods/${period.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ grade_weights: w, bonus_cap: bc }),
                })
                if (!res.ok) { alert('Error al guardar las ponderaciones.'); return }
                setWeights(w)
                setBonusCap(bc)
              } catch {
                alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
              }
            }}
          />
        </div>
      </div>

      {/* Main table */}
      <div className="grade-table-wrapper scrollbar-thin flex-1">
        <table className="grade-table">
          <thead>
            {/* Competency header row */}
            <tr ref={headerRow1Ref}>
              <th className="col-sticky px-3 py-2 text-left text-xs font-semibold text-gray-600 bg-gray-50 border-r-2 border-gray-200 min-w-48">
                Estudiante
              </th>

              {periodCompetencies.map((pc) => {
                const meta = COMPETENCIES[pc.competency_key as CompetencyKey]
                const pcCols = columns.filter(c => c.competency_key === pc.competency_key)
                const colSpan = Math.max(pcCols.length, 1)
                const weightPct = totalAutoWeight > 0
                  ? Math.round((getCompetencyWeight(pc) / totalAutoWeight) * 100)
                  : 0

                return (
                  <th
                    key={pc.id}
                    colSpan={colSpan + 1} // +1 for the competency grade column
                    className={`px-2 py-2 text-xs font-semibold text-center border-r-2 ${meta.bgColor} ${meta.textColor} ${meta.borderColor}`}
                  >
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <span>{meta.short} — {meta.name}</span>
                      <button
                        onClick={() => setColumnModal({ competencyKey: pc.competency_key as CompetencyKey, type: 'formativa' })}
                        className="opacity-70 hover:opacity-100 text-xs ml-1"
                        title="Agregar evaluación"
                      >
                        +
                      </button>
                      <CopyCompetencyButton
                        periodId={period.id}
                        competencyKey={pc.competency_key}
                        yearId={course.school_year_id}
                        courseId={course.id}
                      />
                      <CompetencyWeightBadge
                        pc={pc}
                        weightPct={weightPct}
                        onSave={(w) => updateCompetencyWeight(pc, w)}
                      />
                    </div>
                    {pc.learning_objective && (
                      <p className="text-xs font-normal opacity-60 mt-0.5 max-w-xs mx-auto">
                        {pc.learning_objective}
                      </p>
                    )}
                  </th>
                )
              })}

              {/* Bonus header */}
              {bonusColumns.length > 0 && (
                <th
                  colSpan={bonusColumns.length}
                  className="px-2 py-2 text-xs font-semibold text-purple-800 bg-purple-50 text-center border-r-2 border-purple-100"
                >
                  Bonus
                </th>
              )}
              <th className="px-2 py-2 text-xs font-semibold text-gray-500 bg-gray-50 text-center">
                <button
                  onClick={() => setColumnModal({ type: 'bonus' })}
                  className="text-purple-500 hover:text-purple-700 text-xs"
                  title="Agregar bonus"
                >
                  + Bonus
                </button>
              </th>

              <th className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 text-center min-w-24">
                Final
              </th>
              <th className="px-2 py-2 text-xs font-semibold text-gray-500 bg-gray-50 text-center min-w-20">
                Informe
              </th>
            </tr>

            {/* Column name row */}
            <tr className="subheader">
              <th className="col-sticky px-3 py-1.5 text-left text-xs text-gray-500 bg-gray-100 border-r-2 border-gray-200"></th>

              {periodCompetencies.map((pc) => {
                const meta = COMPETENCIES[pc.competency_key as CompetencyKey]
                const pcCols = columns.filter(c => c.competency_key === pc.competency_key)

                return (
                  <Fragment key={pc.id}>
                    {pcCols.length === 0 ? (
                      <th className={`px-2 py-1.5 text-center border-r ${meta.bgColor} opacity-50`}>
                        <button
                          onClick={() => setColumnModal({ competencyKey: pc.competency_key as CompetencyKey, type: 'formativa' })}
                          className={`text-xs ${meta.textColor} hover:opacity-100`}
                        >
                          + evaluación
                        </button>
                      </th>
                    ) : (
                      pcCols.map((col) => {
                        const colCriteria = criteria.filter((c) => c.column_id === col.id)
                        return (
                          <ColumnHeader
                            key={col.id}
                            col={col}
                            criteria={colCriteria}
                            hasGroups={groups.length > 0}
                            onEdit={() => setColumnModal({ column: col })}
                            onDelete={() => deleteColumn(col)}
                            onQuickGrade={() => (col.type === 'sumativa' || (col.type === 'formativa' && colCriteria.length > 0)) && setQuickGradeCol(col)}
                            onGroupGrade={() => groups.length > 0 && setGroupGradeCol(col)}
                            onExport={() => exportColumn(col)}
                          />
                        )
                      })
                    )}
                    <th className={`px-2 py-1.5 text-center text-xs font-semibold border-r-2 ${meta.bgColor} ${meta.textColor} ${meta.borderColor}`}>
                      Nota {meta.short}
                    </th>
                  </Fragment>
                )
              })}

              {bonusColumns.map((col) => {
                const colCriteria = criteria.filter((c) => c.column_id === col.id)
                return (
                  <ColumnHeader
                    key={col.id}
                    col={col}
                    criteria={colCriteria}
                    hasGroups={groups.length > 0}
                    onEdit={() => setColumnModal({ column: col })}
                    onDelete={() => deleteColumn(col)}
                    onQuickGrade={() => colCriteria.length > 0 && setQuickGradeCol(col)}
                    onGroupGrade={() => groups.length > 0 && setGroupGradeCol(col)}
                    onExport={() => exportColumn(col)}
                  />
                )
              })}

              <th className="px-2 py-1.5 bg-gray-100"></th>
              <th className="px-3 py-1.5 text-center text-xs text-gray-500 bg-gray-100">
                Form {weights.formativa}% / Sum {weights.sumativa}%
              </th>
              <th className="px-2 py-1.5 bg-gray-100"></th>
            </tr>
          </thead>

          <tbody>
            {sortedStudents.map((student, studentIdx) => {
              const bg = getColorForGrade(student.finalGrade, colorRanges)
              const isRisk = student.finalGrade !== null && student.finalGrade < 6.5
              return (
                <tr
                  key={student.id}
                  style={{ backgroundColor: bg !== 'transparent' ? bg + '55' : undefined }}
                  className="hover:brightness-95 transition-all"
                >
                  <td className="col-sticky px-3 py-1 border-r-2 border-gray-200 bg-white font-medium text-sm whitespace-nowrap">
                    <div className="flex items-center gap-1 group">
                      <span className="flex-1">{student.name}</span>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <button
                          onClick={() => setMoveStudent(student)}
                          className="text-xs text-gray-300 hover:text-blue-500 px-1"
                          title="Mover a otro curso"
                        >
                          ↗
                        </button>
                        <button
                          onClick={() => onArchiveStudent(student.id, student.name)}
                          className="text-xs text-gray-300 hover:text-red-500 px-1"
                          title="Dar de baja"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </td>

                  {periodCompetencies.map((pc) => {
                    const meta = COMPETENCIES[pc.competency_key as CompetencyKey]
                    const pcCols = columns.filter(c => c.competency_key === pc.competency_key)
                    const compGrade = computeCompetencyGrade(
                      student.id, pc.competency_key, columns, grades, criterionGrades, weights, bonusCap
                    )

                    return (
                      <Fragment key={pc.id}>
                        {pcCols.length === 0 ? (
                          <td className="border-r border-gray-200"></td>
                        ) : (
                          pcCols.map((col) => {
                            const colCriteria = criteria.filter((c) => c.column_id === col.id)
                            return (
                              <GradeCell
                                key={col.id}
                                col={col}
                                student={student}
                                studentIdx={studentIdx}
                                grades={grades}
                                criterionGrades={criterionGrades}
                                criteria={colCriteria}
                                onSave={saveGrade}
                                onOpenQuickGrade={() => (col.type === 'sumativa' || (col.type === 'formativa' && colCriteria.length > 0)) && setQuickGradeCol(col)}
                              />
                            )
                          })
                        )}
                        <td className={`px-2 py-1 text-center border-r-2 ${meta.bgColor} ${meta.borderColor}`}>
                          <span className={`text-sm font-bold ${compGrade !== null ? meta.textColor : 'text-gray-300'}`}>
                            {compGrade !== null ? compGrade.toFixed(1) : '—'}
                          </span>
                        </td>
                      </Fragment>
                    )
                  })}

                  {bonusColumns.map((col) => {
                    const colCriteria = criteria.filter((c) => c.column_id === col.id)
                    return (
                      <GradeCell
                        key={col.id}
                        col={col}
                        student={student}
                        studentIdx={studentIdx}
                        grades={grades}
                        criterionGrades={criterionGrades}
                        criteria={colCriteria}
                        onSave={saveGrade}
                        onOpenQuickGrade={() => colCriteria.length > 0 && setQuickGradeCol(col)}
                      />
                    )
                  })}

                  {/* Bonus placeholder */}
                  <td></td>

                  <td className="px-2 py-1 text-center">
                    <span className={`text-sm font-bold ${isRisk ? 'text-red-600' : student.finalGrade !== null ? 'text-gray-800' : 'text-gray-300'}`}>
                      {student.finalGrade !== null ? student.finalGrade.toFixed(1) : '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button
                      onClick={() => setReportStudent(student)}
                      className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
                    >
                      Informe
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add student inline */}
      <div className="border-t border-gray-100 bg-white px-3 py-1.5 flex items-center gap-2">
        {addingStudentInline ? (
          <>
            <input
              autoFocus
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addStudentInline(); if (e.key === 'Escape') setAddingStudentInline(false) }}
              placeholder="Nombre completo de la estudiante"
              className="border rounded-lg px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={addStudentInline} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">Agregar</button>
            <button onClick={() => { setAddingStudentInline(false); setNewStudentName('') }} className="text-sm text-gray-400">Cancelar</button>
          </>
        ) : (
          <button onClick={() => setAddingStudentInline(true)} className="text-sm text-blue-600 hover:text-blue-700">
            + Agregar estudiante manualmente
          </button>
        )}
      </div>

      {/* Archived students */}
      <div className="border-t border-gray-100 bg-white px-3 py-1.5">
        <button
          onClick={() => {
            if (!showArchived) loadArchived()
            setShowArchived(!showArchived)
          }}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          {showArchived ? '▲ Ocultar archivadas' : '▼ Ver estudiantes dadas de baja'}
          {archivedStudents.length > 0 && !showArchived && (
            <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-1.5 rounded-full">{archivedStudents.length}</span>
          )}
        </button>

        {showArchived && (
          <div className="mt-2 space-y-1">
            {loadingArchived ? (
              <p className="text-sm text-gray-400">Cargando...</p>
            ) : archivedStudents.length === 0 ? (
              <p className="text-sm text-gray-400">No hay estudiantes archivadas.</p>
            ) : (
              archivedStudents.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 bg-gray-50 rounded-lg">
                  <span className="flex-1 text-sm text-gray-500">{s.name}</span>
                  <button onClick={() => reactivateStudent(s)} className="text-xs text-blue-600 hover:text-blue-700 hover:underline">Reactivar</button>
                  <button onClick={() => deleteStudentPermanently(s)} className="text-xs text-red-500 hover:text-red-700 hover:underline">Eliminar</button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {quickGradeCol && (
        <QuickGradeMode
          column={quickGradeCol}
          criteria={criteria.filter((c) => c.column_id === quickGradeCol.id)}
          students={students}
          grades={grades}
          criterionGrades={criterionGrades}
          onClose={() => setQuickGradeCol(null)}
          onSave={onQuickGradeSaved}
        />
      )}

      {columnModal !== null && (
        <ColumnModal
          competencyKey={columnModal.competencyKey ?? (columnModal.column?.competency_key as CompetencyKey | undefined)}
          column={columnModal.column}
          defaultType={columnModal.type}
          periodId={period.id}
          course={course}
          onSave={onColumnSaved}
          onClose={() => setColumnModal(null)}
        />
      )}

      {reportStudent && (
        <ReportModal
          student={reportStudent}
          course={course}
          period={period}
          columns={columns}
          phases={[]}
          grades={grades}
          criterionGrades={criterionGrades}
          criteria={criteria}
          students={students}
          onClose={() => setReportStudent(null)}
        />
      )}

      {showColorConfig && (
        <ColorRangeConfig
          courseId={course.id}
          ranges={colorRanges}
          onSave={(updated) => { setColorRanges(updated); setShowColorConfig(false) }}
          onClose={() => setShowColorConfig(false)}
        />
      )}

      {showGroupsPanel && (
        <GroupsPanel
          courseId={course.id}
          students={students}
          groups={groups}
          onGroupsChange={setGroups}
          onClose={() => setShowGroupsPanel(false)}
        />
      )}

      {moveStudent && (
        <MoveStudentModal
          student={moveStudent}
          currentCourseId={course.id}
          yearId={course.school_year_id}
          onMoved={(id) => setLocalStudents((prev) => prev.filter((s) => s.id !== id))}
          onClose={() => setMoveStudent(null)}
        />
      )}

      {groupGradeCol && (
        <GroupGradeModal
          column={groupGradeCol}
          criteria={criteria.filter((c) => c.column_id === groupGradeCol.id)}
          groups={groups}
          students={students}
          grades={grades}
          onSave={(updatedGrades) => {
            setGrades((prev) => {
              let updated = [...prev]
              for (const g of updatedGrades) {
                const idx = updated.findIndex((x) => x.student_id === g.student_id && x.column_id === g.column_id)
                if (idx >= 0) updated[idx] = g
                else updated.push(g)
              }
              return updated
            })
            setColumns((prev) => prev.map((c) => c.id === groupGradeCol.id ? { ...c, has_grades: true } : c))
          }}
          onClose={() => setGroupGradeCol(null)}
        />
      )}
    </div>
  )
}

// ─── Competency Weight Badge ──────────────────────────────────────────────────

function CompetencyWeightBadge({
  pc,
  weightPct,
  onSave,
}: {
  pc: PeriodCompetency
  weightPct: number
  onSave: (w: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(weightPct.toString())
  const isManual = pc.manual_weight !== null && pc.manual_weight !== undefined

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 bg-white/80 rounded px-1" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="number"
          min={1}
          max={99}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-10 text-xs border rounded px-1 py-0.5 text-center"
        />
        <span className="text-xs">%</span>
        <button
          onClick={() => {
            const num = parseInt(value)
            if (!isNaN(num) && num > 0) onSave(num / 100)
            setEditing(false)
          }}
          className="text-xs text-blue-600"
        >✓</button>
        <button onClick={() => { onSave(null); setEditing(false) }} className="text-xs text-gray-400" title="Restablecer automático">↺</button>
      </span>
    )
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setValue(weightPct.toString()); setEditing(true) }}
      className={`text-xs px-1.5 py-0.5 rounded ${isManual ? 'bg-orange-100 text-orange-700' : 'bg-white/60 text-current opacity-70'}`}
      title={isManual ? 'Peso manual — click para editar' : 'Peso automático (por sumativas) — click para ajustar'}
    >
      {weightPct}%{isManual ? ' ✎' : ''}
    </button>
  )
}

// ─── Copy Competency Button ───────────────────────────────────────────────────

function CopyCompetencyButton({
  periodId,
  competencyKey,
  yearId,
  courseId,
}: {
  periodId: string
  competencyKey: string
  yearId: string
  courseId: string
}) {
  const [open, setOpen] = useState(false)
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Record<string, string>>({})
  const [copying, setCopying] = useState<string | null>(null)

  async function openMenu() {
    setLoading(true)
    try {
      const res = await fetch(`/api/courses?yearId=${yearId}`)
      const data = await res.json()
      setCourses((data ?? []).filter((c: { id: string }) => c.id !== courseId))
      setResults({})
      setOpen(true)
    } catch {
      alert('No se pudo cargar la lista de cursos.')
    } finally {
      setLoading(false)
    }
  }

  async function copyTo(targetId: string) {
    setCopying(targetId)
    try {
      const res = await fetch(`/api/courses/${targetId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePeriodId: periodId, competencyKey }),
      })
      const data = await res.json()
      setResults((prev) => ({ ...prev, [targetId]: res.ok ? `✓ ${data.columnsAdded} eval.` : '✗ Error' }))
    } catch {
      setResults((prev) => ({ ...prev, [targetId]: '✗ Sin conexión' }))
    } finally {
      setCopying(null)
    }
  }

  if (!open) {
    return (
      <button
        onClick={openMenu}
        disabled={loading}
        title="Copiar evaluaciones de esta competencia a otro curso"
        className="opacity-60 hover:opacity-100 text-xs px-1"
      >
        {loading ? '…' : '⧉'}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-bold mb-1">Copiar evaluaciones a otro curso</h2>
        <p className="text-xs text-gray-500 mb-3">Solo copia la estructura, no las notas.</p>
        {courses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-3">No hay otros cursos en este año.</p>
        ) : (
          <div className="space-y-2">
            {courses.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700 flex-1">{c.name}</span>
                {results[c.id] ? (
                  <span className={`text-xs font-medium ${results[c.id].startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                    {results[c.id]}
                  </span>
                ) : (
                  <button
                    onClick={() => copyTo(c.id)}
                    disabled={copying === c.id}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {copying === c.id ? '…' : 'Copiar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setOpen(false)} className="mt-4 w-full py-2 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
          Cerrar
        </button>
      </div>
    </div>
  )
}

// ─── Column Header ────────────────────────────────────────────────────────────

function ColumnHeader({
  col,
  criteria,
  hasGroups,
  onEdit,
  onDelete,
  onQuickGrade,
  onGroupGrade,
  onExport,
}: {
  col: GradeColumn
  criteria: Criterion[]
  hasGroups: boolean
  onEdit: () => void
  onDelete: () => void
  onQuickGrade: () => void
  onGroupGrade: () => void
  onExport: () => void
}) {
  const typeColor = col.type === 'formativa' ? 'text-green-700 bg-green-50' :
    col.type === 'sumativa' ? 'text-blue-700 bg-blue-50' : 'text-purple-700 bg-purple-50'

  return (
    <th className={`px-1 py-1.5 text-center border-r border-gray-200 group ${typeColor}`}>
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-1">
          {(col.type === 'sumativa' || criteria.length > 0) ? (
            <button
              onClick={onQuickGrade}
              className="text-xs font-medium hover:underline max-w-24 truncate text-left"
              title={col.description || col.name}
            >
              {col.name}
              {!col.description && <span className="ml-1 text-red-400" title="Falta descripción">⚠</span>}
            </button>
          ) : (
            <span className="text-xs font-medium max-w-20 truncate block" title={col.description || col.name}>
              {col.name}
              {!col.description && <span className="ml-1 text-red-400" title="Falta descripción">⚠</span>}
            </span>
          )}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {hasGroups && (
              <button onClick={onGroupGrade} className="text-gray-400 hover:text-blue-600 text-xs" title="Calificar por grupo">👥</button>
            )}
            <button onClick={onExport} className="text-gray-400 hover:text-green-600 text-xs" title="Exportar notas a Excel">↓</button>
            <button onClick={onEdit} className="text-gray-400 hover:text-blue-600 text-xs" title="Editar">✎</button>
            <button onClick={onDelete} className="text-gray-400 hover:text-red-500 text-xs" title="Eliminar">✕</button>
          </div>
        </div>
        <span className={`text-xs px-1 rounded ${typeColor} opacity-70`}>
          {col.type === 'formativa'
            ? criteria.length > 0 ? `Form. (${criteria.length}crit.)` : 'Form.'
            : col.type === 'sumativa' ? `Sum. (${criteria.length}crit.)` : 'Bonus'}
        </span>
      </div>
    </th>
  )
}

// ─── Grade Cell ───────────────────────────────────────────────────────────────

function GradeCell({
  col,
  student,
  studentIdx,
  grades,
  criterionGrades,
  criteria,
  onSave,
  onOpenQuickGrade,
}: {
  col: GradeColumn
  student: Student
  studentIdx: number
  grades: Grade[]
  criterionGrades: CriterionGrade[]
  criteria: Criterion[]
  onSave: (studentId: string, columnId: string, score: number | null) => Promise<void>
  onOpenQuickGrade: () => void
}) {
  const grade = grades.find((g) => g.student_id === student.id && g.column_id === col.id)
  const score = getStudentScore(student.id, col, grades, criterionGrades)
  const [value, setValue] = useState(score !== null ? score.toString() : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const newScore = getStudentScore(student.id, col, grades, criterionGrades)
    setValue(newScore !== null ? newScore.toString() : '')
  }, [grades, criterionGrades])

  const hasCriteria = criteria.length > 0
  const disabled = (col.type === 'sumativa' || (col.type === 'formativa' && hasCriteria)) || !col.description

  const isZero = score === 0

  if (col.type === 'sumativa' || hasCriteria) {
    return (
      <td
        className={`px-1 py-0.5 text-center border-r border-gray-200 cursor-pointer hover:bg-green-50 ${isZero ? 'bg-red-50' : ''}`}
        onClick={onOpenQuickGrade}
        title={hasCriteria ? 'Click para calificar por rúbrica' : 'Definir criterios primero'}
      >
        <span className={`text-sm ${isZero ? 'text-red-500 font-bold' : score !== null ? 'text-gray-800 font-medium' : 'text-gray-300'}`}>
          {score !== null ? score.toFixed(1) : hasCriteria ? '·' : '—'}
        </span>
        {grade?.is_manually_adjusted && (
          <span className="ml-0.5 text-xs text-orange-500" title="Nota ajustada individualmente">*</span>
        )}
      </td>
    )
  }

  function focusNext(direction: 'down' | 'right', currentInput: HTMLInputElement) {
    const allInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input.grade-input:not(:disabled)')
    )
    const idx = allInputs.indexOf(currentInput)
    if (idx === -1) return
    if (direction === 'right') { allInputs[idx + 1]?.focus(); return }
    const colIdx = allInputs.slice(0, idx + 1).filter((el) => el.dataset.colId === currentInput.dataset.colId).length - 1
    const sameCol = allInputs.filter((el) => el.dataset.colId === currentInput.dataset.colId)
    sameCol[colIdx + 1]?.focus()
  }

  async function handleBlur() {
    const trimmed = value.trim()
    if (trimmed === '' || trimmed === (score?.toString() ?? '')) {
      if (trimmed === '' && score !== null) {
        setSaving(true)
        await onSave(student.id, col.id, null)
        setSaving(false)
      }
      return
    }
    const num = parseFloat(trimmed)
    if (isNaN(num) || num < 0 || num > 10) { setValue(score !== null ? score.toString() : ''); return }
    const clamped = Math.round(Math.min(10, Math.max(0, num)) * 10) / 10
    setSaving(true)
    setValue(clamped.toString())
    await onSave(student.id, col.id, clamped)
    setSaving(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const input = e.target as HTMLInputElement
      input.blur()
      setTimeout(() => focusNext('down', input), 50)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const input = e.target as HTMLInputElement
      input.blur()
      setTimeout(() => focusNext('right', input), 50)
    }
  }

  return (
    <td className={`px-1 py-0.5 text-center border-r border-gray-200 ${saving ? 'bg-blue-50' : isZero ? 'bg-red-50' : ''}`}>
      {disabled ? (
        <span className="text-gray-300 text-xs" title="Escribe la descripción de la columna primero">—</span>
      ) : (
        <input
          type="number"
          min={0}
          max={10}
          step={0.1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          data-col-id={col.id}
          data-student-idx={studentIdx}
          className="grade-input"
          placeholder="·"
        />
      )}
    </td>
  )
}

// ─── Weights Editor ───────────────────────────────────────────────────────────

function WeightsEditor({
  weights,
  bonusCap,
  onSave,
}: {
  weights: { formativa: number; sumativa: number }
  bonusCap: number
  onSave: (w: { formativa: number; sumativa: number }, bc: number) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(weights.formativa)
  const [s, setS] = useState(weights.sumativa)
  const [bc, setBc] = useState(bonusCap)

  async function save() {
    const total = Number(f) + Number(s)
    if (total !== 100) { alert('La suma de ponderaciones debe ser 100'); return }
    await onSave({ formativa: Number(f), sumativa: Number(s) }, Number(bc))
    setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded px-2 py-1">
        F{weights.formativa}/S{weights.sumativa}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
      <span className="text-xs text-gray-500">Form.</span>
      <input type="number" value={f} onChange={(e) => setF(Number(e.target.value))} className="w-12 border rounded px-1 py-0.5 text-sm" />
      <span className="text-xs text-gray-500">Sum.</span>
      <input type="number" value={s} onChange={(e) => setS(Number(e.target.value))} className="w-12 border rounded px-1 py-0.5 text-sm" />
      <span className="text-xs text-gray-500">Bonus máx.</span>
      <input type="number" value={bc} onChange={(e) => setBc(Number(e.target.value))} className="w-12 border rounded px-1 py-0.5 text-sm" />
      <button onClick={save} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700">OK</button>
      <button onClick={() => setOpen(false)} className="text-xs text-gray-400">✕</button>
    </div>
  )
}
