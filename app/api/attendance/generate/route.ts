import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getColombianHolidays } from '@/lib/colombian-holidays'
import * as XLSX from 'xlsx'

function parseCourseScheduleFromBuffer(buffer: ArrayBuffer, courseName: string): number[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })

  // Columns: 3=Monday(1), 4=Tuesday(2), 5=Wednesday(3), 6=Thursday(4), 7=Friday(5)
  const colToDay: Record<number, number> = { 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 }
  const days = new Set<number>()

  const normalized = courseName.trim().toUpperCase().replace(/\s/g, '').replace(/[°º]/g, '')

  // "PROFUNDIZACIÓN" is the official name for grade 11
  const isGrade11 = ['11', 'ONCE', '11°', '11º'].includes(normalized)

  for (const row of rows) {
    for (const [colStr, dayOfWeek] of Object.entries(colToDay)) {
      const cell = String((row as any)[Number(colStr)] ?? '').trim()
      if (!cell) continue

      const lower = cell.toLowerCase()

      // Skip non-class rows
      if (['recreo', 'almuerzo', 'd.g', 'salida'].some(s => lower.startsWith(s))) continue

      // Skip PROYECTO entries (shared classes with other teachers, including PROYECTO 11°)
      if (/^proy/i.test(cell)) continue

      const firstLine = cell.split(/[\r\n(]/)[0].trim().toUpperCase()

      // Match grade 11 by "PROFUNDIZACIÓN"
      if (isGrade11 && firstLine.includes('PROFUNDIZACIÓN')) {
        days.add(dayOfWeek)
        continue
      }

      // Match other courses by name
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
    const courseId = formData.get('courseId') as string
    const courseName = formData.get('courseName') as string
    const startDate = formData.get('startDate') as string
    const endDate = formData.get('endDate') as string

    if (!courseId || !startDate || !endDate) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    let classDays: number[]

    if (file) {
      const buffer = await file.arrayBuffer()
      classDays = parseCourseScheduleFromBuffer(buffer, courseName)

      console.log(`[generate] course="${courseName}" → días detectados: ${JSON.stringify(classDays)}`)

      if (classDays.length === 0) {
        return NextResponse.json({
          error: `No se encontró "${courseName}" en el horario. Asegúrate de que el nombre del curso en la app coincida exactamente con el del archivo Excel (ej: "10A", "11").`,
        }, { status: 404 })
      }

      // Persist class_days so future generates don't need the file
      await supabase.from('courses').update({ class_days: classDays }).eq('id', courseId)
    } else {
      const { data: course } = await supabase.from('courses').select('class_days').eq('id', courseId).single()
      if (!course?.class_days || course.class_days.length === 0) {
        return NextResponse.json({ error: 'No hay horario guardado para este curso. Sube el archivo de horario la primera vez.' }, { status: 400 })
      }
      classDays = course.class_days
      console.log(`[generate] course="${courseName}" → usando días guardados: ${JSON.stringify(classDays)}`)
    }

    const start = new Date(startDate + 'T12:00:00')
    const end = new Date(endDate + 'T12:00:00')

    const holidays = new Set<string>()
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      getColombianHolidays(y).forEach((h) => holidays.add(h))
    }

    const sessions: { course_id: string; session_date: string; status: string }[] = []
    const current = new Date(start)

    while (current <= end) {
      const dayOfWeek = current.getDay()
      const dateStr = current.toISOString().split('T')[0]
      if (classDays.includes(dayOfWeek)) {
        sessions.push({
          course_id: courseId,
          session_date: dateStr,
          status: holidays.has(dateStr) ? 'holiday' : 'normal',
        })
      }
      current.setDate(current.getDate() + 1)
    }

    if (sessions.length === 0) {
      return NextResponse.json({ error: 'No se generaron sesiones. Verifica el rango de fechas.' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]
    const pastSessions = sessions.filter((s) => s.session_date < today)
    const futureSessions = sessions.filter((s) => s.session_date >= today)

    // Delete empty sessions before the new start date (they were never used, clean slate)
    const { data: beforeStart } = await supabase
      .from('schedule_sessions')
      .select('id, attendance_records(id)')
      .eq('course_id', courseId)
      .lt('session_date', startDate)

    const emptyBeforeStart = (beforeStart ?? [])
      .filter((s: any) => s.attendance_records.length === 0)
      .map((s: any) => s.id)

    if (emptyBeforeStart.length > 0) {
      await supabase.from('schedule_sessions').delete().in('id', emptyBeforeStart)
    }

    // Past sessions: only add missing ones, never touch existing
    if (pastSessions.length > 0) {
      const { error } = await supabase
        .from('schedule_sessions')
        .upsert(pastSessions, { onConflict: 'course_id,session_date', ignoreDuplicates: true })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Future sessions: remove empty ones (no attendance), then insert new schedule
    if (futureSessions.length > 0) {
      const { data: existingFuture } = await supabase
        .from('schedule_sessions')
        .select('id, attendance_records(id)')
        .eq('course_id', courseId)
        .gte('session_date', today)

      const emptyIds = (existingFuture ?? [])
        .filter((s: any) => s.attendance_records.length === 0)
        .map((s: any) => s.id)

      if (emptyIds.length > 0) {
        await supabase.from('schedule_sessions').delete().in('id', emptyIds)
      }

      const { error } = await supabase
        .from('schedule_sessions')
        .upsert(futureSessions, { onConflict: 'course_id,session_date', ignoreDuplicates: true })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      total: sessions.length,
      normal: sessions.filter((s) => s.status === 'normal').length,
      holidays: sessions.filter((s) => s.status === 'holiday').length,
      days: classDays,
    })
  } catch (err: any) {
    console.error('[generate] Error:', err)
    return NextResponse.json({ error: err?.message ?? 'Error interno del servidor' }, { status: 500 })
  }
}
