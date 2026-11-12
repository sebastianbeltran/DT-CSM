import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getStudentScore, getBonusPlacement } from '@/lib/calculations'
import { normalizeName } from '@/lib/phidias'
import type { GradeColumn } from '@/lib/types'

interface CompareBody {
  courseId: string
  periodId: string
  // Para cada evaluación de Phidias: con qué columna de la app se compara (null = no comparar)
  mapping: { phidiasIndex: number; columnId: string | null }[]
  students: { name: string; values: (number | null)[] }[]
}

export interface PhidiasDiff {
  studentId: string
  studentName: string
  columnId: string
  columnName: string
  appScore: number | null // lo que hoy muestra la app (incluye ajuste previo, si hay)
  rubricScore: number | null // suma de la rúbrica, sin ajuste
  phidiasScore: number | null
  hasAdjustment: boolean
  warnings: string[]
}

const round1 = (n: number) => Math.round(Math.round(n * 100) / 10) / 10

// Compara notas pegadas desde Phidias con las de la app. Solo lee.
export async function POST(req: Request) {
  const { courseId, periodId, mapping, students: pasted } = (await req.json()) as CompareBody
  const columnIds = mapping.map((m) => m.columnId).filter((x): x is string => !!x)
  if (!courseId || !periodId || columnIds.length === 0) {
    return NextResponse.json({ error: 'Elige al menos una evaluación de la app para comparar.' }, { status: 400 })
  }

  const [{ data: students }, { data: periodColumns }, { data: period }, { data: course }] = await Promise.all([
    supabase.from('students').select('id, name').eq('course_id', courseId).eq('is_archived', false).order('sort_order'),
    supabase.from('grade_columns').select('*').eq('period_id', periodId).order('sort_order'),
    supabase.from('periods').select('bonus_cap').eq('id', periodId).single(),
    supabase.from('courses').select('bonus_cap').eq('id', courseId).single(),
  ])
  const allColumns = (periodColumns ?? []) as GradeColumn[]
  const columns = allColumns.filter((c) => columnIds.includes(c.id))
  if (!students || columns.length !== new Set(columnIds).size) {
    return NextResponse.json({ error: 'Alguna evaluación no pertenece a este trimestre.' }, { status: 400 })
  }
  const bonusCap = period?.bonus_cap ?? course?.bonus_cap ?? 10
  const studentIds = students.map((s) => s.id)
  const { data: grades } = await supabase.from('grades').select('*').in('column_id', allColumns.map((c) => c.id)).in('student_id', studentIds)
  const gradeIds = (grades ?? []).map((g) => g.id)
  const { data: criterionGrades } = gradeIds.length
    ? await supabase.from('criterion_grades').select('*').in('grade_id', gradeIds)
    : { data: [] }

  // Emparejar por nombre normalizado, solo coincidencias únicas
  const count = (arr: string[]) => arr.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())
  const appCount = count(students.map((s) => normalizeName(s.name)))
  const phCount = count(pasted.map((p) => normalizeName(p.name)))
  const byKey = new Map(pasted.map((p) => [normalizeName(p.name), p]))

  const unmatchedApp: string[] = []
  const matchedKeys = new Set<string>()
  const diffs: PhidiasDiff[] = []
  let equalCount = 0

  for (const s of students) {
    const k = normalizeName(s.name)
    const p = byKey.get(k)
    if (!p || appCount.get(k) !== 1 || phCount.get(k) !== 1) {
      unmatchedApp.push(s.name)
      continue
    }
    matchedKeys.add(k)
    const placement = getBonusPlacement(s.id, allColumns, grades ?? [], criterionGrades ?? [], bonusCap)
    for (const m of mapping) {
      if (!m.columnId) continue
      const col = columns.find((c) => c.id === m.columnId) as GradeColumn
      const grade = (grades ?? []).find((g) => g.student_id === s.id && g.column_id === col.id)
      const appScore = getStudentScore(s.id, col, grades ?? [], criterionGrades ?? [])
      const rubricScore = grade
        ? getStudentScore(s.id, col, [{ ...grade, phidias_score: null }], criterionGrades ?? [])
        : null
      const phidiasScore = p.values[m.phidiasIndex] ?? null

      const same =
        (appScore === null && phidiasScore === null) ||
        (appScore !== null && phidiasScore !== null && round1(appScore) === round1(phidiasScore))
      if (same) {
        equalCount++
        continue
      }

      const warnings: string[] = []
      if (placement?.columnId === col.id && appScore !== null) {
        const withBonus = Math.min(10, appScore + placement.points)
        warnings.push(
          phidiasScore !== null && round1(withBonus) === round1(phidiasScore)
            ? `Coincide con la nota + bono de la app (${round1(appScore)} + ${placement.points} = ${round1(withBonus)}): si eliges Phidias el bono se sumaría dos veces`
            : `En la app esta evaluación recibe el bono (+${placement.points} → ${round1(withBonus)}); aquí se compara sin bono`
        )
      }
      if (phidiasScore === null) warnings.push('En Phidias no tiene nota')
      if (appScore === null) warnings.push('En la app no tiene nota')
      if (phidiasScore !== null && (phidiasScore < 1 || phidiasScore > 10)) warnings.push('Nota de Phidias fuera de 1–10')
      if (appScore !== null && phidiasScore !== null && Math.abs(appScore - phidiasScore) >= 2) {
        warnings.push(`Diferencia grande (${Math.abs(appScore - phidiasScore).toFixed(1)} puntos)`)
      }

      diffs.push({
        studentId: s.id,
        studentName: s.name,
        columnId: col.id,
        columnName: col.name,
        appScore: appScore === null ? null : round1(appScore),
        rubricScore: rubricScore === null ? null : round1(rubricScore),
        phidiasScore,
        hasAdjustment: grade?.phidias_score != null,
        warnings,
      })
    }
  }

  const unmatchedPhidias = pasted.filter((p) => !matchedKeys.has(normalizeName(p.name))).map((p) => p.name)
  return NextResponse.json({ diffs, equalCount, unmatchedApp, unmatchedPhidias })
}
