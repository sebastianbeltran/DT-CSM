import type { Grade, GradeColumn, Criterion, CriterionGrade, PeriodCompetency } from './types'

export function computeCriteriaTotal(
  gradeId: string,
  criterionGrades: CriterionGrade[]
): number {
  const mine = criterionGrades.filter((cg) => cg.grade_id === gradeId)
  return mine.reduce((sum, cg) => sum + Number(cg.score), 0)
}

export function getStudentScore(
  studentId: string,
  column: GradeColumn,
  grades: Grade[],
  criterionGrades: CriterionGrade[]
): number | null {
  const grade = grades.find(
    (g) => g.student_id === studentId && g.column_id === column.id
  )
  if (!grade) return null

  // Ajuste con Phidias: la nota elegida manda; la rúbrica se conserva intacta.
  if (grade.phidias_score !== null && grade.phidias_score !== undefined) {
    return Number(grade.phidias_score)
  }

  let score: number | null = null

  if (column.type === 'sumativa' || column.type === 'bonus') {
    const total = computeCriteriaTotal(grade.id, criterionGrades)
    score = total > 0 ? total : grade.score ?? null
  } else if (column.type === 'formativa') {
    const total = computeCriteriaTotal(grade.id, criterionGrades)
    score = total > 0 ? total : grade.score ?? null
  } else {
    score = grade.score ?? null
  }

  if (score === null) return null
  // entrega columns can legitimately be 0 (not delivered); all others enforce min 1
  if (column.type === 'entrega') return score
  return Math.max(1, score)
}

// ─── Bono ────────────────────────────────────────────────────────────────────
// El bono global (columnas bonus/entrega sin competencia, ej. "Diagnostic Test") se suma
// a la EVALUACIÓN con la nota más baja del estudiante, no a una competencia.

export interface BonusPlacement {
  columnId: string
  points: number // puntos que se suman
  baseScore: number // nota de la evaluación antes del bono
}

const isGlobalBonus = (c: GradeColumn) => (c.type === 'bonus' || c.type === 'entrega') && !c.competency_key

export function getBonusPlacement(
  studentId: string,
  columns: GradeColumn[],
  grades: Grade[],
  criterionGrades: CriterionGrade[],
  bonusCap: number
): BonusPlacement | null {
  const bonusScores = columns
    .filter(isGlobalBonus)
    .map((c) => getStudentScore(studentId, c, grades, criterionGrades))
    .filter((s): s is number => s !== null)
  if (bonusScores.length === 0 || !(bonusCap > 0)) return null

  // Si el estudiante ya tiene una nota ajustada con Phidias en el periodo, esa nota es la
  // versión final aceptada y ya incluye el bono: no se vuelve a sumar.
  const periodColumnIds = new Set(columns.map((c) => c.id))
  const hasPhidiasAdjustment = grades.some(
    (g) => g.student_id === studentId && periodColumnIds.has(g.column_id) && g.phidias_score != null
  )
  if (hasPhidiasAdjustment) return null

  const avg = bonusScores.reduce((a, b) => a + b, 0) / bonusScores.length
  const points = Math.round((avg / 10) * bonusCap * 100) / 100
  if (points <= 0) return null

  // Evaluación más baja entre las de competencias (empate: la primera en orden)
  let best: BonusPlacement | null = null
  for (const c of columns) {
    if (!c.competency_key || (c.type !== 'formativa' && c.type !== 'sumativa')) continue
    const s = getStudentScore(studentId, c, grades, criterionGrades)
    if (s === null) continue
    if (!best || s < best.baseScore) best = { columnId: c.id, points, baseScore: s }
  }
  return best
}

/** Nota de la evaluación incluyendo el bono si esta es la que lo recibe (máx. 10). */
export function getScoreWithBonus(
  studentId: string,
  column: GradeColumn,
  grades: Grade[],
  criterionGrades: CriterionGrade[],
  placement: BonusPlacement | null
): number | null {
  const s = getStudentScore(studentId, column, grades, criterionGrades)
  if (s === null || !placement || placement.columnId !== column.id) return s
  return Math.min(10, Math.round((s + placement.points) * 100) / 100)
}

// Calculates weighted grade for a set of columns (used per-competency)
export function computeWeightedGrade(
  studentId: string,
  columns: GradeColumn[],
  grades: Grade[],
  criterionGrades: CriterionGrade[],
  weights: { formativa: number; sumativa: number },
  bonusCap: number,
  placement: BonusPlacement | null = null
): number | null {
  const formativas = columns.filter((c) => c.type === 'formativa')
  const sumativas = columns.filter((c) => c.type === 'sumativa')
  // Bonos propios de una competencia (el bono global va por `placement`)
  const bonuses = columns.filter((c) => (c.type === 'bonus' || c.type === 'entrega') && c.competency_key)

  const avgGroup = (cols: GradeColumn[]) => {
    const scores = cols
      .map((c) => getScoreWithBonus(studentId, c, grades, criterionGrades, placement))
      .filter((s): s is number => s !== null)
    if (scores.length === 0) return null
    return scores.reduce((a, b) => a + b, 0) / scores.length
  }

  const avgF = avgGroup(formativas)
  const avgS = avgGroup(sumativas)

  if (avgF === null && avgS === null) return null

  let base = 0
  let totalWeight = 0

  if (avgF !== null) {
    base += avgF * (weights.formativa / 100)
    totalWeight += weights.formativa / 100
  }
  if (avgS !== null) {
    base += avgS * (weights.sumativa / 100)
    totalWeight += weights.sumativa / 100
  }

  if (totalWeight > 0) base = base / totalWeight

  const bonusScores = bonuses
    .map((c) => getStudentScore(studentId, c, grades, criterionGrades))
    .filter((s): s is number => s !== null)

  let proportionalBonus = 0
  if (bonusScores.length > 0) {
    const avg = bonusScores.reduce((a, b) => a + b, 0) / bonusScores.length
    proportionalBonus = Math.round((avg / 10) * bonusCap * 100) / 100
  }

  const final = Math.min(base + proportionalBonus, 10)
  return Math.round(final * 100) / 100
}

// Legacy alias (used by components that pass all period columns at once)
export function computePeriodFinal(
  studentId: string,
  columns: GradeColumn[],
  grades: Grade[],
  criterionGrades: CriterionGrade[],
  weights: { formativa: number; sumativa: number },
  bonusCap: number
): number | null {
  const placement = getBonusPlacement(studentId, columns, grades, criterionGrades, bonusCap)
  return computeWeightedGrade(studentId, columns, grades, criterionGrades, weights, bonusCap, placement)
}

// Grade for a single competency. `columns` = todas las del periodo (para ubicar el bono).
export function computeCompetencyGrade(
  studentId: string,
  competencyKey: string,
  columns: GradeColumn[],
  grades: Grade[],
  criterionGrades: CriterionGrade[],
  weights: { formativa: number; sumativa: number },
  bonusCap: number
): number | null {
  const cols = columns.filter(c => c.competency_key === competencyKey)
  if (cols.length === 0) return null
  const placement = getBonusPlacement(studentId, columns, grades, criterionGrades, bonusCap)
  return computeWeightedGrade(studentId, cols, grades, criterionGrades, weights, bonusCap, placement)
}

// Per-competency grades; el bono ya va dentro de la evaluación más baja
export function computeCompetencyGradesWithBonus(
  studentId: string,
  periodCompetencies: PeriodCompetency[],
  columns: GradeColumn[],
  grades: Grade[],
  criterionGrades: CriterionGrade[],
  weights: { formativa: number; sumativa: number },
  bonusCap: number
): Record<string, number | null> {
  const placement = getBonusPlacement(studentId, columns, grades, criterionGrades, bonusCap)
  const result: Record<string, number | null> = {}
  for (const pc of periodCompetencies) {
    const pcCols = columns.filter(c => c.competency_key === pc.competency_key)
    result[pc.competency_key] = computeWeightedGrade(
      studentId, pcCols, grades, criterionGrades, weights, bonusCap, placement
    )
  }
  return result
}

// Period final = weighted average of per-competency grades
export function computePeriodFinalFromCompetencies(
  studentId: string,
  periodCompetencies: PeriodCompetency[],
  columns: GradeColumn[],
  grades: Grade[],
  criterionGrades: CriterionGrade[],
  weights: { formativa: number; sumativa: number },
  bonusCap: number
): number | null {
  if (periodCompetencies.length === 0) return null

  const competencyGrades = computeCompetencyGradesWithBonus(
    studentId, periodCompetencies, columns, grades, criterionGrades, weights, bonusCap
  )

  const entries = periodCompetencies.map(pc => {
    const grade = competencyGrades[pc.competency_key]
    let weight: number
    if (pc.manual_weight !== null && pc.manual_weight !== undefined) {
      weight = Number(pc.manual_weight)
    } else {
      const sumativaCount = columns.filter(
        c => c.competency_key === pc.competency_key && c.type === 'sumativa'
      ).length
      weight = Math.max(sumativaCount, 1)
    }
    return { grade, weight }
  })

  const withGrades = entries.filter(e => e.grade !== null)
  if (withGrades.length === 0) return null

  const totalWeight = withGrades.reduce((s, e) => s + e.weight, 0)
  if (totalWeight === 0) return null

  const weightedSum = withGrades.reduce((s, e) => s + e.grade! * e.weight, 0)
  return Math.round((weightedSum / totalWeight) * 100) / 100
}

export function getColorForGrade(
  grade: number | null,
  colorRanges: { min_score: number; max_score: number; color: string }[]
): string {
  if (grade === null) return 'transparent'
  const range = colorRanges.find(
    (r) => grade >= r.min_score && grade <= r.max_score
  )
  return range?.color ?? 'transparent'
}
