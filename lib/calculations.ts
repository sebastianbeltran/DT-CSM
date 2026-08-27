import type { Grade, GradeColumn, Criterion, CriterionGrade, Period } from './types'

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

  if (column.type === 'sumativa' || column.type === 'bonus') {
    const total = computeCriteriaTotal(grade.id, criterionGrades)
    return total > 0 ? total : grade.score ?? null
  }

  return grade.score ?? null
}

export function computePeriodFinal(
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
