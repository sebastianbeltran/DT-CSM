import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getBonusPlacement, getScoreWithBonus } from '@/lib/calculations'
import { COMPETENCIES, type CompetencyKey } from '@/lib/competencies'
import type { GradeColumn } from '@/lib/types'
import {
  PHIDIAS_DEFAULTS,
  buildCsv,
  encodeText,
  formatScore,
  safeFilePart,
  toPhidiasName,
  type PhidiasDelimiter,
  type PhidiasEncoding,
} from '@/lib/phidias'

interface ExportBody {
  courseId: string
  periodId: string
  competencyKey: CompetencyKey
  columnIds: string[]
  refs: Record<string, string> // studentId → Referencia Phidias
  delimiter?: PhidiasDelimiter
  encoding?: PhidiasEncoding
}

// Genera el CSV de importación de Phidias para una competencia. Solo lee datos.
export async function POST(req: Request) {
  const body = (await req.json()) as ExportBody
  const { courseId, periodId, competencyKey, columnIds, refs } = body
  const delimiter = body.delimiter === ';' ? ';' : PHIDIAS_DEFAULTS.delimiter
  const encoding: PhidiasEncoding = body.encoding === 'latin1' ? 'latin1' : PHIDIAS_DEFAULTS.encoding

  if (!courseId || !periodId || !competencyKey || !COMPETENCIES[competencyKey]) {
    return NextResponse.json({ error: 'Faltan datos: curso, trimestre o competencia.' }, { status: 400 })
  }
  if (!Array.isArray(columnIds) || columnIds.length === 0) {
    return NextResponse.json({ error: 'Selecciona al menos una evaluación.' }, { status: 400 })
  }

  const [{ data: course }, { data: period }, { data: students }, { data: periodColumns }] = await Promise.all([
    supabase.from('courses').select('id, name, bonus_cap').eq('id', courseId).single(),
    supabase.from('periods').select('id, bonus_cap').eq('id', periodId).eq('course_id', courseId).single(),
    supabase.from('students').select('id, name').eq('course_id', courseId).eq('is_archived', false).order('sort_order'),
    supabase.from('grade_columns').select('*').eq('period_id', periodId).order('sort_order'),
  ])
  if (!course || !period || !students) return NextResponse.json({ error: 'No se encontró el curso.' }, { status: 404 })
  const bonusCap = period.bonus_cap ?? course.bonus_cap ?? 10
  const allColumns = (periodColumns ?? []) as GradeColumn[]
  const columns = allColumns.filter((c) => c.competency_key === competencyKey && columnIds.includes(c.id))
  if (!columns || columns.length !== columnIds.length) {
    return NextResponse.json({ error: 'Alguna evaluación seleccionada no pertenece a esta competencia/trimestre.' }, { status: 400 })
  }

  // 1. Todos los estudiantes activos deben tener referencia
  const missing = students.filter((s) => !refs?.[s.id]?.trim())
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Hay estudiantes sin Referencia de Phidias.', missingRefs: missing.map((s) => s.name) },
      { status: 422 }
    )
  }
  const refValues = students.map((s) => refs[s.id].trim())
  const dupRef = refValues.find((r, i) => refValues.indexOf(r) !== i)
  if (dupRef) {
    return NextResponse.json({ error: `La referencia ${dupRef} quedó asignada a más de un estudiante.` }, { status: 422 })
  }

  // 2. Notas (misma lógica que la tabla de la app, con el bono en la evaluación más baja)
  const studentIds = students.map((s) => s.id)
  const { data: grades, error: gErr } = await supabase
    .from('grades')
    .select('*')
    .in('column_id', allColumns.map((c) => c.id))
    .in('student_id', studentIds)
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })
  const gradeIds = (grades ?? []).map((g) => g.id)
  const { data: criterionGrades, error: cgErr } = gradeIds.length
    ? await supabase.from('criterion_grades').select('*').in('grade_id', gradeIds)
    : { data: [], error: null }
  if (cgErr) return NextResponse.json({ error: cgErr.message }, { status: 500 })

  const outOfRange: string[] = []
  const rows: string[][] = [['Referencia', 'Estudiante', ...columns.map((c) => c.name)]]
  for (const s of students) {
    const row = [refs[s.id].trim(), toPhidiasName(s.name)]
    const placement = getBonusPlacement(s.id, allColumns, grades ?? [], criterionGrades ?? [], bonusCap)
    for (const col of columns) {
      const score = getScoreWithBonus(s.id, col, grades ?? [], criterionGrades ?? [], placement)
      if (score === null) {
        row.push('')
        continue
      }
      if (score < 1 || score > 10) outOfRange.push(`${s.name} – ${col.name}: ${score}`)
      row.push(formatScore(score))
    }
    rows.push(row)
  }
  if (outOfRange.length > 0) {
    return NextResponse.json(
      { error: 'Hay notas fuera de la escala 1–10 de Phidias.', outOfRange },
      { status: 422 }
    )
  }

  // 3. Codificación sin corromper caracteres
  const { bytes, problems } = encodeText(buildCsv(rows, delimiter), encoding)
  if (problems.length > 0) {
    return NextResponse.json(
      {
        error: `Hay caracteres que no existen en ${encoding === 'latin1' ? 'Latin-1' : 'Windows-1252'}.`,
        encodingProblems: problems.map((p) => `"${p.char}" (U+${p.char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}) en: ${p.context}`),
      },
      { status: 422 }
    )
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const filename = `${safeFilePart(course.name)}_${safeFilePart(COMPETENCIES[competencyKey].name)}_${today}.csv`
  const charset = encoding === 'latin1' ? 'iso-8859-1' : 'windows-1252'

  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': `text/csv; charset=${charset}`,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
