import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

function parseCourseScheduleFromBuffer(buffer: ArrayBuffer, courseName: string): number[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })

  const colToDay: Record<number, number> = { 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 }
  const days = new Set<number>()

  const normalized = courseName.trim().toUpperCase().replace(/\s/g, '').replace(/[°º]/g, '')
  const isGrade11 = ['11', 'ONCE', '11°', '11º'].includes(normalized)

  for (const row of rows) {
    for (const [colStr, dayOfWeek] of Object.entries(colToDay)) {
      const cell = String((row as any)[Number(colStr)] ?? '').trim()
      if (!cell) continue

      const lower = cell.toLowerCase()
      if (['recreo', 'almuerzo', 'd.g', 'salida'].some(s => lower.startsWith(s))) continue
      if (/^proy/i.test(cell)) continue

      const firstLine = cell.split(/[\r\n(]/)[0].trim().toUpperCase()

      if (isGrade11 && firstLine.includes('PROFUNDIZACIÓN')) {
        days.add(dayOfWeek)
        continue
      }

      const cellCourse = firstLine.replace(/\s+/g, '').replace(/[°º]/g, '')
      if (cellCourse === normalized) {
        days.add(dayOfWeek)
      }
    }
  }

  return Array.from(days).sort()
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const yearId = formData.get('yearId') as string

    if (!file || !yearId) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    const { data: courses } = await supabase
      .from('courses')
      .select('id, name')
      .eq('school_year_id', yearId)

    if (!courses?.length) {
      return NextResponse.json({ error: 'No hay cursos en este año escolar' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const updated: string[] = []
    const notFound: string[] = []

    for (const course of courses) {
      const classDays = parseCourseScheduleFromBuffer(buffer, course.name)
      if (classDays.length > 0) {
        await supabase.from('courses').update({ class_days: classDays }).eq('id', course.id)
        updated.push(course.name)
      } else {
        notFound.push(course.name)
      }
    }

    return NextResponse.json({ ok: true, updated, notFound })
  } catch (err: any) {
    console.error('[upload-schedule] Error:', err)
    return NextResponse.json({ error: err?.message ?? 'Error interno del servidor' }, { status: 500 })
  }
}
