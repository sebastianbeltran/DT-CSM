import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// Transfer grades from source course columns to equivalent columns in destination course
async function transferGrades(studentId: string, sourceCourseId: string, destCourseId: string) {
  const { data: grades } = await supabase
    .from('grades')
    .select(`
      id,
      column_id,
      grade_columns (
        id,
        name,
        period_id,
        periods (
          id,
          name,
          course_id
        )
      )
    `)
    .eq('student_id', studentId)

  if (!grades || grades.length === 0) return

  // Only grades belonging to source course
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourceGrades = (grades as any[]).filter(
    (g) => g.grade_columns?.periods?.course_id === sourceCourseId
  )

  for (const grade of sourceGrades) {
    const sourcePeriodName: string | undefined = grade.grade_columns?.periods?.name
    const sourceColumnName: string | undefined = grade.grade_columns?.name
    if (!sourcePeriodName || !sourceColumnName) continue

    // Find matching period in destination course (by name)
    const { data: destPeriod } = await supabase
      .from('periods')
      .select('id')
      .eq('course_id', destCourseId)
      .eq('name', sourcePeriodName)
      .maybeSingle()

    if (!destPeriod) continue

    // Find matching column in that period (by name)
    const { data: destColumn } = await supabase
      .from('grade_columns')
      .select('id')
      .eq('period_id', destPeriod.id)
      .eq('name', sourceColumnName)
      .maybeSingle()

    if (!destColumn) continue

    // Don't overwrite an existing grade in the destination column
    const { data: alreadyExists } = await supabase
      .from('grades')
      .select('id')
      .eq('student_id', studentId)
      .eq('column_id', destColumn.id)
      .maybeSingle()

    if (alreadyExists) continue

    await supabase.from('grades').update({ column_id: destColumn.id }).eq('id', grade.id)
  }
}

// Move student to a new course and transfer her grades
async function moveStudentToCourse(studentId: string, sourceCourseId: string, destCourseId: string) {
  const { data: destActive } = await supabase
    .from('students')
    .select('id')
    .eq('course_id', destCourseId)
    .eq('is_archived', false)

  await supabase
    .from('students')
    .update({
      course_id: destCourseId,
      previous_course_id: sourceCourseId,
      sort_order: destActive?.length ?? 0,
    })
    .eq('id', studentId)

  await transferGrades(studentId, sourceCourseId, destCourseId)
}

async function syncStudentsIntoCourse(
  courseId: string,
  names: string[],
  yearId?: string // enables cross-course move detection for single-course imports
) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'es'))
  const newNamesLower = new Set(sorted.map((n) => n.toLowerCase()))

  const { data: existing } = await supabase
    .from('students')
    .select('id, name')
    .eq('course_id', courseId)
    .eq('is_archived', false)

  const existingNamesLower = new Set(
    (existing ?? []).map((s: { id: string; name: string }) => s.name.toLowerCase())
  )

  const toArchive = (existing ?? []).filter(
    (s: { id: string; name: string }) => !newNamesLower.has(s.name.toLowerCase())
  )

  const toAddNames = sorted.filter((n) => !existingNamesLower.has(n.toLowerCase()))
  const toInsertNew: string[] = []
  let movedCount = 0

  if (yearId && toAddNames.length > 0) {
    // Look for students active in other courses of the same year
    const { data: yearCourses } = await supabase
      .from('courses')
      .select('id')
      .eq('school_year_id', yearId)
      .neq('id', courseId)

    const otherCourseIds = (yearCourses ?? []).map((c: { id: string }) => c.id)

    for (const name of toAddNames) {
      let moved = false
      if (otherCourseIds.length > 0) {
        const { data: elsewhere } = await supabase
          .from('students')
          .select('id, course_id')
          .ilike('name', name)
          .eq('is_archived', false)
          .in('course_id', otherCourseIds)
          .limit(1)
          .maybeSingle()

        if (elsewhere) {
          await moveStudentToCourse(elsewhere.id, elsewhere.course_id, courseId)
          movedCount++
          moved = true
        }
      }
      if (!moved) toInsertNew.push(name)
    }
  } else {
    toInsertNew.push(...toAddNames)
  }

  if (toInsertNew.length > 0) {
    const { data: nowActive } = await supabase
      .from('students')
      .select('id')
      .eq('course_id', courseId)
      .eq('is_archived', false)

    const startIdx = nowActive?.length ?? 0
    await supabase.from('students').insert(
      toInsertNew.map((name, idx) => ({
        course_id: courseId,
        name,
        sort_order: startIdx + idx,
      }))
    )
  }

  if (toArchive.length > 0) {
    await supabase
      .from('students')
      .update({
        is_archived: true,
        archive_reason: 'Actualización de lista',
        archived_at: new Date().toISOString(),
      })
      .in(
        'id',
        toArchive.map((s: { id: string; name: string }) => s.id)
      )
  }

  const { data: all } = await supabase
    .from('students')
    .select('id, name')
    .eq('course_id', courseId)
    .eq('is_archived', false)

  if (all) {
    const reordered = [...all].sort((a: { id: string; name: string }, b: { id: string; name: string }) =>
      a.name.localeCompare(b.name, 'es')
    )
    for (let i = 0; i < reordered.length; i++) {
      await supabase.from('students').update({ sort_order: i }).eq('id', reordered[i].id)
    }
  }

  return {
    inserted: toInsertNew.length,
    moved: movedCount,
    archived: toArchive.length,
    total: all?.length ?? 0,
  }
}

async function parsePhidiasPdf(buffer: ArrayBuffer): Promise<{ courseName: string; studentNames: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const data = await pdfParse(Buffer.from(buffer))
  const lines = data.text
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0)

  // PDF text layout: labels first ("Año academico", "Materia", "Grupo"),
  // then values ("2026-2027", "Tecnología", "7A"), then "#Estudiante", then rows.
  const grupoLabelIdx = lines.findIndex((l: string) => l === 'Grupo')
  const courseName = grupoLabelIdx >= 0 ? lines[grupoLabelIdx + 3] : ''

  // Student rows: "1AYA ARANGO, MARIANA" (number + name, no space, always has a comma)
  // The comma distinguishes student names (APELLIDO, NOMBRE) from the course code line ("7A")
  const studentNames = lines
    .filter((l: string) => /^\d+[A-ZÁÉÍÓÚÜÑ]/.test(l) && l.includes(','))
    .map((l: string) => l.replace(/^\d+/, '').trim())

  return { courseName: courseName.trim(), studentNames }
}

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const yearId = formData.get('yearId') as string
  const courseId = formData.get('courseId') as string
  const courseName = formData.get('courseName') as string

  if (!file) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

  // ── PDF (Phidias) ──────────────────────────────────────────────────────────
  if (isPdf) {
    const { courseName: pdfCourseName, studentNames } = await parsePhidiasPdf(buffer)

    if (studentNames.length === 0) {
      return NextResponse.json({ error: 'No se encontraron estudiantes en el PDF' }, { status: 400 })
    }

    let resolvedCourseId = courseId

    if (!resolvedCourseId) {
      const targetName = (courseName || pdfCourseName).trim()
      if (!targetName) {
        return NextResponse.json({ error: 'No se pudo detectar el nombre del curso en el PDF' }, { status: 400 })
      }
      if (!yearId) {
        return NextResponse.json({ error: 'Falta el año escolar' }, { status: 400 })
      }

      const { data: found } = await supabase
        .from('courses')
        .select('id')
        .eq('school_year_id', yearId)
        .eq('name', targetName)
        .single()

      if (found) {
        resolvedCourseId = found.id
      } else {
        const { data: newCourse, error } = await supabase
          .from('courses')
          .insert({ school_year_id: yearId, name: targetName })
          .select()
          .single()
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        resolvedCourseId = newCourse.id
      }
    }

    // yearId for cross-course detection: if not provided, look it up from the course
    let effectiveYearId = yearId
    if (!effectiveYearId) {
      const { data: course } = await supabase
        .from('courses')
        .select('school_year_id')
        .eq('id', resolvedCourseId)
        .single()
      effectiveYearId = course?.school_year_id
    }

    const stats = await syncStudentsIntoCourse(resolvedCourseId, studentNames, effectiveYearId)
    return NextResponse.json({ ...stats, detectedCourse: pdfCourseName })
  }

  // ── Excel ──────────────────────────────────────────────────────────────────
  const wb = XLSX.read(buffer, { type: 'buffer' })

  // MULTI-SHEET ───────────────────────────────────────────────────────────────
  if (wb.SheetNames.length > 1 && yearId) {
    // Step 1: parse all sheets
    type SheetData = { courseId: string; courseName: string; names: string[] }
    const sheetDataList: SheetData[] = []

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' })

      let dataStartRow = 0
      let nameColIdx = 1
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const rowStr = rows[i].map((c) => String(c).toLowerCase())
        if (rowStr.includes('#') || rowStr.includes('estudiante') || rowStr.includes('nombre')) {
          dataStartRow = i + 1
          const estIdx = rowStr.findIndex((c) => c.includes('estudiante') || c.includes('nombre'))
          if (estIdx >= 0) nameColIdx = estIdx
          break
        }
      }

      const names = rows
        .slice(dataStartRow)
        .map((row) => String(row[nameColIdx] ?? '').trim())
        .filter((n) => n && !/^\d+$/.test(n))

      if (names.length === 0) continue

      let cId: string
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('id')
        .eq('school_year_id', yearId)
        .eq('name', sheetName.trim())
        .single()

      if (existingCourse) {
        cId = existingCourse.id
      } else {
        const { data: newCourse, error } = await supabase
          .from('courses')
          .insert({ school_year_id: yearId, name: sheetName.trim() })
          .select()
          .single()
        if (error || !newCourse) continue
        cId = newCourse.id
      }

      sheetDataList.push({ courseId: cId, courseName: sheetName, names })
    }

    // Step 2: pre-pass — detect and execute cross-course moves BEFORE any archiving
    // Build map: nameLower → destination courseId (last occurrence wins if duplicated)
    const nameToDestCourse = new Map<string, string>()
    for (const { courseId: cId, names } of sheetDataList) {
      for (const name of names) {
        nameToDestCourse.set(name.toLowerCase(), cId)
      }
    }

    const affectedCourseIds = sheetDataList.map((d) => d.courseId)
    const { data: allActive } = await supabase
      .from('students')
      .select('id, name, course_id')
      .in('course_id', affectedCourseIds)
      .eq('is_archived', false)

    for (const student of allActive ?? []) {
      const destCourseId = nameToDestCourse.get(student.name.toLowerCase())
      if (destCourseId && destCourseId !== student.course_id) {
        await moveStudentToCourse(student.id, student.course_id, destCourseId)
      }
    }

    // Step 3: sync each course (moves already handled — no yearId needed here)
    const results: { course: string; inserted: number; moved: number; archived: number; total: number }[] = []
    for (const { courseId: cId, courseName: cName, names } of sheetDataList) {
      const stats = await syncStudentsIntoCourse(cId, names)
      results.push({ course: cName, ...stats })
    }

    return NextResponse.json({ multiSheet: true, results })
  }

  // SINGLE SHEET ──────────────────────────────────────────────────────────────
  let resolvedCourseId = courseId

  if (!resolvedCourseId && yearId && courseName) {
    const { data: found } = await supabase
      .from('courses')
      .select('id')
      .eq('school_year_id', yearId)
      .eq('name', courseName.trim())
      .single()

    if (found) {
      resolvedCourseId = found.id
    } else {
      const { data: newCourse, error } = await supabase
        .from('courses')
        .insert({ school_year_id: yearId, name: courseName.trim() })
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      resolvedCourseId = newCourse.id
    }
  }

  if (!resolvedCourseId) {
    return NextResponse.json({ error: 'Falta courseId o (yearId + courseName)' }, { status: 400 })
  }

  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })
  }

  const headers = Object.keys(rows[0])
  const nameCol =
    headers.find((h) => ['nombre', 'name', 'estudiante', 'alumna', 'alumno'].includes(h.toLowerCase())) ?? headers[0]

  const names = rows.map((r) => String(r[nameCol] ?? '').trim()).filter(Boolean)

  if (names.length === 0) {
    return NextResponse.json({ error: 'No se encontraron nombres' }, { status: 400 })
  }

  let effectiveYearId = yearId
  if (!effectiveYearId) {
    const { data: course } = await supabase
      .from('courses')
      .select('school_year_id')
      .eq('id', resolvedCourseId)
      .single()
    effectiveYearId = course?.school_year_id
  }

  const stats = await syncStudentsIntoCourse(resolvedCourseId, names, effectiveYearId)
  return NextResponse.json(stats)
}
