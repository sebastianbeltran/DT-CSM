import { NextResponse } from 'next/server'

// Phases are deprecated. Periods now use period_competencies.
export async function GET() {
  return NextResponse.json([])
}

export async function POST() {
  return NextResponse.json({ error: 'Las fases están desactivadas. Usa competencias.' }, { status: 410 })
}
