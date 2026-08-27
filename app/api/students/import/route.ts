import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

async function importStudentsIntoCourse(courseId: string, names: string[]) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'es'))

  const { data: existing } = await supabase
    .from('students')
    .select('name')
    .eq('course_id', courseId)
    .eq('is_archived', false)

  const existingNames = new Set((existing ?? []).map((s: { name: string }) => s.name.toLowerCase()))
  const toInsert = sorted
    .filter((n) => !existingNames.has(n.toLowerCase()))
    .map((name, idx) => ({
      course_id: courseId,
      name,
      sort_order: (existing?.length ?? 0) + idx,
    }))

  if (toInsert.length > 0) {
    await supabase.from('students').insert(toInsert)
  }

  // Re-sort all alphabetically
  const { data: all } = await supabase
    .from('students')
    .select('id, name')
    .eq('course_id', courseId)
    .eq('is_archived', false)

  if (all) {
    const reordered = [...all].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    for (let i = 0; i < reordered.length; i++) {
      await supabase.from('students').update({ sort_order: i }).eq('id', reordered[i].id)
    }
  }

  return { inserted: toInsert.length, total: all?.length ?? 0 }
}

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const yearId = formData.get('yearId') as string

  // Legacy: single course import
  const courseId = formData.get('courseId') as string
  const courseName = formData.get('courseName') as string

  if (!file) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'buffer' })

  // MULTI-SHEET: each sheet = one course
  if (wb.SheetNames.length > 1 && yearId) {
    const results: { course: string; inserted: number; total: number }[] = []

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' })

      // Detect student rows: skip header rows (rows with # or metadata)
      // Find the row that has "#" and "Estudiante" headers
      let dataStartRow = 0
      let nameColIdx = 1 // default: column B
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const row = rows[i]
        const rowStr = row.map((c) => String(c).toLowerCase())
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
        .filter((n) => n && !/^\d+$/.test(n)) // skip empty and pure numbers

      if (names.length === 0) continue

      // Find or create course
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

      const stats = await importStudentsIntoCourse(cId, names)
      results.push({ course: sheetName, ...stats })
    }

    return NextResponse.json({ multiSheet: true, results })
  }

  // SINGLE SHEET: resolve courseId
  let resolvedCourseId = courseId

  if (!resolvedCourseId && yearId && courseName) {
    const { data: existing } = await supabase
      .from('courses')
      .select('id')
      .eq('school_year_id', yearId)
      .eq('name', courseName.trim())
      .single()

    if (existing) {
      resolvedCourseId = existing.id
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

  const stats = await importStudentsIntoCourse(resolvedCourseId, names)
  return NextResponse.json(stats)
}
