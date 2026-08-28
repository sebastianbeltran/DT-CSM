export interface SchoolYear {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface Course {
  id: string
  school_year_id: string
  name: string
  grade_weights: { formativa: number; sumativa: number }
  bonus_cap: number
  created_at: string
}

export interface Student {
  id: string
  course_id: string
  name: string
  sort_order: number
  is_archived: boolean
  archive_reason?: string
  archived_at?: string
  previous_course_id?: string
  created_at: string
}

export interface Period {
  id: string
  course_id: string
  name: string
  sort_order: number
  grade_weights?: { formativa: number; sumativa: number }
  bonus_cap?: number
  created_at: string
}

export interface Phase {
  id: string
  period_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface PeriodCompetency {
  id: string
  period_id: string
  competency_key: 'CTP' | 'CC' | 'CTT'
  learning_objective: string
  contents?: string
  manual_weight?: number | null
  sort_order: number
  created_at: string
}

export type GradeColumnType = 'formativa' | 'sumativa' | 'bonus'

export interface GradeColumn {
  id: string
  phase_id?: string
  competency_key?: 'CTP' | 'CC' | 'CTT' | null
  period_id?: string
  name: string
  description?: string
  type: GradeColumnType
  sort_order: number
  has_grades: boolean
  created_at: string
}

export interface Criterion {
  id: string
  column_id: string
  name: string
  max_score: number
  sort_order: number
  created_at: string
}

export interface Grade {
  id: string
  student_id: string
  column_id: string
  score?: number
  is_manually_adjusted: boolean
  group_id?: string
  created_at: string
  updated_at: string
}

export interface CriterionGrade {
  id: string
  grade_id: string
  criterion_id: string
  score: number
  created_at: string
}

export interface WorkGroup {
  id: string
  course_id: string
  name: string
  created_at: string
  members?: Student[]
  work_group_members?: { student_id: string }[]
}

export interface WorkGroupMember {
  id: string
  group_id: string
  student_id: string
}

export interface ScheduleSession {
  id: string
  course_id: string
  session_date: string
  status: 'normal' | 'holiday' | 'cancelled'
  cancellation_reason?: string
  created_at: string
}

export interface AttendanceRecord {
  id: string
  session_id: string
  student_id: string
  created_at: string
}

export interface ColorRange {
  id: string
  course_id: string
  period_id?: string
  label: string
  min_score: number
  max_score: number
  color: string
  sort_order: number
}

export interface Report {
  id: string
  student_id: string
  period_id: string
  content: string
  generated_at: string
  updated_at: string
}

export const DEFAULT_COLOR_RANGES: Omit<ColorRange, 'id' | 'course_id' | 'period_id'>[] = [
  { label: 'En riesgo', min_score: 0, max_score: 6.49, color: '#fca5a5', sort_order: 0 },
  { label: 'En proceso', min_score: 6.5, max_score: 8.0, color: '#fde68a', sort_order: 1 },
  { label: 'Aprobado', min_score: 8.01, max_score: 10.0, color: '#bbf7d0', sort_order: 2 },
]

export interface GradeTableData {
  course: Course
  period: Period
  students: Student[]
  phases: Phase[]
  columns: GradeColumn[]
  criteria: Criterion[]
  grades: Grade[]
  criterionGrades: CriterionGrade[]
  colorRanges: ColorRange[]
}
