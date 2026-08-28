export const COMPETENCY_KEYS = ['CTP', 'CC', 'CTT'] as const
export type CompetencyKey = typeof COMPETENCY_KEYS[number]

export const COMPETENCIES: Record<CompetencyKey, {
  key: CompetencyKey
  name: string
  short: string
  bgColor: string
  textColor: string
  borderColor: string
}> = {
  CTP: {
    key: 'CTP',
    name: 'Computational Thinking and Programming',
    short: 'CTP',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-200',
  },
  CC: {
    key: 'CC',
    name: 'Creation and Communication',
    short: 'CC',
    bgColor: 'bg-green-50',
    textColor: 'text-green-800',
    borderColor: 'border-green-200',
  },
  CTT: {
    key: 'CTT',
    name: 'Critical Technological Thinking',
    short: 'CTT',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-800',
    borderColor: 'border-purple-200',
  },
}

export interface ParsedCompetency {
  competency_key: CompetencyKey
  learning_objective: string
  contents: string
}

export interface ParsedSabana {
  grade: string
  trimester: string
  competencies: ParsedCompetency[]
}

function matchCompetencyKey(text: string): CompetencyKey | null {
  const t = text.toLowerCase().trim()
  if (t.startsWith('computational thinking')) return 'CTP'
  if (t.startsWith('creation and communication')) return 'CC'
  if (t.startsWith('critical technological')) return 'CTT'
  return null
}

export function parseSabanaText(text: string): ParsedSabana {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  let grade = ''
  let trimester = ''

  for (const line of lines) {
    // "7° — Trimester 1" or "7° — Semester 1"
    const gradeMatch = line.match(/(\d+)[°º]\s*[—–-]\s*(Trimester|Semester)\s*(\d+)/i)
    if (gradeMatch) {
      grade = gradeMatch[1] + '°'
      trimester = `${gradeMatch[2]} ${gradeMatch[3]}`
      break
    }
    // "7th Grade, Trimester 1" (title format)
    const titleMatch = line.match(/(\d+)(?:th|st|nd|rd)\s+Grade.*?(Trimester|Semester)\s*(\d+)/i)
    if (titleMatch) {
      grade = titleMatch[1] + '°'
      trimester = `${titleMatch[2]} ${titleMatch[3]}`
      break
    }
  }

  const competencies: ParsedCompetency[] = []
  const contentsCandidates: string[] = []

  // Em dash (—), en dash (–), or regular dash preceded by space
  const dashPattern = /\s[—–]\s/

  for (const line of lines) {
    if (dashPattern.test(line)) {
      const dashIdx = line.search(dashPattern)
      const before = line.substring(0, dashIdx).trim()
      const after = line.substring(dashIdx).replace(/^[\s—–]+/, '').trim()

      const key = matchCompetencyKey(before)
      if (key && after.length > 10) {
        if (!competencies.find(c => c.competency_key === key)) {
          competencies.push({ competency_key: key, learning_objective: after, contents: '' })
        }
      }
    } else {
      const isSkippable =
        line.includes('Design & Technology') ||
        line.includes('Grade / Stage') ||
        line.includes('Area Competency') ||
        line.includes('Learning Objectives') ||
        line.includes('Contents') ||
        /^\d+[°º]/.test(line) ||
        /:\s+(Analyzes|Designs|Design|Creates|Evaluates)/.test(line) ||
        line.length < 10
      if (!isSkippable && line.length > 15) {
        contentsCandidates.push(line)
      }
    }
  }

  // Last candidate is the contents line (appears after all objectives in the Word table)
  const contents = contentsCandidates[contentsCandidates.length - 1] ?? ''
  competencies.forEach(c => { c.contents = contents })

  if (competencies.length < 2) {
    throw new Error(
      `Se necesitan mínimo 2 competencias evaluadas. Solo se encontró ${competencies.length}. Verifica que el archivo tenga el formato estándar.`
    )
  }

  return { grade, trimester, competencies }
}
