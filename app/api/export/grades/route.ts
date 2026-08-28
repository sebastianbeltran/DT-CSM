import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { computePeriodFinalFromCompetencies, computeCompetencyGrade, getStudentScore } from '@/lib/calculations'
import type { PeriodCompetency } from '@/lib/types'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  const periodId = searchParams.get('periodId')

  if (!courseId || !periodId) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const [
    { data: course },
    { data: period },
    { data: students },
    { data: periodCompetencies },
    { data: columns },
    { data: grades },
    { data: criterionGrades },
  ] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('periods').select('*').eq('id', periodId).single(),
    supabase.from('students').select('*').eq('course_id', courseId).eq('is_archived', false).order('sort_order'),
    supabase.from('period_competencies').select('*').eq('period_id', periodId).order('sort_order'),
    supabase.from('grade_columns').select('*').eq('period_id', periodId).order('sort_order'),
    supabase.from('grades').select('*'),
    supabase.from('criterion_grades').select('*'),
  ])

  if (!course || !period || !students) {
    return NextResponse.json({ error: 'No se encontraron datos' }, { status: 404 })
  }

  const weights = period.grade_weights ?? course.grade_weights ?? { formativa: 40, sumativa: 60 }
  const bonusCap = period.bonus_cap ?? course.bonus_cap ?? 10
  const allColumns = columns ?? []
  const allPeriodCompetencies: PeriodCompetency[] = (periodCompetencies ?? []) as PeriodCompetency[]

  const headers = ['Estudiante']
  const columnMeta: { col: { id: string; name: string; type: string }; label: string }[] = []

  // Competency columns grouped by competency
  for (const pc of allPeriodCompetencies) {
    const pcCols = allColumns.filter((c) => c.competency_key === pc.competency_key)
    for (const col of pcCols) {
      headers.push(`[${pc.competency_key}] ${col.name}`)
      columnMeta.push({ col, label: pc.competency_key })
    }
    // Competency grade header
    headers.push(`Nota ${pc.competency_key}`)
  }

  // Bonus columns
  const bonusColumns = allColumns.filter((c) => c.type === 'bonus' && !c.competency_key)
  for (const col of bonusColumns) {
    headers.push(`[Bonus] ${col.name}`)
    columnMeta.push({ col, label: 'Bonus' })
  }

  headers.push('Nota Final')

  const rows = students.map((student) => {
    const row: (string | number)[] = [student.name]

    for (const pc of allPeriodCompetencies) {
      const pcCols = allColumns.filter((c) => c.competency_key === pc.competency_key)
      for (const col of pcCols) {
        const score = getStudentScore(student.id, col as any, grades ?? [], criterionGrades ?? [])
        row.push(score ?? '')
      }
      const compGrade = computeCompetencyGrade(student.id, pc.competency_key, allColumns, grades ?? [], criterionGrades ?? [], weights, bonusCap)
      row.push(compGrade !== null ? compGrade : '')
    }

    for (const col of bonusColumns) {
      const score = getStudentScore(student.id, col as any, grades ?? [], criterionGrades ?? [])
      row.push(score ?? '')
    }

    const final = computePeriodFinalFromCompetencies(
      student.id,
      allPeriodCompetencies,
      allColumns as any,
      grades ?? [],
      criterionGrades ?? [],
      weights,
      bonusCap
    )
    row.push(final ?? '')
    return row
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  XLSX.utils.book_append_sheet(wb, ws, period.name)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${course.name}_${period.name}.xlsx"`,
    },
  })
}
