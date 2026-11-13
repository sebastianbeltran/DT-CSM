import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { data, error } = await supabase
    .from('period_competencies')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// Elimina una competencia del periodo.
// - Con ?mergeInto=<id>: mueve sus evaluaciones (y por tanto sus notas) a esa otra competencia.
// - Sin mergeInto: elimina también sus evaluaciones y las notas asociadas.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const mergeInto = new URL(req.url).searchParams.get('mergeInto')

  const { data: pc, error: pcErr } = await supabase
    .from('period_competencies')
    .select('*')
    .eq('id', params.id)
    .single()
  if (pcErr || !pc) return NextResponse.json({ error: 'Competencia no encontrada' }, { status: 404 })

  const { count } = await supabase
    .from('period_competencies')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', pc.period_id)
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'El periodo debe tener al menos una competencia.' }, { status: 400 })
  }

  const { data: cols, error: colsErr } = await supabase
    .from('grade_columns')
    .select('id, sort_order')
    .eq('period_id', pc.period_id)
    .eq('competency_key', pc.competency_key)
    .order('sort_order')
  if (colsErr) return NextResponse.json({ error: colsErr.message }, { status: 400 })

  let moved = 0
  let deleted = 0

  if (mergeInto) {
    const { data: target, error: tErr } = await supabase
      .from('period_competencies')
      .select('*')
      .eq('id', mergeInto)
      .single()
    if (tErr || !target) return NextResponse.json({ error: 'Competencia destino no encontrada' }, { status: 404 })
    if (target.period_id !== pc.period_id || target.id === pc.id) {
      return NextResponse.json({ error: 'La competencia destino debe ser otra del mismo periodo.' }, { status: 400 })
    }

    // Registrar la fusión primero: si falla (p. ej. falta la columna merged_from), no se mueve nada.
    const mergedFrom = [
      ...(target.merged_from ?? []),
      { competency_key: pc.competency_key, learning_objective: pc.learning_objective ?? null },
      ...(pc.merged_from ?? []),
    ]
    const { error: mfErr } = await supabase
      .from('period_competencies')
      .update({ merged_from: mergedFrom })
      .eq('id', target.id)
    if (mfErr) return NextResponse.json({ error: `No se pudo registrar la fusión: ${mfErr.message}` }, { status: 400 })

    // Colocar las evaluaciones movidas después de las existentes en el destino
    const { data: targetCols } = await supabase
      .from('grade_columns')
      .select('sort_order')
      .eq('period_id', pc.period_id)
      .eq('competency_key', target.competency_key)
    const base = (targetCols ?? []).reduce((m, c) => Math.max(m, c.sort_order ?? 0), -1) + 1

    const toMove = cols ?? []
    for (let i = 0; i < toMove.length; i++) {
      const col = toMove[i]
      const { error } = await supabase
        .from('grade_columns')
        .update({ competency_key: target.competency_key, sort_order: base + i })
        .eq('id', col.id)
      if (error) return NextResponse.json({ error: error.message, moved }, { status: 400 })
      moved++
    }
  } else if (cols && cols.length > 0) {
    const { error } = await supabase
      .from('grade_columns')
      .delete()
      .in('id', cols.map((c) => c.id))
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    deleted = cols.length
  }

  const { error: delErr } = await supabase.from('period_competencies').delete().eq('id', pc.id)
  if (delErr) return NextResponse.json({ error: delErr.message, moved, deleted }, { status: 400 })

  // Al fusionar, la competencia destino acumula sumativas de dos competencias; para que no
  // pese más que las otras, las competencias restantes quedan en partes iguales (peso manual).
  if (mergeInto) {
    const { data: remaining } = await supabase
      .from('period_competencies')
      .select('id')
      .eq('period_id', pc.period_id)
    const n = remaining?.length ?? 0
    if (n > 0) {
      const equal = Math.round(10000 / n) / 10000
      const { error } = await supabase
        .from('period_competencies')
        .update({ manual_weight: equal })
        .eq('period_id', pc.period_id)
      if (error) return NextResponse.json({ error: `Fusión hecha, pero no se pudieron igualar los pesos: ${error.message}`, moved }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true, moved, deleted })
}
