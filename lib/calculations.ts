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

  // For sumativa and bonus always use criteria sum; for formativa use it if criteria exist
  if (column.type === 'sumativa' || column.type === 'bonus') {
    const total = computeCriteriaTotal(grade.id, criterionGrades)
    return total > 0 ? total : grade.score ?? null
  }

  if (column.type === 'formativa') {
    const total = computeCriteriaTotal(grade.id, criterionGrades)
    if (total > 0) return total
    return grade.score ?? null
  }

  return grade.score ?? null
}

// Calculates weighted grade for a set of columns (used per-competency and for bonus)
export function computeWeightedGrade(
  studentId: string,
  columns: GradeColumn[],
  grades: Grade[],
  criterionGrades: CriterionGrade[],
  weights: { formativa: number; sumativa: number },
  bonusCap: number
): number | null {
  const formativas = columns.filter((c) => c.type === 'formativa')
  const sumativas = columns.filter((c) => c.type === 'sumativa')
  const bonuses = columns.filter((c) => c.type === 'bonus')

  const avgGroup = (cols: GradeColumn[]) => {
    const scores = cols
      .map((c) => getStudentScore(studentId, c, grades, criterionGrades))
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
  const totalBonus = bonusScores.reduce((a, b) => a + b, 0)
  const cappedBonus = Math.min(totalBonus, bonusCap)

  const final = Math.min(base + cappedBonus, 10)
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
  return computeWeightedGrade(studentId, columns, grades, criterionGrades, weights, bonusCap)
}

// Grade for a single competency (its columns only)
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
  return computeWeightedGrade(studentId, cols, grades, criterionGrades, weights, bonusCap)
}

// Period final = weighted average of per-competency grades
// Weights: manual_weight if set, else proportional to sumativa count
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

  // Bonus columns (no competency) are added to every competency's pool
  const bonusColumns = columns.filter(c => c.type === 'bonus' && !c.competency_key)

  const entries: { grade: number | null; weight: number }[] = periodCompetencies.map(pc => {
    const pcCols = [
      ...columns.filter(c => c.competency_key === pc.competency_key),
      ...bonusColumns,
    ]
    const grade = computeWeightedGrade(studentId, pcCols, grades, criterionGrades, weights, bonusCap)

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
