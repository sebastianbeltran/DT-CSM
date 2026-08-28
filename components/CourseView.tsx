'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Course, Student, Period, WorkGroup, PeriodCompetency } from '@/lib/types'
import type { ParsedSabana } from '@/lib/competencies'
import { COMPETENCIES } from '@/lib/competencies'
import GradeTable from './GradeTable'

interface CourseViewProps {
  course: Course & { school_years?: { name: string } }
  initialStudents: Student[]
  initialPeriods: Period[]
  initialGroups: WorkGroup[]
}

export default function CourseView({ course, initialStudents, initialPeriods, initialGroups }: CourseViewProps) {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>(initialStudents)
  const [periods, setPeriods] = useState<Period[]>(initialPeriods)
  const [activePeriodId, setActivePeriodId] = useState<string>(initialPeriods[0]?.id ?? '')
  const [showPeriodModal, setShowPeriodModal] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)

  async function createPeriod(name: string, competencies: ParsedSabana['competencies']) {
    try {
      const res = await fetch('/api/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: course.id, name, sort_order: periods.length }),
      })
      if (res.redirected || res.url.includes('/login')) {
        alert('Tu sesión expiró. Recarga la página e inicia sesión de nuevo.')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert('Error al crear el trimestre: ' + (data.error ?? 'Error desconocido'))
        return
      }
      const period = await res.json()

      // Save competencies
      await fetch('/api/period-competencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: period.id, competencies }),
      })

      setPeriods((prev) => [...prev, period])
      setActivePeriodId(period.id)
      setShowPeriodModal(false)
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    }
  }

  async function renamePeriod(id: string, name: string) {
    try {
      await fetch(`/api/periods/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      setPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
    } catch {
      alert('No se pudo guardar el nombre del trimestre. Verifica tu conexión.')
    }
  }

  async function deletePeriod(id: string) {
    if (!confirm('¿Eliminar este trimestre y todas sus notas?')) return
    try {
      const res = await fetch(`/api/periods/${id}`, { method: 'DELETE' })
      if (!res.ok) { alert('Error al eliminar el trimestre.'); return }
      const remaining = periods.filter((p) => p.id !== id)
      setPeriods(remaining)
      if (activePeriodId === id) setActivePeriodId(remaining[0]?.id ?? '')
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    }
  }

  async function archiveStudent(id: string, name: string) {
    if (!confirm(`¿Dar de baja a "${name}"? No aparecerá en la lista activa pero se conserva su historial.`)) return
    try {
      const res = await fetch(`/api/students/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: true, archived_at: new Date().toISOString() }),
      })
      if (!res.ok) { alert('Error al dar de baja a la estudiante.'); return }
      setStudents((prev) => prev.filter((s) => s.id !== id))
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    }
  }

  const activePeriod = periods.find((p) => p.id === activePeriodId)

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
        <button onClick={() => { router.push('/'); router.refresh() }} className="hover:text-blue-600">Inicio</button>
        <span>/</span>
        <span className="font-medium text-gray-800">{course.name}</span>
        {course.school_years && <span className="text-gray-400">({course.school_years.name})</span>}
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <Link
          href={`/courses/${course.id}/attendance`}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Asistencia
        </Link>
        <a
          href={`/api/export/grades?courseId=${course.id}&periodId=${activePeriodId}`}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Exportar Excel
        </a>
        <a
          href={`/api/export/reports?courseId=${course.id}&periodId=${activePeriodId}`}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Exportar Informes
        </a>
        <button
          onClick={() => setShowCopyModal(true)}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ⧉ Copiar estructura desde otro curso
        </button>
      </div>

      {/* Period tabs */}
      <div className="flex items-center gap-1 mb-0 border-b border-gray-200 overflow-x-auto">
        {periods.map((p) => (
          <PeriodTab
            key={p.id}
            period={p}
            isActive={p.id === activePeriodId}
            onClick={() => setActivePeriodId(p.id)}
            onRename={(name) => renamePeriod(p.id, name)}
            onDelete={() => deletePeriod(p.id)}
          />
        ))}

        <button
          onClick={() => setShowPeriodModal(true)}
          className="px-3 py-2 text-sm text-blue-600 hover:text-blue-700 whitespace-nowrap flex-shrink-0"
        >
          + Trimestre
        </button>
      </div>

      {/* Grade table */}
      {activePeriod ? (
        <GradeTable
          course={course}
          period={activePeriod}
          students={students}
          initialGroups={initialGroups.map((g) => ({ ...g, work_group_members: g.work_group_members ?? [] }))}
          onArchiveStudent={archiveStudent}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-3">📋</div>
            <p>Crea un trimestre para comenzar a calificar</p>
            <button
              onClick={() => setShowPeriodModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700"
            >
              + Crear trimestre
            </button>
          </div>
        </div>
      )}

      {showPeriodModal && (
        <PeriodCreateModal
          defaultName={`Trimestre ${periods.length + 1}`}
          onConfirm={createPeriod}
          onClose={() => setShowPeriodModal(false)}
        />
      )}

      {showCopyModal && (
        <CopyStructureModal
          courseId={course.id}
          yearId={course.school_year_id}
          onClose={() => setShowCopyModal(false)}
        />
      )}
    </div>
  )
}

// ─── Period Tab ───────────────────────────────────────────────────────────────

function PeriodTab({
  period,
  isActive,
  onClick,
  onRename,
  onDelete,
}: {
  period: Period
  isActive: boolean
  onClick: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(period.name)

  function save() {
    if (editName.trim()) onRename(editName.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-2 pb-2">
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="border rounded px-2 py-0.5 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button onClick={save} className="text-xs text-blue-600">✓</button>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-1 group cursor-pointer flex-shrink-0 ${
        isActive
          ? 'border-b-2 border-blue-600 text-blue-700'
          : 'text-gray-600 hover:text-gray-800'
      }`}
    >
      <button onClick={onClick} className="px-3 py-2 text-sm font-medium">
        {period.name}
      </button>
      {isActive && (
        <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-blue-600 p-0.5">✎</button>
          <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500 p-0.5">✕</button>
        </div>
      )}
    </div>
  )
}

// ─── Period Create Modal ──────────────────────────────────────────────────────

type ModalStep = 'name' | 'upload' | 'confirm'

function PeriodCreateModal({
  defaultName,
  onConfirm,
  onClose,
}: {
  defaultName: string
  onConfirm: (name: string, competencies: ParsedSabana['competencies']) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = useState<ModalStep>('name')
  const [name, setName] = useState(defaultName)
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParsedSabana | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFileUpload(f: File) {
    setFile(f)
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/sabana', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        alert('Error al leer el archivo: ' + (data.error ?? 'Error desconocido'))
        setParsing(false)
        return
      }
      setParsed(data)
      setStep('confirm')
    } catch {
      alert('No se pudo procesar el archivo. Verifica tu conexión.')
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirm() {
    if (!parsed) return
    setSaving(true)
    await onConfirm(name.trim(), parsed.competencies)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Nuevo trimestre</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Step 1: name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del trimestre *
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && step === 'name' && setStep('upload')}
              placeholder="Ej: Trimestre 1"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Step 2: upload */}
          {(step === 'upload' || step === 'confirm') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Archivo de competencias (.docx) *
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                {parsing ? (
                  <div className="flex flex-col items-center gap-2">
                    <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-sm text-blue-600 font-medium">Leyendo archivo...</p>
                    <p className="text-xs text-gray-400">Extrayendo competencias y objetivos</p>
                  </div>
                ) : file ? (
                  <div className="flex items-center gap-2 justify-center">
                    <span className="text-green-500 text-lg">✓</span>
                    <p className="text-sm text-gray-700">📄 {file.name}</p>
                  </div>
                ) : (
                  <>
                    <p className="text-2xl mb-1">📄</p>
                    <p className="text-sm text-gray-500">Haz clic para seleccionar el archivo Word</p>
                    <p className="text-xs text-gray-400 mt-1">Formato estándar: competencias y objetivos del trimestre</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileUpload(f)
                }}
              />
            </div>
          )}

          {/* Step 3: confirm parsed competencies */}
          {step === 'confirm' && parsed && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Competencias detectadas para <span className="font-bold">{parsed.grade} – {parsed.trimester}</span>:
              </p>
              <div className="space-y-2">
                {parsed.competencies.map((c) => {
                  const meta = COMPETENCIES[c.competency_key]
                  return (
                    <div key={c.competency_key} className={`rounded-xl p-3 ${meta.bgColor} border ${meta.borderColor}`}>
                      <p className={`text-xs font-bold mb-1 ${meta.textColor}`}>{meta.short} — {meta.name}</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{c.learning_objective}</p>
                    </div>
                  )
                })}
              </div>
              {parsed.competencies[0]?.contents && (
                <div className="mt-2 bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Contenidos:</p>
                  <p className="text-xs text-gray-600">{parsed.competencies[0].contents}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>

          {step === 'name' && (
            <button
              onClick={() => name.trim() && setStep('upload')}
              disabled={!name.trim()}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Siguiente →
            </button>
          )}

          {step === 'upload' && (
            <button disabled className="flex-1 py-2.5 bg-gray-200 text-gray-400 rounded-xl text-sm">
              Esperando archivo...
            </button>
          )}

          {step === 'confirm' && (
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creando trimestre...
                </>
              ) : 'Crear trimestre'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Copy Structure Modal ─────────────────────────────────────────────────────

function CopyStructureModal({
  courseId,
  yearId,
  onClose,
}: {
  courseId: string
  yearId: string
  onClose: () => void
}) {
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState(false)

  useState(() => {
    fetch(`/api/courses?yearId=${yearId}`)
      .then((r) => r.json())
      .then((data) => {
        setCourses((data ?? []).filter((c: { id: string }) => c.id !== courseId))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  })

  async function duplicate() {
    if (!selectedSourceId) return
    setCopying(true)
    try {
      const res = await fetch(`/api/courses/${courseId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCourseId: selectedSourceId }),
      })
      const data = await res.json()
      if (res.ok) {
        alert(`✓ Estructura copiada: ${data.columnsAdded} evaluación(es) añadida(s).`)
        onClose()
        window.location.reload()
      } else {
        alert('Error: ' + data.error)
      }
    } catch {
      alert('No se pudo conectar al servidor.')
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold mb-1">Copiar estructura</h2>
        <p className="text-sm text-gray-500 mb-4">
          Copia periodos, competencias y evaluaciones de otro curso. <strong>No copia notas ni estudiantes.</strong>
        </p>
        <div className="space-y-2 mb-5">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Cargando cursos...</p>
          ) : courses.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No hay otros cursos en este año escolar.</p>
          ) : (
            courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedSourceId(c.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors font-medium ${
                  selectedSourceId === c.id
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                {c.name}
              </button>
            ))
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={duplicate}
            disabled={!selectedSourceId || copying}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {copying ? 'Copiando...' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>
  )
}
