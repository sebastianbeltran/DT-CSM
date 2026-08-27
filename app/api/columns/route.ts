import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const body = await req.json()
  const { data, error } = await supabase.from('grade_columns').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')
  const { data } = await supabase
    .from('grade_columns')
    .select('*')
    .eq('period_id', periodId!)
    .order('sort_order')
  return NextResponse.json(data ?? [])
}
