import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  const { data } = await supabase
    .from('students')
    .select('*')
    .eq('course_id', courseId!)
    .eq('is_archived', true)
    .order('name')
  return NextResponse.json(data ?? [])
}
