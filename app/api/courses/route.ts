import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const yearId = searchParams.get('yearId')
  let query = supabase.from('courses').select('*').order('name')
  if (yearId) query = query.eq('school_year_id', yearId)
  const { data } = await query
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { name, school_year_id } = await req.json()
  const { data, error } = await supabase
    .from('courses')
    .insert({ name, school_year_id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
