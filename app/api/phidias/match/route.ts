import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parsePhidiasTemplate, matchStudents } from '@/lib/phidias'

// Lee la plantilla de Phidias y empareja sus referencias con los estudiantes activos del curso.
// No escribe nada en la base de datos.
export async function POST(req: Request) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const courseId = fd.get('courseId') as string | null
    if (!file || !courseId) return NextResponse.json({ error: 'Falta el archivo o el curso.' }, { status: 400 })

    const rows = parsePhidiasTemplate(new Uint8Array(await file.arrayBuffer()))

    const { data: students, error } = await supabase
      .from('students')
      .select('id, name')
      .eq('course_id', courseId)
      .eq('is_archived', false)
      .order('sort_order')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ fileRows: rows.length, ...matchStudents(students ?? [], rows) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo leer el archivo.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
