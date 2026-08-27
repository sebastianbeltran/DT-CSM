import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')
  const { data } = await supabase
    .from('phases')
    .select('*')
    .eq('period_id', periodId!)
    .order('sort_order')
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { period_id, name, sort_order } = await req.json()
  const { data: phase, error } = await supabase
    .from('phases')
    .insert({ period_id, name, sort_order: sort_order ?? 0 })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Default columns for new phase
  await supabase.from('grade_columns').insert([
    { phase_id: phase.id, period_id, name: 'Formativa 1', type: 'formativa', sort_order: 0 },
    { phase_id: phase.id, period_id, name: 'Sumativa 1', type: 'sumativa', sort_order: 1 },
  ])

  return NextResponse.json(phase)
}
