'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Course, Student } from '@/lib/types'

interface Session {
  id: string
  course_id: string
  session_date: string
  status: 'normal' | 'holiday' | 'cancelled'
  cancellation_reason?: string
  attendance_records: { student_id: string }[]
}

interface Props {
  course: Course
  students: Student[]
  initialSessions: Session[]
}

export default function AttendanceView({ course, students, initialSessions }: Props) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [addingSession, setAddingSession] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [genStart, setGenStart] = useState(`${new Date().getFullYear()}-01-20`)
  const [genEnd, setGenEnd] = useState(`${new Date().getFullYear()}-11-30`)
  const [genFile, setGenFile] = useState<File | null>(null)
  const [generating, setGenerating] = useState(false)

  const selectedSession = sessions.find((s) => s.id === selectedSessionId)

  function openSession(session: Session) {
    setSelectedSessionId(session.id)
    setAbsentIds(new Set<string>(session.attendance_records.map((r) => r.student_id)))
  }

  function toggleAbsent(studentId: string) {
    setAbsentIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  async function saveAttendance() {
    if (!selectedSessionId) return
    setSaving(true)
    await fetch('/api/attendance/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: selectedSessionId, student_ids: Array.from(absentIds) }),
    })
    setSessions((prev) =>
      prev.map((s) =>
        s.id === selectedSessionId
          ? { ...s, attendance_records: Array.from(absentIds).map((sid) => ({ student_id: sid })) }
          : s
      )
    )
    setSaving(false)
    setSelectedSessionId(null)
  }

  async function addSession() {
    if (!newDate) return
    const res = await fetch('/api/attendance/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_id: course.id, session_date: newDate }),
    })
    const data = await res.json()
    if (data.id) {
      setSessions((prev) => [...prev, { ...data, attendance_records: [] }].sort((a, b) => a.session_date.localeCompare(b.session_date)))
      setNewDate('')
      setAddingSession(false)
    }
  }

  async function generateSessions() {
    if (!genFile) { alert('Selecciona el archivo de horario primero'); return }
    setGenerating(true)
    try {
      const fd = new FormData()
      fd.append('file', genFile)
      fd.append('courseId', course.id)
      fd.append('courseName', course.name)
      fd.append('startDate', genStart)
      fd.append('endDate', genEnd)
      const res = await fetch('/api/attendance/generate', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
        alert(`✓ Sesiones generadas:\n• ${data.normal} clases normales\n• ${data.holidays} festivos marcados automáticamente\n\nDías de clase: ${data.days.map((d: number) => dayNames[d]).join(', ')}`)
        setShowGenerate(false)
        const sessionsRes = await fetch(`/api/attendance/sessions?courseId=${course.id}`).then(r => r.json())
        setSessions(sessionsRes)
      } else {
        alert('Error: ' + data.error)
      }
    } catch (e) {
      alert('Error al conectar con el servidor. Revisa la consola del servidor para más detalles.')
    }
    setGenerating(false)
  }

  async function cancelSession(sessionId: string, reason: string) {
    await fetch('/api/attendance/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sessionId, status: 'cancelled', cancellation_reason: reason }),
    })
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: 'cancelled', cancellation_reason: reason } : s))
    if (selectedSessionId === sessionId) setSelectedSessionId(null)
  }

  // Attendance stats
  const normalSessions = sessions.filter((s) => s.status === 'normal')
  const studentStats = students.map((student) => {
    const absences = normalSessions.filter((s) => s.attendance_records.some((r) => r.student_id === student.id)).length
    const pct = normalSessions.length > 0 ? ((normalSessions.length - absences) / normalSessions.length) * 100 : 100
    return { ...student, absences, pct }
  })

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/courses/${course.id}`} className="text-sm text-gray-500 hover:text-blue-600">
          ← Volver a notas
        </Link>
        <h1 className="text-xl font-bold">Asistencia – {course.name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">Sesiones</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowGenerate(!showGenerate)}
                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
              >
                Generar desde horario
              </button>
              <button
                onClick={() => setAddingSession(!addingSession)}
                className="text-sm text-gray-500 hover:text-blue-600 border border-gray-200 px-2 py-1.5 rounded-lg"
              >
                + Manual
              </button>
            </div>
          </div>

          {showGenerate && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3 space-y-3">
              <p className="text-sm text-blue-800 font-medium">
                Genera todas las clases del año automáticamente a partir del horario, marcando los festivos colombianos.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Archivo de horario (.xlsx) *</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setGenFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-100 file:text-blue-700 file:cursor-pointer hover:file:bg-blue-200"
                  />
                  {genFile && <p className="text-xs text-green-600 mt-1">✓ {genFile.name}</p>}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Inicio del año escolar</label>
                    <input
                      type="date"
                      value={genStart}
                      onChange={(e) => setGenStart(e.target.value)}
                      className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Fin del año escolar</label>
                    <input
                      type="date"
                      value={genEnd}
                      onChange={(e) => setGenEnd(e.target.value)}
                      className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={generateSessions}
                    disabled={generating || !genFile}
                    className="self-end bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {generating ? 'Generando...' : 'Generar'}
                  </button>
                  <button onClick={() => setShowGenerate(false)} className="self-end text-sm text-gray-400">Cancelar</button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Si ya existen sesiones para esas fechas, no se duplican. Puedes regenerar sin problema.
              </p>
            </div>
          )}

          {addingSession && (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={addSession} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg">Agregar</button>
              <button onClick={() => setAddingSession(false)} className="text-sm text-gray-400">Cancelar</button>
            </div>
          )}

          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {sessions.map((session) => {
              const absent = session.attendance_records.length
              const statusColor =
                session.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                session.status === 'holiday' ? 'bg-yellow-50 text-yellow-700' :
                'bg-white hover:bg-blue-50 text-gray-800'

              return (
                <div
                  key={session.id}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                    selectedSessionId === session.id ? 'border-blue-400 ring-1 ring-blue-400' : 'border-gray-200'
                  } ${statusColor}`}
                  onClick={() => session.status === 'normal' && openSession(session)}
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {new Date(session.session_date + 'T12:00:00').toLocaleDateString('es-CO', {
                        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                      })}
                    </div>
                    {session.status !== 'normal' && (
                      <div className="text-xs text-gray-500">
                        {session.status === 'holiday' ? 'Festivo' : `Clase perdida: ${session.cancellation_reason ?? ''}`}
                      </div>
                    )}
                  </div>
                  {session.status === 'normal' && (
                    <div className="text-sm">
                      {absent === 0 ? (
                        <span className="text-green-600">✓ Sin faltas</span>
                      ) : (
                        <span className="text-red-600">{absent} falta{absent !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  )}
                  {session.status === 'normal' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const reason = prompt('Motivo de la clase perdida:')
                        if (reason !== null) cancelSession(session.id, reason)
                      }}
                      className="text-xs text-gray-300 hover:text-red-500"
                      title="Marcar como clase perdida"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}

            {sessions.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p>No hay sesiones registradas</p>
                <p className="text-sm mt-1">Agrega las fechas en que tienes clase</p>
              </div>
            )}
          </div>
        </div>

        {/* Attendance panel */}
        <div>
          {selectedSession ? (
            <div>
              <h2 className="font-semibold text-gray-700 mb-3">
                Asistencia – {new Date(selectedSession.session_date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h2>
              <p className="text-sm text-gray-500 mb-3">Marca solo quienes FALTARON. Las demás se asumen presentes.</p>

              <div className="space-y-1 mb-4 max-h-80 overflow-y-auto">
                {students.map((student) => {
                  const isAbsent = absentIds.has(student.id)
                  return (
                    <button
                      key={student.id}
                      onClick={() => toggleAbsent(student.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl border transition-colors ${
                        isAbsent
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-lg ${isAbsent ? '✗' : '✓'}`}>{isAbsent ? '✗' : '✓'}</span>
                      <span className="text-sm font-medium">{student.name}</span>
                    </button>
                  )
                })}
              </div>

              <button
                onClick={saveAttendance}
                disabled={saving}
                className="w-full bg-green-600 text-white py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {saving ? 'Guardando...' : `Guardar asistencia (${absentIds.size} falta${absentIds.size !== 1 ? 's' : ''})`}
              </button>
            </div>
          ) : (
            <StudentAbsenceDetail
              studentStats={studentStats}
              normalSessions={normalSessions}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function StudentAbsenceDetail({
  studentStats,
  normalSessions,
}: {
  studentStats: { id: string; name: string; absences: number; pct: number }[]
  normalSessions: { id: string; session_date: string; attendance_records: { student_id: string }[] }[]
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div>
      <h2 className="font-semibold text-gray-700 mb-3">Resumen de asistencia</h2>
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
        {studentStats.map((student) => {
          const isExpanded = expandedId === student.id
          const absentDates = normalSessions
            .filter((s) => s.attendance_records.some((r) => r.student_id === student.id))
            .map((s) => s.session_date)
            .sort()

          return (
            <div key={student.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : student.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <span className="flex-1 text-sm font-medium text-left">{student.name}</span>
                <span className={`text-sm ${student.absences > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {student.absences} falt.
                </span>
                <div className="w-20 bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${student.pct >= 80 ? 'bg-green-500' : student.pct >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${student.pct}%` }}
                  />
                </div>
                <span className={`text-sm font-bold w-10 text-right ${student.pct < 70 ? 'text-red-600' : 'text-green-700'}`}>
                  {student.pct.toFixed(0)}%
                </span>
                <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 border-t border-gray-100">
                  {absentDates.length === 0 ? (
                    <p className="text-sm text-green-600 py-2">Sin faltas registradas ✓</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {absentDates.map((date) => (
                        <span key={date} className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-lg">
                          {new Date(date + 'T12:00:00').toLocaleDateString('es-CO', {
                            weekday: 'short', day: 'numeric', month: 'short'
                          })}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
