'use client'

import { useEffect, useMemo, useState } from 'react'
import type { GradeColumn, Period } from '@/lib/types'
import { COMPETENCIES } from '@/lib/competencies'
import { normalizeName, parsePhidiasPaste, type PhidiasPastedTable } from '@/lib/phidias'
import type { PhidiasDiff } from '@/app/api/phidias/compare/route'

interface Props {
  courseId: string
  courseName: string
  periods: Period[]
  initialPeriodId: string
  onClose: () => void
  onApplied: () => void
}

type Choice = 'app' | 'phidias'
interface CompareResult {
  diffs: PhidiasDiff[]
  equalCount: number
  unmatchedApp: string[]
  unmatchedPhidias: string[]
}

const fmt = (n: number | null) => (n === null ? 'sin nota' : n.toFixed(1))
const keyOf = (d: PhidiasDiff) => `${d.studentId}|${d.columnId}`

export default function PhidiasCompareModal({ courseId, courseName, periods, initialPeriodId, onClose, onApplied }: Props) {
  // 1. Pegar
  const [pasteText, setPasteText] = useState('')
  const [parsed, setParsed] = useState<PhidiasPastedTable | null>(null)
  const [parseError, setParseError] = useState('')

  // 2. Emparejar evaluaciones
  const [periodId, setPeriodId] = useState(initialPeriodId)
  const [columns, setColumns] = useState<GradeColumn[]>([])
  const [mapping, setMapping] = useState<Record<number, string>>({})

  // 3. Revisar y elegir
  const [comparing, setComparing] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [compareError, setCompareError] = useState('')
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [confirming, setConfirming] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')

  useEffect(() => {
    if (!periodId) return
    fetch(`/api/columns?periodId=${periodId}`)
      .then((r) => r.json())
      .then((cols: GradeColumn[]) => setColumns(cols ?? []))
  }, [periodId])

  const candidateColumns = useMemo(
    () => (parsed?.competencyKey ? columns.filter((c) => c.competency_key === parsed.competencyKey) : columns),
    [columns, parsed]
  )

  // Por defecto, solo se empareja si el nombre es idéntico
  useEffect(() => {
    if (!parsed) return
    const m: Record<number, string> = {}
    parsed.evaluations.forEach((ev, i) => {
      const same = candidateColumns.find((c) => normalizeName(c.name) === normalizeName(ev))
      if (same) m[i] = same.id
    })
    setMapping(m)
    setResult(null)
  }, [parsed, candidateColumns])

  function readPaste() {
    setParseError('')
    setParsed(null)
    setResult(null)
    try {
      setParsed(parsePhidiasPaste(pasteText))
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'No se pudo leer lo pegado.')
    }
  }

  async function compare() {
    if (!parsed) return
    setComparing(true)
    setCompareError('')
    setResult(null)
    setChoices({})
    setConfirming(false)
    try {
      const res = await fetch('/api/phidias/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          periodId,
          mapping: parsed.evaluations.map((_, i) => ({ phidiasIndex: i, columnId: mapping[i] ?? null })),
          students: parsed.students.map((s) => ({ name: s.name, values: s.values })),
        }),
      })
      const data = await res.json()
      if (!res.ok) setCompareError(data.error ?? 'Error al comparar.')
      else setResult(data)
    } catch {
      setCompareError('No se pudo conectar al servidor.')
    } finally {
      setComparing(false)
    }
  }

  const canUsePhidias = (d: PhidiasDiff) => d.phidiasScore !== null && d.phidiasScore >= 1 && d.phidiasScore <= 10
  const decided = result ? result.diffs.filter((d) => choices[keyOf(d)]).length : 0
  const allDecided = !!result && result.diffs.length > 0 && decided === result.diffs.length
  const toApply = result ? result.diffs.filter((d) => choices[keyOf(d)] === 'phidias') : []

  async function apply() {
    setApplying(true)
    setApplyError('')
    try {
      const res = await fetch('/api/grades/phidias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          changes: toApply.map((d) => ({ studentId: d.studentId, columnId: d.columnId, phidiasScore: d.phidiasScore })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setApplyError(`${data.error ?? 'Error al aplicar.'}${data.applied ? ` (se alcanzaron a aplicar ${data.applied})` : ''}`)
        return
      }
      alert(`✓ ${data.applied} nota(s) actualizadas con la versión de Phidias.`)
      onApplied()
      onClose()
    } catch {
      setApplyError('No se pudo conectar al servidor.')
    } finally {
      setApplying(false)
    }
  }

  // Agrupar diferencias por estudiante
  const byStudent = useMemo(() => {
    const m = new Map<string, PhidiasDiff[]>()
    result?.diffs.forEach((d) => m.set(d.studentName, [...(m.get(d.studentName) ?? []), d]))
    return Array.from(m.entries())
  }, [result])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Comparar con Phidias – {courseName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* 1 */}
          <section>
            <h3 className="text-sm font-bold text-gray-800 mb-1">1. Pega la tabla de notas de Phidias</h3>
            <p className="text-xs text-gray-500 mb-2">
              En Phidias abre la competencia, selecciona toda la tabla (desde "Estudiante" hasta "Promedio") y pégala aquí.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              placeholder="Estudiante	Critical Technological Thinking: …"
              className="w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={readPaste}
              disabled={!pasteText.trim()}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Leer tabla
            </button>
            {parseError && <p className="mt-2 text-sm text-red-600">⚠️ {parseError}</p>}
            {parsed && (
              <div className="mt-2 text-sm text-gray-700 space-y-1">
                <p>
                  Competencia:{' '}
                  {parsed.competencyKey ? (
                    <strong>{parsed.competencyKey} – {COMPETENCIES[parsed.competencyKey].name}</strong>
                  ) : (
                    <span className="text-amber-700">no reconocida (se mostrarán todas las evaluaciones)</span>
                  )}
                  {' · '}{parsed.students.length} estudiantes · {parsed.evaluations.length} evaluación(es)
                </p>
                {parsed.unreadableRows.length > 0 && (
                  <p className="text-amber-700">
                    ⚠️ Filas que no se pudieron leer con seguridad (no se compararán): {parsed.unreadableRows.join('; ')}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* 2 */}
          {parsed && (
            <section>
              <h3 className="text-sm font-bold text-gray-800 mb-1">2. ¿Con qué evaluación de la app corresponde cada una?</h3>
              <label className="text-sm block mb-2">
                <span className="text-xs text-gray-500 mr-2">Trimestre</span>
                <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="border rounded-lg px-2 py-1 text-sm">
                  {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <div className="space-y-2">
                {parsed.evaluations.map((ev, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">Phidias: <strong>{ev}</strong></span>
                    <span className="text-gray-400">→</span>
                    <select
                      value={mapping[i] ?? ''}
                      onChange={(e) => { setMapping((m) => ({ ...m, [i]: e.target.value })); setResult(null) }}
                      className="border rounded-lg px-2 py-1 text-sm max-w-[50%]"
                    >
                      <option value="">— No comparar —</option>
                      {candidateColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button
                onClick={compare}
                disabled={comparing || !Object.values(mapping).some(Boolean)}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {comparing ? 'Comparando…' : 'Comparar'}
              </button>
              {compareError && <p className="mt-2 text-sm text-red-600">⚠️ {compareError}</p>}
            </section>
          )}

          {/* 3 */}
          {result && (
            <section>
              <h3 className="text-sm font-bold text-gray-800 mb-1">3. Revisa y elige, estudiante por estudiante</h3>
              <p className="text-sm text-gray-600 mb-2">
                ✅ {result.equalCount} nota(s) iguales · ⚠️ {result.diffs.length} diferencia(s)
              </p>

              {(result.unmatchedApp.length > 0 || result.unmatchedPhidias.length > 0) && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 text-sm text-amber-800 mb-3 space-y-1">
                  {result.unmatchedApp.length > 0 && <p>En la app pero no en lo pegado (no se comparan): {result.unmatchedApp.join('; ')}</p>}
                  {result.unmatchedPhidias.length > 0 && <p>En lo pegado pero no en la app (no se comparan): {result.unmatchedPhidias.join('; ')}</p>}
                </div>
              )}

              {result.diffs.length === 0 ? (
                <p className="text-sm text-green-700">No hay diferencias. No hace falta aplicar nada.</p>
              ) : (
                <div className="space-y-3">
                  {byStudent.map(([name, diffs]) => (
                    <div key={name} className="border border-gray-200 rounded-xl p-3">
                      <p className="font-medium text-gray-900 text-sm mb-2">{name}</p>
                      {diffs.map((d) => {
                        const k = keyOf(d)
                        const ch = choices[k]
                        return (
                          <div key={k} className="mb-2 last:mb-0">
                            <p className="text-xs text-gray-500 mb-1">{d.columnName}</p>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => setChoices((c) => ({ ...c, [k]: 'app' }))}
                                className={`px-3 py-1.5 rounded-lg border-2 text-sm ${ch === 'app' ? 'border-blue-500 bg-blue-50 text-blue-800 font-semibold' : 'border-gray-200 hover:border-gray-300'}`}
                              >
                                App: {fmt(d.appScore)}
                                {d.hasAdjustment && <span className="text-xs text-purple-600"> (ya ajustada; rúbrica {fmt(d.rubricScore)})</span>}
                              </button>
                              <button
                                onClick={() => canUsePhidias(d) && setChoices((c) => ({ ...c, [k]: 'phidias' }))}
                                disabled={!canUsePhidias(d)}
                                title={!canUsePhidias(d) ? 'No se puede aplicar: revisa esta nota a mano' : ''}
                                className={`px-3 py-1.5 rounded-lg border-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed ${ch === 'phidias' ? 'border-purple-500 bg-purple-50 text-purple-800 font-semibold' : 'border-gray-200 hover:border-gray-300'}`}
                              >
                                Phidias: {fmt(d.phidiasScore)}
                              </button>
                            </div>
                            {d.warnings.length > 0 && (
                              <p className="text-xs text-amber-700 mt-1">⚠️ {d.warnings.join(' · ')}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}

              {confirming && (
                <div className="mt-4 border border-purple-200 bg-purple-50 rounded-xl p-3 text-sm">
                  {toApply.length === 0 ? (
                    <p>Elegiste la versión de la app en todas. No se cambiará nada.</p>
                  ) : (
                    <>
                      <p className="font-medium text-purple-900 mb-1">Se aplicarán {toApply.length} nota(s) de Phidias (la rúbrica no se toca):</p>
                      <ul className="list-disc pl-5 text-purple-800">
                        {toApply.map((d) => (
                          <li key={keyOf(d)}>{d.studentName} – {d.columnName}: {fmt(d.appScore)} → {fmt(d.phidiasScore)}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              {applyError && <p className="mt-2 text-sm text-red-600">⚠️ {applyError}</p>}
            </section>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 items-center">
          {result && result.diffs.length > 0 && (
            <span className="text-xs text-gray-500">Decididas {decided} de {result.diffs.length}</span>
          )}
          <button onClick={onClose} className="ml-auto px-5 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
            Cerrar
          </button>
          {result && result.diffs.length > 0 && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              disabled={!allDecided}
              title={!allDecided ? 'Elige App o Phidias en cada diferencia' : ''}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Revisar cambios →
            </button>
          )}
          {confirming && (
            <>
              <button onClick={() => setConfirming(false)} className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
                ← Volver
              </button>
              <button
                onClick={toApply.length ? apply : onClose}
                disabled={applying}
                className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {applying ? 'Aplicando…' : toApply.length ? `Confirmar y aplicar ${toApply.length}` : 'Listo'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
