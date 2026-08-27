'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Course, Student, Period, WorkGroup } from '@/lib/types'
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
  const [creatingPeriod, setCreatingPeriod] = useState(false)
  const [newPeriodName, setNewPeriodName] = useState('')
  const [creatingPeriodLoading, setCreatingPeriodLoading] = useState(false)

  async function createPeriod() {
    if (!newPeriodName.trim() || creatingPeriodLoading) return
    setCreatingPeriodLoading(true)
    const res = await fetch('/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_id: course.id, name: newPeriodName.trim(), sort_order: periods.length }),
    })
    const data = await res.json()
    if (data.id) {
      setPeriods((prev) => [...prev, data])
      setActivePeriodId(data.id)
      setNewPeriodName('')
      setCreatingPeriod(false)
    }
    setCreatingPeriodLoading(false)
  }

  async function renamePeriod(id: string, name: string) {
    await fetch(`/api/periods/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }

  async function deletePeriod(id: string) {
    if (!confirm('¿Eliminar este periodo y todas sus notas?')) return
    await fetch(`/api/periods/${id}`, { method: 'DELETE' })
    const remaining = periods.filter((p) => p.id !== id)
    setPeriods(remaining)
    if (activePeriodId === id) setActivePeriodId(remaining[0]?.id ?? '')
  }


  async function archiveStudent(id: string, name: string) {
    if (!confirm(`¿Dar de baja a "${name}"? No aparecerá en la lista activa pero se conserva su historial.`)) return
    await fetch(`/api/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: true, archived_at: new Date().toISOString() }),
    })
    setStudents((prev) => prev.filter((s) => s.id !== id))
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
        <DuplicateStructureButton courseId={course.id} yearId={course.school_year_id} />
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

        {creatingPeriod ? (
          <div className="flex items-center gap-1 px-2">
            <input
              autoFocus
              value={newPeriodName}
              onChange={(e) => setNewPeriodName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createPeriod()
                if (e.key === 'Escape') setCreatingPeriod(false)
              }}
              placeholder="Nombre del periodo"
              className="border rounded-md px-2 py-1 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={createPeriod} className="text-xs bg-blue-600 text-white px-2 py-1 rounded-md">OK</button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingPeriod(true)}
            className="px-3 py-2 text-sm text-blue-600 hover:text-blue-700 whitespace-nowrap flex-shrink-0"
          >
            + Periodo
          </button>
        )}
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
            <p>Crea un periodo para comenzar a calificar</p>
          </div>
        </div>
      )}
    </div>
  )
}

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

function DuplicateStructureButton({ courseId, yearId }: { courseId: string; yearId: string }) {
  const [open, setOpen] = useState(false)
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [loading, setLoading] = useState(false)
  const [copying, setCopying] = useState(false)

  async function openModal() {
    setLoading(true)
    const data = await fetch(`/api/courses?yearId=${yearId}`).then((r) => r.json())
    setCourses((data ?? []).filter((c: { id: string }) => c.id !== courseId))
    setOpen(true)
    setLoading(false)
  }

  async function duplicate() {
    if (!selectedSourceId) return
    setCopying(true)
    const res = await fetch(`/api/courses/${courseId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceCourseId: selectedSourceId }),
    })
    const data = await res.json()
    setCopying(false)
    if (res.ok) {
      alert(`✓ Estructura copiada: ${data.columnsAdded} columna(s) añadida(s).`)
      setOpen(false)
      window.location.reload()
    } else {
      alert('Error: ' + data.error)
    }
  }

  if (!open) {
    return (
      <button
        onClick={openModal}
        disabled={loading}
        className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        {loading ? '...' : '⧉ Copiar estructura de otro curso'}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold mb-1">Copiar estructura</h2>
        <p className="text-sm text-gray-500 mb-4">
          Copia periodos, fases, columnas y criterios de otro curso. <strong>No copia notas ni estudiantes.</strong>
        </p>
        <div className="space-y-2 mb-5">
          {courses.length === 0 ? (
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
          <button onClick={() => setOpen(false)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
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
