import { NextResponse } from 'next/server'
import { parseSabanaText } from '@/lib/competencies'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 })

    const mammoth = require('mammoth')
    const buffer = Buffer.from(await file.arrayBuffer())
    const { value: text } = await mammoth.extractRawText({ buffer })

    const parsed = parseSabanaText(text)
    return NextResponse.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar el archivo.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
