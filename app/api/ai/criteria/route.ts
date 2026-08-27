import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const { description, activity, phase, course } = await req.json()

  const prompt = `Eres asistente de un profesor de Design & Technology.
Debes proponer criterios de evaluación para una actividad SUMATIVA.

Actividad: ${activity}
Fase: ${phase}
Curso: ${course}
Descripción de la actividad: ${description}

Define entre 3 y 6 criterios de evaluación. Los puntajes máximos de todos los criterios deben sumar exactamente 10.0.
Cada criterio debe tener un puntaje entero (1, 2, 3...) según su importancia relativa.

Responde SOLO con un JSON válido con esta estructura exacta (sin markdown, sin explicaciones):
[
  { "name": "Nombre del criterio", "max_score": 3 },
  { "name": "Otro criterio", "max_score": 2 }
]

Los max_score deben sumar 10. Usa solo enteros de 1 a 5 por criterio.`

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]'

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    const criteria = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    return NextResponse.json({ criteria })
  } catch {
    return NextResponse.json({ criteria: [] }, { status: 422 })
  }
}
