import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { name, member_ids } = await req.json()

  if (name !== undefined) {
    await supabase.from('work_groups').update({ name }).eq('id', params.id)
  }

  if (member_ids !== undefined) {
    await supabase.from('work_group_members').delete().eq('group_id', params.id)
    if (member_ids.length > 0) {
      await supabase.from('work_group_members').insert(
        member_ids.map((sid: string) => ({ group_id: params.id, student_id: sid }))
      )
    }
  }

  const { data } = await supabase
    .from('work_groups')
    .select('*, work_group_members(student_id)')
    .eq('id', params.id)
    .single()
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await supabase.from('work_groups').delete().eq('id', params.id)
  return NextResponse.json({ ok: true })
}
