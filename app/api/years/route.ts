import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const { name } = await req.json()
  const { data, error } = await supabase.from('school_years').insert({ name }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function GET() {
  const { data } = await supabase.from('school_years').select('*').order('name', { ascending: false })
  return NextResponse.json(data ?? [])
}
