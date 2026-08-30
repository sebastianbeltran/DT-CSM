-- ============================================================
-- DT CSM Grade Management App — Supabase Schema
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- School years (contenedores de año escolar)
CREATE TABLE IF NOT EXISTS school_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Courses (cursos por año)
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade_weights JSONB NOT NULL DEFAULT '{"formativa": 40, "sumativa": 60}',
  bonus_cap NUMERIC(4,1) NOT NULL DEFAULT 10.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_year_id, name)
);

-- Students (estudiantes por curso)
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  archive_reason TEXT,
  archived_at TIMESTAMPTZ,
  previous_course_id UUID REFERENCES courses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Periods (periodos por curso)
CREATE TABLE IF NOT EXISTS periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  grade_weights JSONB,
  bonus_cap NUMERIC(4,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DT Phases (deprecated — kept for backwards compatibility)
CREATE TABLE IF NOT EXISTS phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Period competencies (competencias evaluadas en cada periodo)
CREATE TABLE IF NOT EXISTS period_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  competency_key TEXT NOT NULL CHECK (competency_key IN ('CTP', 'CC', 'CTT')),
  learning_objective TEXT NOT NULL,
  contents TEXT,
  manual_weight NUMERIC(6,4),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(period_id, competency_key)
);

-- Grade columns (columnas de nota)
CREATE TABLE IF NOT EXISTS grade_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES phases(id) ON DELETE CASCADE,
  competency_key TEXT CHECK (competency_key IN ('CTP', 'CC', 'CTT')),
  period_id UUID REFERENCES periods(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('formativa', 'sumativa', 'bonus')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  has_grades BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evaluation criteria (criterios de evaluación para sumativas)
CREATE TABLE IF NOT EXISTS criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id UUID NOT NULL REFERENCES grade_columns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  max_score NUMERIC(4,1) NOT NULL,
  levels JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grades (notas de estudiantes)
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES grade_columns(id) ON DELETE CASCADE,
  score NUMERIC(5,2),
  is_manually_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
  group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, column_id)
);

-- Criterion grades (puntajes por criterio en sumativas)
CREATE TABLE IF NOT EXISTS criterion_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(grade_id, criterion_id)
);

-- Work groups (grupos de trabajo)
CREATE TABLE IF NOT EXISTS work_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES work_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, student_id)
);

-- Schedule sessions (sesiones de clase programadas)
CREATE TABLE IF NOT EXISTS schedule_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'holiday', 'cancelled')),
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, session_date)
);

-- Attendance records (registros de inasistencia — solo se registra quien faltó)
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

-- Color ranges (semáforo visual configurable)
CREATE TABLE IF NOT EXISTS color_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  period_id UUID REFERENCES periods(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  min_score NUMERIC(4,1) NOT NULL,
  max_score NUMERIC(4,1) NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reports (informes narrativos generados con IA)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, period_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id) WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS idx_courses_year ON courses(school_year_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_column ON grades(column_id);
CREATE INDEX IF NOT EXISTS idx_criterion_grades_grade ON criterion_grades(grade_id);
CREATE INDEX IF NOT EXISTS idx_periods_course ON periods(course_id);
CREATE INDEX IF NOT EXISTS idx_phases_period ON phases(period_id);
CREATE INDEX IF NOT EXISTS idx_period_competencies_period ON period_competencies(period_id);
CREATE INDEX IF NOT EXISTS idx_columns_phase ON grade_columns(phase_id);
CREATE INDEX IF NOT EXISTS idx_columns_competency ON grade_columns(competency_key);
CREATE INDEX IF NOT EXISTS idx_columns_period ON grade_columns(period_id);
CREATE INDEX IF NOT EXISTS idx_criteria_column ON criteria(column_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_course_date ON schedule_sessions(course_id, session_date);
CREATE INDEX IF NOT EXISTS idx_reports_student ON reports(student_id);
CREATE INDEX IF NOT EXISTS idx_color_ranges_course ON color_ranges(course_id);
CREATE INDEX IF NOT EXISTS idx_wgm_group ON work_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_wgm_student ON work_group_members(student_id);

-- Disable RLS (app uses service role key, single-user)
ALTER TABLE school_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE periods DISABLE ROW LEVEL SECURITY;
ALTER TABLE phases DISABLE ROW LEVEL SECURITY;
ALTER TABLE period_competencies DISABLE ROW LEVEL SECURITY;
ALTER TABLE grade_columns DISABLE ROW LEVEL SECURITY;
ALTER TABLE criteria DISABLE ROW LEVEL SECURITY;
ALTER TABLE grades DISABLE ROW LEVEL SECURITY;
ALTER TABLE criterion_grades DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_group_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE color_ranges DISABLE ROW LEVEL SECURITY;
ALTER TABLE reports DISABLE ROW LEVEL SECURITY;
