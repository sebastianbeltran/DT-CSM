'use client'

import { useState, useEffect } from 'react'
import type { Student } from '@/lib/types'

interface Course {
  id: string
  name: string
  school_year_id: string
}

interface Props {
  student: Student
  currentCourseId: string
  yearId: string
  onMoved: (studentId: string) => void
  onClose: () => void
}

export default function MoveStudentModal({ student, currentCourseId, yearId, onMoved, onClose }: Props) {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    fetch(`/api/courses?yearId=${yearId}`)
      .then((r) => r.json())
      .then((data) => setCourses((data ?? []).filter((c: Course) => c.id !== currentCourseId)))
  }, [yearId, currentCourseId])

  function extractGrade(name: string): string {
    const match = name.match(/^\d+/)
    return match ? match[0] : name
  }

  function sameGrade(a: string, b: string): boolean {
    return extractGrade(a) === extractGrade(b)
  }

  const currentCourseName = courses.find(() => true)?.name ?? ''
  const selectedCourse = courses.find((c) => c.id === selectedCourseId)
  const differentGrade = selectedCourse && !sameGrade(selectedCourse.name, currentCourseName)

  async function move() {
    if (!selectedCourseId) return

    if (differentGrade) {
      const ok = confirm(
        `⚠️ "${selectedCourse?.name}" parece ser un grado diferente.\n\nSus notas actuales están ligadas a las evaluaciones del curso actual y NO aparecerán en el destino.\n\n¿Continuar de todas formas?`
      )
      if (!ok) return
    }

    setMoving(true)
    await fetch(`/api/students/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: selectedCourseId,
        previous_course_id: currentCourseId,
      }),
    })
    setMoving(false)
    onMoved(student.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold mb-1">Mover estudiante</h2>
        <p className="text-sm text-gray-500 mb-5">
          <span className="font-medium text-gray-800">{student.name}</span> — sus notas se conservan.
        </p>

        <div className="space-y-2 mb-5">
          {courses.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No hay otros cursos en este año escolar.</p>
          ) : (
            courses.map((c) => {
              const diffGrade = !sameGrade(c.name, courses[0]?.name ?? c.name)
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCourseId(c.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors font-medium flex items-center justify-between ${
                    selectedCourseId === c.id
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <span>{c.name}</span>
                  {diffGrade && (
                    <span className="text-xs text-orange-500 font-normal">grado diferente ⚠️</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={move}
            disabled={!selectedCourseId || moving}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {moving ? 'Moviendo...' : 'Mover'}
          </button>
        </div>
      </div>
    </div>
  )
}
