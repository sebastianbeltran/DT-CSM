// Utilidades para intercambiar notas con Phidias.
// - Lee la plantilla que entrega Phidias (".xls" que en realidad es una tabla HTML en Latin-1).
// - Empareja estudiantes por nombre normalizado (nunca adivina).
// - Construye el CSV de importación y lo codifica en Windows-1252 / Latin-1.

export type PhidiasEncoding = 'windows-1252' | 'latin1'
export type PhidiasDelimiter = ',' | ';'

export const PHIDIAS_DEFAULTS = {
  delimiter: ',' as PhidiasDelimiter,
  encoding: 'windows-1252' as PhidiasEncoding,
}

export interface PhidiasRow {
  ref: string
  name: string
}

// ─── Normalización de nombres ────────────────────────────────────────────────

/** "ÁLVAREZ ESPITIA, ISABELLA" y "Álvarez Espitia Isabella" → "alvarez espitia isabella" */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nombre de la app ("APELLIDOS, NOMBRES") → formato Phidias ("Apellidos Nombres", sin coma). */
export function toPhidiasName(appName: string): string {
  return appName
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es')
    .split(' ')
    .map((w) => w.split('-').map((p) => p.charAt(0).toLocaleUpperCase('es') + p.slice(1)).join('-'))
    .join(' ')
}

// ─── Lectura de la plantilla de Phidias ──────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return NAMED_ENTITIES[code] ?? m
  })
}

/** Decodifica bytes: UTF-8 si es válido, si no Windows-1252 (lo que entrega Phidias). */
export function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/**
 * Extrae (Referencia, Estudiante) de la plantilla de Phidias.
 * Ignora cualquier otra columna (ej. "Nombre de evaluación 1").
 */
export function parsePhidiasTemplate(bytes: Uint8Array): PhidiasRow[] {
  const text = decodeBytes(bytes)
  if (!/<table/i.test(text)) {
    throw new Error('El archivo no parece ser una plantilla de Phidias (no contiene una tabla). Descárgala de nuevo desde Phidias.')
  }

  const rows: string[][] = []
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let tr: RegExpExecArray | null
  while ((tr = trRe.exec(text))) {
    const cells: string[] = []
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
    let td: RegExpExecArray | null
    while ((td = tdRe.exec(tr[1]))) {
      cells.push(decodeEntities(td[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    }
    rows.push(cells)
  }

  const headerIdx = rows.findIndex((r) => r.some((c) => normalizeName(c) === 'referencia'))
  if (headerIdx === -1) throw new Error('No se encontró la columna "Referencia" en el archivo.')
  const header = rows[headerIdx].map(normalizeName)
  const refCol = header.indexOf('referencia')
  const nameCol = header.indexOf('estudiante')
  if (nameCol === -1) throw new Error('No se encontró la columna "Estudiante" en el archivo.')

  const out: PhidiasRow[] = []
  for (const r of rows.slice(headerIdx + 1)) {
    const ref = (r[refCol] ?? '').trim()
    const name = (r[nameCol] ?? '').trim()
    if (!ref && !name) continue
    if (!ref || !name) throw new Error(`Fila incompleta en el archivo: "${r.join(' | ')}"`)
    out.push({ ref, name })
  }
  if (out.length === 0) throw new Error('El archivo no contiene estudiantes.')

  const seen = new Map<string, string>()
  for (const row of out) {
    if (seen.has(row.ref)) throw new Error(`La referencia ${row.ref} aparece dos veces en el archivo (${seen.get(row.ref)} y ${row.name}).`)
    seen.set(row.ref, row.name)
  }
  return out
}

// ─── Emparejamiento ──────────────────────────────────────────────────────────

export interface MatchResult {
  matched: { studentId: string; appName: string; ref: string; phidiasName: string }[]
  unmatchedApp: { studentId: string; appName: string; reason: 'sin-coincidencia' | 'nombre-repetido' }[]
  unmatchedPhidias: { ref: string; phidiasName: string; reason: 'sin-coincidencia' | 'nombre-repetido' }[]
}

/** Solo empareja coincidencias exactas (normalizadas) y únicas en ambos lados. */
export function matchStudents(students: { id: string; name: string }[], rows: PhidiasRow[]): MatchResult {
  const appByKey = new Map<string, { id: string; name: string }[]>()
  for (const s of students) {
    const k = normalizeName(s.name)
    appByKey.set(k, [...(appByKey.get(k) ?? []), s])
  }
  const phByKey = new Map<string, PhidiasRow[]>()
  for (const r of rows) {
    const k = normalizeName(r.name)
    phByKey.set(k, [...(phByKey.get(k) ?? []), r])
  }

  const result: MatchResult = { matched: [], unmatchedApp: [], unmatchedPhidias: [] }

  for (const s of students) {
    const k = normalizeName(s.name)
    const app = appByKey.get(k)!
    const ph = phByKey.get(k) ?? []
    if (app.length === 1 && ph.length === 1) {
      result.matched.push({ studentId: s.id, appName: s.name, ref: ph[0].ref, phidiasName: ph[0].name })
    } else {
      result.unmatchedApp.push({
        studentId: s.id,
        appName: s.name,
        reason: app.length > 1 || ph.length > 1 ? 'nombre-repetido' : 'sin-coincidencia',
      })
    }
  }
  for (const r of rows) {
    const k = normalizeName(r.name)
    const app = appByKey.get(k) ?? []
    const ph = phByKey.get(k)!
    if (!(app.length === 1 && ph.length === 1)) {
      result.unmatchedPhidias.push({
        ref: r.ref,
        phidiasName: r.name,
        reason: app.length > 1 || ph.length > 1 ? 'nombre-repetido' : 'sin-coincidencia',
      })
    }
  }
  return result
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** Escapa un campo según RFC 4180: entre comillas si tiene separador, comillas o saltos de línea. */
export function csvField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || /["\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

export function buildCsv(rows: string[][], delimiter: string): string {
  return rows.map((r) => r.map((c) => csvField(c, delimiter)).join(delimiter)).join('\r\n') + '\r\n'
}

/** Siempre a un decimal: 8.75 → "8.8", 8.33 → "8.3", 8 → "8". Punto decimal. */
export function formatScore(score: number): string {
  // Primero a centésimas enteras para evitar errores de coma flotante (8.45 → 8.5, no 8.4)
  const hundredths = Math.round(score * 100)
  return String(Math.round(hundredths / 10) / 10)
}

// Caracteres extra de Windows-1252 en el rango 0x80–0x9F
const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}

export interface EncodeProblem {
  char: string
  context: string
}

/** Codifica el texto. Si algún carácter no existe en la codificación, lo reporta en vez de corromperlo. */
export function encodeText(
  text: string,
  encoding: PhidiasEncoding
): { bytes: Uint8Array; problems: EncodeProblem[] } {
  const bytes: number[] = []
  const problems: EncodeProblem[] = []
  const lines = text.split('\r\n')
  for (const line of lines.length > 1 ? lines.slice(0, -1) : lines) {
    for (const ch of line.normalize('NFC')) {
      const cp = ch.codePointAt(0)!
      let b: number | undefined
      if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) b = cp
      else if (encoding === 'windows-1252') b = CP1252_EXTRA[cp]
      else if (cp >= 0x80 && cp <= 0x9f) b = cp
      if (b === undefined) {
        if (!problems.some((p) => p.char === ch && p.context === line)) problems.push({ char: ch, context: line })
      } else {
        bytes.push(b)
      }
    }
    bytes.push(0x0d, 0x0a)
  }
  return { bytes: Uint8Array.from(bytes), problems }
}

export function safeFilePart(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// ─── Lectura de la tabla de notas copiada desde Phidias ──────────────────────
//
// Estructura (copiada desde la vista de una competencia en Phidias):
//   Estudiante | <Competencia>: <objetivo> 100.00% | Competencia actual | Otros Competencias
//   <Evaluación 1> | <Evaluación 2> | ... | <OTRA COMPETENCIA>: ... | ...
//   Apellidos, Nombres (HIGH SCHOOL: DÉCIMO 10A) | 8 | 7.5 | ... | 8 | 8.2
//   Promedio | ...
// Solo se usan las columnas de evaluaciones; los promedios se ignoran.

export interface PhidiasPastedTable {
  competencyKey: 'CTP' | 'CC' | 'CTT' | null
  competencyText: string
  evaluations: string[]
  students: { name: string; rawName: string; values: (number | null)[] }[]
  unreadableRows: string[]
}

const COMPETENCY_PATTERNS: { key: 'CTP' | 'CC' | 'CTT'; re: RegExp }[] = [
  { key: 'CTP', re: /computational thinking/i },
  { key: 'CC', re: /creation and communication/i },
  { key: 'CTT', re: /critical technological/i },
]

function detectCompetency(text: string): 'CTP' | 'CC' | 'CTT' | null {
  return COMPETENCY_PATTERNS.find((p) => p.re.test(text))?.key ?? null
}

function parseNumber(cell: string): number | null | 'invalid' {
  const t = cell.trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : 'invalid'
}

export function parsePhidiasPaste(text: string): PhidiasPastedTable {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
  const useTabs = text.includes('\t')
  const split = (l: string) => (useTabs ? l.split('\t') : l.trim().split(/\s{2,}/)).map((c) => c.trim())

  const headerIdx = lines.findIndex((l) => /^\s*estudiante\b/i.test(l))
  if (headerIdx === -1) throw new Error('No encontré la fila de encabezado que empieza con "Estudiante". Copia la tabla completa desde Phidias.')
  const headerText = lines[headerIdx]
  const competencyKey = detectCompetency(headerText)
  const competencyText = split(headerText)[1] ?? ''

  // Segunda fila de encabezado: evaluaciones seguidas de las otras competencias
  const sub = split(lines[headerIdx + 1] ?? '').filter((c) => c !== '')
  const evaluations: string[] = []
  for (const c of sub) {
    if (detectCompetency(c) && c.includes(':')) break
    evaluations.push(c)
  }
  if (evaluations.length === 0) throw new Error('No encontré nombres de evaluaciones en la segunda fila del encabezado.')

  const students: PhidiasPastedTable['students'] = []
  const unreadableRows: string[] = []
  for (const line of lines.slice(headerIdx + 2)) {
    const cells = split(line)
    const rawName = cells[0] ?? ''
    if (/^promedio\b/i.test(rawName)) continue
    const name = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const valueCells = cells.slice(1)

    // Sin tabulaciones las celdas vacías se pierden: solo es seguro si viene todo o nada
    if (!useTabs && valueCells.length > 0 && valueCells.length < evaluations.length) {
      unreadableRows.push(rawName)
      continue
    }
    const values: (number | null)[] = []
    let bad = false
    for (let i = 0; i < evaluations.length; i++) {
      const v = parseNumber(valueCells[i] ?? '')
      if (v === 'invalid') bad = true
      values.push(v === 'invalid' ? null : v)
    }
    if (bad || !name) {
      unreadableRows.push(rawName || line)
      continue
    }
    students.push({ name, rawName, values })
  }
  if (students.length === 0) throw new Error('No encontré filas de estudiantes en lo que pegaste.')
  return { competencyKey, competencyText, evaluations, students, unreadableRows }
}
