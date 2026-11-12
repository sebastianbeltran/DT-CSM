'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GradeColumn, Period, PeriodCompetency } from '@/lib/types'
import { COMPETENCIES, type CompetencyKey } from '@/lib/competencies'
import { PHIDIAS_DEFAULTS, type MatchResult, type PhidiasDelimiter, type PhidiasEncoding } from '@/lib/phidias'

interface Props {
  courseId: string
  courseName: string
  periods: Period[]
  initialPeriodId: string
  onClose: () => void
}

interface ExportError {
  error: string
  missingRefs?: string[]
  outOfRange?: string[]
  encodingProblems?: string[]
}

export default function PhidiasExportModal({ courseId, courseName, periods, initialPeriodId, onClose }: Props) {
  // Paso 1: archivo de Phidias
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState('')
  const [match, setMatch] = useState<(MatchResult & { fileRows: number }) | null>(null)
  const [manual, setManual] = useState<Record<string, string>>({}) // studentId → ref elegida a mano
  const [confirmed, setConfirmed] = useState(false)

  // Paso 2: exportación
  const [periodId, setPeriodId] = useState(initialPeriodId)
  const [competencies, setCompetencies] = useState<PeriodCompetency[]>([])
  const [columns, setColumns] = useState<GradeColumn[]>([])
  const [competencyKey, setCompetencyKey] = useState<CompetencyKey | ''>('')
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set())
  const [delimiter, setDelimiter] = useState<PhidiasDelimiter>(PHIDIAS_DEFAULTS.delimiter)
  const [encoding, setEncoding] = useState<PhidiasEncoding>(PHIDIAS_DEFAULTS.encoding)
  const [showOptions, setShowOptions] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<ExportError | null>(null)
  const [lastDownload, setLastDownload] = useState('')

  async function readFile(f: File) {
    setFileName(f.name)
    setReading(true)
    setReadError('')
    setMatch(null)
    setManual({})
    setConfirmed(false)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('courseId', courseId)
      const res = await fetch('/api/phidias/match', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) setReadError(data.error ?? 'No se pudo leer el archivo.')
      else setMatch(data)
    } catch {
      setReadError('No se pudo conectar al servidor.')
    } finally {
      setReading(false)
    }
  }

  // Referencias finales: automáticas + manuales
  const refs = useMemo(() => {
    const r: Record<string, string> = {}
    match?.matched.forEach((m) => (r[m.studentId] = m.ref))
    Object.entries(manual).forEach(([sid, ref]) => ref && (r[sid] = ref))
    return r
  }, [match, manual])

  const usedManualRefs = new Set(Object.values(manual).filter(Boolean))
  const stillMissing = match?.unmatchedApp.filter((u) => !manual[u.studentId]) ?? []
  const phidiasLeftover = match?.unmatchedPhidias.filter((p) => !usedManualRefs.has(p.ref)) ?? []

  // Cargar competencias y evaluaciones del trimestre
  useEffect(() => {
    if (!periodId) return
    Promise.all([
      fetch(`/api/period-competencies?periodId=${periodId}`).then((r) => r.json()),
      fetch(`/api/columns?periodId=${periodId}`).then((r) => r.json()),
    ]).then(([pcs, cols]) => {
      setCompetencies(pcs ?? [])
      setColumns(cols ?? [])
      setCompetencyKey('')
      setSelectedCols(new Set())
    })
  }, [periodId])

  const compColumns = columns.filter((c) => c.competency_key === competencyKey)

  function toggleCol(id: string) {
    setSelectedCols((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function download() {
    if (!competencyKey) return
    setExporting(true)
    setExportError(null)
    setLastDownload('')
    try {
      const res = await fetch('/api/phidias/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          periodId,
          competencyKey,
          columnIds: compColumns.filter((c) => selectedCols.has(c.id)).map((c) => c.id),
          refs,
          delimiter,
          encoding,
        }),
      })
      if (!res.ok) {
        setExportError(await res.json().catch(() => ({ error: 'Error desconocido.' })))
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? 'phidias.csv'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      setLastDownload(name)
    } catch {
      setExportError({ error: 'No se pudo conectar al servidor.' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Exportar a Phidias – {courseName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* ── Paso 1 ── */}
          <section>
            <h3 className="text-sm font-bold text-gray-800 mb-1">1. Sube la plantilla de Phidias del curso</h3>
            <p className="text-xs text-gray-500 mb-2">
              En Phidias, descarga la plantilla de importación de notas de {courseName} (archivo .xls). La app la usa
              solo para saber la Referencia de cada estudiante; no guarda nada.
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm"
            >
              {reading ? (
                <span className="text-blue-600">Leyendo archivo…</span>
              ) : fileName ? (
                <span className="text-gray-700">📄 {fileName} <span className="text-gray-400">(clic para cambiar)</span></span>
              ) : (
                <span className="text-gray-500">Haz clic para seleccionar el archivo de Phidias</span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.html,.htm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) readFile(f)
                e.target.value = ''
              }}
            />
            {readError && <p className="mt-2 text-sm text-red-600">⚠️ {readError}</p>}

            {match && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-green-700">
                  ✅ {match.matched.length} estudiante(s) emparejados automáticamente
                  <span className="text-gray-400"> · {match.fileRows} en el archivo</span>
                </p>

                {match.unmatchedApp.length > 0 && (
                  <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                    <p className="text-sm font-medium text-amber-800 mb-2">
                      ⚠️ Estudiantes de la app sin coincidencia en el archivo — elige su fila en Phidias:
                    </p>
                    <div className="space-y-1.5">
                      {match.unmatchedApp.map((u) => (
                        <div key={u.studentId} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate">
                            {u.appName}
                            {u.reason === 'nombre-repetido' && <span className="text-xs text-amber-700"> (nombre repetido)</span>}
                          </span>
                          <select
                            value={manual[u.studentId] ?? ''}
                            onChange={(e) => {
                              setManual((m) => ({ ...m, [u.studentId]: e.target.value }))
                              setConfirmed(false)
                            }}
                            className="border rounded-lg px-2 py-1 text-sm max-w-[55%]"
                          >
                            <option value="">— Sin asignar —</option>
                            {match.unmatchedPhidias
                              .filter((p) => p.ref === manual[u.studentId] || !usedManualRefs.has(p.ref))
                              .map((p) => (
                                <option key={p.ref} value={p.ref}>
                                  {p.phidiasName} ({p.ref})
                                </option>
                              ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {phidiasLeftover.length > 0 && (
                  <div className="border border-gray-200 bg-gray-50 rounded-xl p-3">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Estudiantes del archivo de Phidias que no están en la app (no saldrán en el CSV):
                    </p>
                    <ul className="text-sm text-gray-600 list-disc pl-5">
                      {phidiasLeftover.map((p) => (
                        <li key={p.ref}>{p.phidiasName} ({p.ref}){p.reason === 'nombre-repetido' && ' – nombre repetido'}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-500">Ver emparejamientos automáticos</summary>
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {match.matched.map((m) => (
                        <tr key={m.studentId} className="border-t">
                          <td className="py-1 pr-2">{m.appName}</td>
                          <td className="py-1 pr-2 text-gray-500">{m.phidiasName}</td>
                          <td className="py-1 text-gray-500">{m.ref}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>

                {stillMissing.length > 0 ? (
                  <p className="text-sm text-red-600">
                    Faltan {stillMissing.length} estudiante(s) por asignar. No se puede exportar hasta resolverlos.
                  </p>
                ) : (
                  !confirmed && (
                    <button
                      onClick={() => setConfirmed(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
                    >
                      Confirmar referencias y continuar →
                    </button>
                  )
                )}
                {confirmed && <p className="text-sm text-green-700">✅ Referencias confirmadas.</p>}
              </div>
            )}
          </section>

          {/* ── Paso 2 ── */}
          <section className={confirmed ? '' : 'opacity-40 pointer-events-none select-none'}>
            <h3 className="text-sm font-bold text-gray-800 mb-1">2. Elige qué notas descargar</h3>
            {!confirmed && <p className="text-xs text-gray-500 mb-2">Disponible después de subir y confirmar el archivo de Phidias.</p>}

            <div className="flex gap-3 mb-3 flex-wrap">
              <label className="text-sm">
                <span className="block text-xs text-gray-500 mb-0.5">Trimestre</span>
                <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-gray-500 mb-0.5">Competencia</span>
                <select
                  value={competencyKey}
                  onChange={(e) => {
                    setCompetencyKey(e.target.value as CompetencyKey)
                    setSelectedCols(new Set())
                    setExportError(null)
                  }}
                  className="border rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="">— Elige —</option>
                  {competencies.map((pc) => (
                    <option key={pc.competency_key} value={pc.competency_key}>
                      {pc.competency_key} – {COMPETENCIES[pc.competency_key].name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {competencyKey && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">
                  Evaluaciones a incluir (cada una se creará como evaluación <strong>nueva</strong> en Phidias; no marques las que ya importaste):
                </p>
                {compColumns.length === 0 ? (
                  <p className="text-sm text-gray-400">Esta competencia no tiene evaluaciones.</p>
                ) : (
                  <div className="space-y-1">
                    {compColumns.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selectedCols.has(c.id)} onChange={() => toggleCol(c.id)} />
                        <span>{c.name}</span>
                        <span className="text-xs text-gray-400">({c.type})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setShowOptions((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700 mb-2">
              {showOptions ? '▾' : '▸'} Opciones del archivo
            </button>
            {showOptions && (
              <div className="flex gap-3 mb-3 flex-wrap">
                <label className="text-sm">
                  <span className="block text-xs text-gray-500 mb-0.5">Separador</span>
                  <select value={delimiter} onChange={(e) => setDelimiter(e.target.value as PhidiasDelimiter)} className="border rounded-lg px-2 py-1.5 text-sm">
                    <option value=",">Coma (,) – por defecto</option>
                    <option value=";">Punto y coma (;)</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-xs text-gray-500 mb-0.5">Codificación</span>
                  <select value={encoding} onChange={(e) => setEncoding(e.target.value as PhidiasEncoding)} className="border rounded-lg px-2 py-1.5 text-sm">
                    <option value="windows-1252">Windows-1252 / Latin-1 – por defecto</option>
                    <option value="latin1">ISO-8859-1 (Latin-1 estricto)</option>
                  </select>
                </label>
              </div>
            )}

            {exportError && (
              <div className="border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-700 mb-3">
                <p className="font-medium">⚠️ {exportError.error} No se generó el archivo.</p>
                {[...(exportError.missingRefs ?? []), ...(exportError.outOfRange ?? []), ...(exportError.encodingProblems ?? [])].length > 0 && (
                  <ul className="list-disc pl-5 mt-1">
                    {[...(exportError.missingRefs ?? []), ...(exportError.outOfRange ?? []), ...(exportError.encodingProblems ?? [])].map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {lastDownload && <p className="text-sm text-green-700 mb-3">✅ Descargado: {lastDownload}</p>}
          </section>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
            Cerrar
          </button>
          <button
            onClick={download}
            disabled={!confirmed || !competencyKey || selectedCols.size === 0 || exporting}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {exporting ? 'Generando…' : 'Descargar CSV para Phidias'}
          </button>
        </div>
      </div>
    </div>
  )
}
