'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Year { id: string; name: string; is_active: boolean }
interface Course { id: string; name: string; school_year_id: string; school_years?: { name: string } }

export default function Dashboard({
  initialYears,
  initialCourses,
}: {
  initialYears: Year[]
  initialCourses: Course[]
}) {
  const router = useRouter()
  const [years, setYears] = useState<Year[]>(initialYears)
  const [courses, setCourses] = useState<Course[]>(initialCourses)
  const [selectedYearId, setSelectedYearId] = useState<string>(
    initialYears.find((y) => y.is_active)?.id ?? initialYears[0]?.id ?? ''
  )
  const [showNewYear, setShowNewYear] = useState(false)
  const [newYearName, setNewYearName] = useState('')

  // Import modal state
  const [showImport, setShowImport] = useState(false)
  const [importCourseName, setImportCourseName] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Import into existing course (from course card)
  const [reimportCourseId, setReimportCourseId] = useState<string | null>(null)
  const reimportFileRef = useRef<HTMLInputElement>(null)

  const filteredCourses = courses.filter((c) => c.school_year_id === selectedYearId)

  async function createYear() {
    if (!newYearName.trim()) return
    const res = await fetch('/api/years', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newYearName.trim() }),
    })
    const data = await res.json()
    if (data.id) {
      setYears((prev) => [data, ...prev])
      setSelectedYearId(data.id)
      setNewYearName('')
      setShowNewYear(false)
    }
  }

  async function activateYear(id: string) {
    await fetch(`/api/years/${id}/activate`, { method: 'POST' })
    setYears((prev) => prev.map((y) => ({ ...y, is_active: y.id === id })))
  }

  async function deleteCourse(id: string, name: string) {
    if (!confirm(`¿Eliminar el curso "${name}"? Se eliminarán todos sus datos.`)) return
    await fetch(`/api/courses/${id}`, { method: 'DELETE' })
    setCourses((prev) => prev.filter((c) => c.id !== id))
  }

  // Detect if file has multiple sheets (preview)
  const [fileSheets, setFileSheets] = useState<string[]>([])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setImportFile(f)
    setFileSheets([])
    if (!f) return
    // Read sheet names client-side to show preview
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const XLSX = require('xlsx')
        const wb = XLSX.read(ev.target?.result, { type: 'array' })
        setFileSheets(wb.SheetNames)
        if (wb.SheetNames.length === 1) setImportCourseName(wb.SheetNames[0])
      } catch {}
    }
    reader.readAsArrayBuffer(f)
  }

  // Main import flow
  async function handleImport() {
    if (!importFile) { alert('Selecciona un archivo Excel'); return }
    if (!selectedYearId) { alert('Selecciona un año escolar primero'); return }
    if (fileSheets.length <= 1 && !importCourseName.trim()) { alert('Escribe el nombre del curso'); return }

    setImporting(true)
    const fd = new FormData()
    fd.append('file', importFile)
    fd.append('yearId', selectedYearId)
    if (fileSheets.length <= 1) fd.append('courseName', importCourseName.trim())

    const res = await fetch('/api/students/import', { method: 'POST', body: fd })
    const data = await res.json()
    setImporting(false)

    if (res.ok) {
      if (data.multiSheet) {
        const resumen = data.results.map((r: { course: string; inserted: number; total: number }) =>
          `• ${r.course}: ${r.total} estudiantes`
        ).join('\n')
        alert(`✓ Importación completa:\n${resumen}`)
      } else {
        alert(`✓ Listo: ${data.total} estudiantes importadas`)
      }
      setShowImport(false)
      setImportCourseName('')
      setImportFile(null)
      setFileSheets([])
      window.location.reload()
    } else {
      alert('Error: ' + data.error)
    }
  }

  // Re-import into existing course
  async function handleReimport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !reimportCourseId) return
    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('courseId', reimportCourseId)
    const res = await fetch('/api/students/import', { method: 'POST', body: fd })
    const data = await res.json()
    setImporting(false)
    if (res.ok) {
      alert(`Actualización exitosa: ${data.inserted} nuevas estudiantes (${data.total} total)`)
    } else {
      alert('Error: ' + data.error)
    }
    e.target.value = ''
    setReimportCourseId(null)
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hidden file input for re-import */}
      <input ref={reimportFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleReimport} />

      {/* Year selector */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className="font-semibold text-gray-700">Año escolar:</span>
        {years.map((y) => (
          <button
            key={y.id}
            onClick={() => setSelectedYearId(y.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              selectedYearId === y.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
            }`}
          >
            {y.name}
          </button>
        ))}

        {showNewYear ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newYearName}
              onChange={(e) => setNewYearName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createYear()}
              placeholder="Ej: 2027"
              className="border rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={createYear} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">Crear</button>
            <button onClick={() => setShowNewYear(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setShowNewYear(true)} className="text-sm text-blue-600 hover:text-blue-700">
            + Nuevo año
          </button>
        )}

        {selectedYearId && (
          <button
            onClick={async () => {
              const year = years.find((y) => y.id === selectedYearId)
              if (!confirm(`¿Eliminar el año "${year?.name}" y TODOS sus cursos, estudiantes, notas e informes?\n\nEsta acción no se puede deshacer.`)) return
              await fetch(`/api/years/${selectedYearId}`, { method: 'DELETE' })
              const remaining = years.filter((y) => y.id !== selectedYearId)
              setYears(remaining)
              setCourses((prev) => prev.filter((c) => c.school_year_id !== selectedYearId))
              setSelectedYearId(remaining[0]?.id ?? '')
            }}
            className="text-xs text-red-400 hover:text-red-600 underline ml-2"
          >
            Eliminar año
          </button>
        )}
      </div>

      {/* Courses */}
      {selectedYearId ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">
              Cursos – {years.find((y) => y.id === selectedYearId)?.name}
            </h2>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              ↑ Importar lista de estudiantes (Excel)
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredCourses.map((c) => (
              <div key={c.id} className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden group">
                <a href={`/courses/${c.id}`} className="block p-5 text-center hover:bg-blue-50 transition-colors">
                  <div className="text-3xl font-bold text-blue-700 mb-1">{c.name}</div>
                  <div className="text-xs text-gray-400">Design & Technology</div>
                </a>
                <div className="border-t border-gray-100 flex">
                  <button
                    onClick={() => { setReimportCourseId(c.id); reimportFileRef.current?.click() }}
                    disabled={importing}
                    className="flex-1 text-xs py-2 text-gray-500 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                  >
                    ↑ Actualizar lista
                  </button>
                  <button
                    onClick={() => deleteCourse(c.id, c.name)}
                    className="px-3 text-xs py-2 text-gray-200 hover:text-red-500 hover:bg-red-50 transition-colors border-l border-gray-100 opacity-0 group-hover:opacity-100"
                    title="Eliminar curso"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}

            {filteredCourses.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">📂</div>
                <p>Aún no hay cursos</p>
                <p className="text-sm mt-1">Usa el botón <strong>"Importar lista de estudiantes"</strong> para crear tu primer curso</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📐</div>
          <p>Crea un año escolar para comenzar</p>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Importar lista de estudiantes</h2>
              <button onClick={() => { setShowImport(false); setImportCourseName(''); setImportFile(null) }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="space-y-4">
              {fileSheets.length <= 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del curso *
                  </label>
                  <input
                    autoFocus
                    value={importCourseName}
                    onChange={(e) => setImportCourseName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
                    placeholder="Ej: 9A, 10B, 7C..."
                    className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Si el curso ya existe, solo se agregarán estudiantes nuevas.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Archivo Excel (.xlsx) *
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:cursor-pointer hover:file:bg-blue-100"
                />
                {fileSheets.length > 1 && (
                  <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-blue-700 font-medium mb-1">Se detectaron {fileSheets.length} cursos — se importarán todos:</p>
                    <div className="flex flex-wrap gap-1">
                      {fileSheets.map((s) => (
                        <span key={s} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">Si el Excel tiene varias hojas, cada hoja se importa como un curso separado.</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowImport(false); setImportCourseName(''); setImportFile(null) }}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importFile || (fileSheets.length <= 1 && !importCourseName.trim())}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
