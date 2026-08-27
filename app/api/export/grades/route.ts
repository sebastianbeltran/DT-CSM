import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { computePeriodFinal, getStudentScore } from '@/lib/calculations'
import type { ColorRange } from '@/lib/types'

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
    { data: phases },
    { data: columns },
    { data: grades },
    { data: criterionGrades },
    { data: colorRanges },
  ] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('periods').select('*').eq('id', periodId).single(),
    supabase.from('students').select('*').eq('course_id', courseId).eq('is_archived', false).order('sort_order'),
    supabase.from('phases').select('*').eq('period_id', periodId).order('sort_order'),
    supabase.from('grade_columns').select('*').eq('period_id', periodId).order('sort_order'),
    supabase.from('grades').select('*'),
    supabase.from('criterion_grades').select('*'),
    supabase.from('color_ranges').select('*').eq('course_id', courseId),
  ])

  if (!course || !period || !students) {
    return NextResponse.json({ error: 'No se encontraron datos' }, { status: 404 })
  }

  const weights = period.grade_weights ?? course.grade_weights ?? { formativa: 40, sumativa: 60 }
  const bonusCap = period.bonus_cap ?? course.bonus_cap ?? 10

  const phaseColumns = columns?.filter((c) => c.phase_id) ?? []
  const bonusColumns = columns?.filter((c) => c.type === 'bonus' && !c.phase_id) ?? []
  const allColumns = [...phaseColumns, ...bonusColumns]

  const headers = ['Estudiante']
  const columnMeta: { col: { id: string; name: string; type: string }; phase?: string }[] = []

  for (const phase of phases ?? []) {
    const phaseCols = phaseColumns.filter((c) => c.phase_id === phase.id)
    for (const col of phaseCols) {
      headers.push(`[${phase.name}] ${col.name}`)
      columnMeta.push({ col, phase: phase.name })
    }
  }
  for (const col of bonusColumns) {
    headers.push(`[Bonus] ${col.name}`)
    columnMeta.push({ col, phase: 'Bonus' })
  }
  headers.push('Nota Final')

  const rows = students.map((student) => {
    const row: (string | number)[] = [student.name]
    for (const { col } of columnMeta) {
      const score = getStudentScore(student.id, col as any, grades ?? [], criterionGrades ?? [])
      row.push(score ?? '')
    }
    const final = computePeriodFinal(
      student.id,
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
