'use client'

import { useState, useEffect } from 'react'
import type { Student, Course, Period, GradeColumn, Phase, Grade, CriterionGrade, Criterion } from '@/lib/types'
import { computePeriodFinal, getStudentScore } from '@/lib/calculations'

interface Props {
  student: Student
  course: Course
  period: Period
  columns: GradeColumn[]
  phases: Phase[]
  grades: Grade[]
  criterionGrades: CriterionGrade[]
  criteria: Criterion[]
  students: Student[]
  onClose: () => void
}

export default function ReportModal({ student, course, period, columns, phases, grades, criterionGrades, criteria, onClose }: Props) {
  const [content, setContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const weights = period.grade_weights ?? course.grade_weights ?? { formativa: 40, sumativa: 60 }
  const bonusCap = period.bonus_cap ?? course.bonus_cap ?? 10
  const finalGrade = computePeriodFinal(student.id, columns, grades, criterionGrades, weights, bonusCap)

  useEffect(() => {
    // Load existing report
    fetch(`/api/reports?studentId=${student.id}&periodId=${period.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data[0]?.content) setContent(data[0].content)
      })
  }, [student.id, period.id])

  async function generate() {
    setGenerating(true)

    const columnData = columns
      .filter((col) => col.description)
      .map((col) => {
        const phase = phases.find((p) => p.id === col.phase_id)
        const score = getStudentScore(student.id, col, grades, criterionGrades)
        const grade = grades.find((g) => g.student_id === student.id && g.column_id === col.id)

        const colCriteria = criteria.filter((c) => c.column_id === col.id)
        const criteriaData = colCriteria.map((c) => {
          const cg = criterionGrades.find((cg) => cg.grade_id === grade?.id && cg.criterion_id === c.id)
          return { name: c.name, max_score: c.max_score, earned: cg?.score ?? 0 }
        })

        return {
          name: col.name,
          description: col.description ?? '',
          phase: phase?.name ?? 'Sin fase',
          type: col.type,
          score,
          criteria: criteriaData.length > 0 ? criteriaData : undefined,
        }
      })

    const res = await fetch('/api/ai/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: student.name,
        courseName: course.name,
        periodName: period.name,
        columns: columnData,
        finalGrade,
        absences: 0,
        totalSessions: 0,
      }),
    })

    const data = await res.json()
    if (data.report) setContent(data.report)
    setGenerating(false)
  }

  async function saveReport() {
    if (!content.trim()) return
    setSaving(true)
    await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: student.id, period_id: period.id, content }),
    })
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  function printReport() {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html>
      <head>
        <title>Informe - ${student.name}</title>
        <style>
          body { font-family: Georgia, serif; max-width: 650px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .meta { color: #666; font-size: 14px; margin-bottom: 8px; }
          .grade { font-size: 32px; font-weight: bold; color: #1e3a8a; margin: 16px 0; }
          p { line-height: 1.7; font-size: 15px; }
          hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>${student.name}</h1>
        <div class="meta">${course.name} &nbsp;|&nbsp; ${period.name}</div>
        <hr/>
        <div class="grade">Nota: ${finalGrade?.toFixed(1) ?? '—'}</div>
        <p>${content.replace(/\n/g, '<br/>')}</p>
      </body>
      </html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{student.name}</h2>
            <p className="text-sm text-gray-500">{course.name} · {period.name} · Nota: <span className="font-bold text-blue-700">{finalGrade?.toFixed(1) ?? '—'}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl ml-4">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex justify-end mb-3">
            <button
              onClick={generate}
              disabled={generating}
              className="flex items-center gap-2 text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <span className="animate-spin">⟳</span> Generando con IA...
                </>
              ) : (
                '✨ Generar informe con IA'
              )}
            </button>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            placeholder="El informe aparecerá aquí. Puedes editarlo libremente antes de guardarlo."
            className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
          />

          <p className="text-xs text-gray-400 mt-2">
            Generado con IA como borrador — edítalo antes de guardarlo.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3 justify-end">
          <button
            onClick={printReport}
            disabled={!content}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            Imprimir PDF
          </button>
          <button
            onClick={saveReport}
            disabled={saving || !content}
            className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar informe'}
          </button>
        </div>
      </div>
    </div>
  )
}
