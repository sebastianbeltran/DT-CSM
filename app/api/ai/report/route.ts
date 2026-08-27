import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ColumnData {
  name: string
  description: string
  phase: string
  type: string
  score: number | null
  criteria?: { name: string; max_score: number; earned: number }[]
}

export async function POST(req: Request) {
  const {
    studentName,
    courseName,
    periodName,
    columns,
    finalGrade,
    absences,
    totalSessions,
  }: {
    studentName: string
    courseName: string
    periodName: string
    columns: ColumnData[]
    finalGrade: number | null
    absences: number
    totalSessions: number
  } = await req.json()

  const phaseGroups: Record<string, ColumnData[]> = {}
  for (const col of columns) {
    if (!phaseGroups[col.phase]) phaseGroups[col.phase] = []
    phaseGroups[col.phase].push(col)
  }

  const buildPhaseText = (phase: string, cols: ColumnData[]) => {
    if (cols.length === 0) return ''
    let text = `\nFase ${phase}:\n`
    for (const col of cols) {
      text += `  - ${col.name} (${col.type}): `
      if (col.type === 'sumativa' && col.criteria && col.criteria.length > 0) {
        text += `nota ${col.score ?? 'sin calificar'}/10\n`
        for (const c of col.criteria) {
          text += `      Criterio "${c.name}": ${c.earned}/${c.max_score}\n`
        }
      } else {
        text += `${col.score ?? 'sin calificar'}/10. Descripción: ${col.description}\n`
      }
    }
    return text
  }

  let dataText = ''
  for (const [phase, cols] of Object.entries(phaseGroups)) {
    dataText += buildPhaseText(phase, cols)
  }

  const attendanceText =
    totalSessions > 0
      ? `Asistencia: ${totalSessions - absences}/${totalSessions} clases (${absences} falta${absences !== 1 ? 's' : ''}).`
      : ''

  const prompt = `Eres un asistente educativo. Redacta un informe de desempeño para:

Estudiante: ${studentName}
Curso: ${courseName}
Periodo: ${periodName}
Nota final del periodo: ${finalGrade ?? 'pendiente'}
${attendanceText}

Actividades evaluadas durante el periodo:
${dataText}

Instrucciones para el informe:
- Redacta UN SOLO párrafo narrativo, organizado siguiendo las fases de Design Thinking que aparezcan (Empatizar y Definir, Idear, Prototipar, Testear).
- Usa las notas y el desglose de criterios para inferir fortalezas concretas y áreas de mejora ESPECÍFICAS (ej. si un criterio tiene el máximo, menciona esa habilidad particular; si tuvo puntaje bajo en un criterio, menciona que debe reforzarla).
- NO repitas las descripciones de las actividades textualmente. Interprétalas según el desempeño.
- Si hay muchas faltas (>20% de las clases), mencionalo como factor posible sin exagerar.
- Tono profesional, apto para padres y coordinación académica.
- Escribe en español. Máx. 200 palabras.
- NO incluyas encabezados, ni la nota numérica repetida.`

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const report = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  return NextResponse.json({ report })
}
