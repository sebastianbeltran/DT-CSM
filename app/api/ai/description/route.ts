import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const { activity, tool, course, phase, notes, type } = await req.json()

  const prompt = `Eres asistente de un profesor de Design & Technology en un colegio.
Tu tarea es redactar una descripción clara y profesional de una actividad de evaluación.

Datos de la actividad:
- Nombre de la actividad: ${activity}
- Tipo: ${type === 'sumativa' ? 'SUMATIVA (evaluación principal del proceso)' : 'FORMATIVA (evaluación en proceso)'}
- Fase de Design Thinking: ${phase}
- Curso: ${course}
${tool ? `- Herramienta/tema central: ${tool}` : ''}
${notes ? `- Notas del profesor: ${notes}` : ''}

Redacta una descripción genérica de la actividad (no personalizada por estudiante). Debe:
- Ser concisa (2-3 oraciones máx.)
- Mencionar específicamente las herramientas, habilidades o conceptos que se evalúan
- Tener tono profesional docente
- Estar en español
- NO usar la palabra "descripción"

Responde SOLO con la descripción, sin encabezados ni explicaciones adicionales.`

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  return NextResponse.json({ description: text.trim() })
}
