import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { computePeriodFinalFromCompetencies } from '@/lib/calculations'
import type { PeriodCompetency } from '@/lib/types'
import * as XLSX from 'xlsx'

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
    { data: reports },
    { data: periodCompetencies },
    { data: columns },
    { data: grades },
    { data: criterionGrades },
  ] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('periods').select('*').eq('id', periodId).single(),
    supabase.from('students').select('*').eq('course_id', courseId).eq('is_archived', false).order('sort_order'),
    supabase.from('reports').select('*').eq('period_id', periodId),
    supabase.from('period_competencies').select('*').eq('period_id', periodId).order('sort_order'),
    supabase.from('grade_columns').select('*').eq('period_id', periodId),
    supabase.from('grades').select('*'),
    supabase.from('criterion_grades').select('*'),
  ])

  const weights = period?.grade_weights ?? course?.grade_weights ?? { formativa: 40, sumativa: 60 }
  const bonusCap = period?.bonus_cap ?? course?.bonus_cap ?? 10
  const allPeriodCompetencies: PeriodCompetency[] = (periodCompetencies ?? []) as PeriodCompetency[]

  const rows = (students ?? []).map((student) => {
    const report = reports?.find((r) => r.student_id === student.id)
    const final = computePeriodFinalFromCompetencies(
      student.id,
      allPeriodCompetencies,
      (columns ?? []) as any,
      (grades ?? []) as any,
      (criterionGrades ?? []) as any,
      weights,
      bonusCap
    )
    return {
      Estudiante: student.name,
      'Nota final': final !== null ? final : '',
      Informe: report?.content ?? '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths: name=30, grade=12, comment=80
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 80 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Informes')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `Informes_${course?.name ?? ''}_${period?.name ?? ''}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
