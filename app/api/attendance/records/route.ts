import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const { session_id, student_ids } = await req.json()

  // Replace all absences for this session
  await supabase.from('attendance_records').delete().eq('session_id', session_id)

  if (student_ids && student_ids.length > 0) {
    await supabase.from('attendance_records').insert(
      student_ids.map((sid: string) => ({ session_id, student_id: sid }))
    )
  }

  return NextResponse.json({ ok: true })
}
