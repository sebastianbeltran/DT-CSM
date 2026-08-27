import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { computePeriodFinal } from '@/lib/calculations'

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
    { data: columns },
    { data: grades },
    { data: criterionGrades },
  ] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('periods').select('*').eq('id', periodId).single(),
    supabase.from('students').select('*').eq('course_id', courseId).eq('is_archived', false).order('sort_order'),
    supabase.from('reports').select('*').eq('period_id', periodId),
    supabase.from('grade_columns').select('*').eq('period_id', periodId),
    supabase.from('grades').select('*'),
    supabase.from('criterion_grades').select('*'),
  ])

  const weights = period?.grade_weights ?? course?.grade_weights ?? { formativa: 40, sumativa: 60 }
  const bonusCap = period?.bonus_cap ?? course?.bonus_cap ?? 10

  let content = `INFORMES DE DESEMPEÑO\n`
  content += `Curso: ${course?.name ?? ''} | Periodo: ${period?.name ?? ''}\n`
  content += `=`.repeat(60) + '\n\n'

  for (const student of students ?? []) {
    const report = reports?.find((r) => r.student_id === student.id)
    const final = computePeriodFinal(
      student.id,
      (columns ?? []) as any,
      (grades ?? []) as any,
      (criterionGrades ?? []) as any,
      weights,
      bonusCap
    )

    content += `ESTUDIANTE: ${student.name}\n`
    content += `Nota final: ${final !== null ? final.toFixed(1) : 'Pendiente'}\n`
    content += `-`.repeat(40) + '\n'
    content += report?.content ?? '(Sin informe generado)\n'
    content += '\n\n'
  }

  const buf = Buffer.from(content, 'utf-8')

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="Informes_${course?.name ?? ''}_${period?.name ?? ''}.txt"`,
    },
  })
}
