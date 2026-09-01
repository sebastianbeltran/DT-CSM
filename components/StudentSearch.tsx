'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface SearchResult {
  id: string
  name: string
  course_id: string
  courses: { id: string; name: string }
}

export default function StudentSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/students/search?q=${encodeURIComponent(trimmed)}`)
        const data = await res.json()
        setResults(data)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function handleClose() {
    setOpen(false)
    setQuery('')
    setResults([])
    setLoading(false)
  }

  function handleSelect(result: SearchResult) {
    router.push(`/courses/${result.course_id}`)
    handleClose()
  }

  const showDropdown = open && query.trim().length >= 2

  return (
    <div ref={containerRef} className="relative">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm px-3 py-1.5 rounded-md hover:bg-blue-800 transition-colors flex items-center gap-1.5"
          title="Buscar estudiante en todos los cursos"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <span className="hidden sm:inline">Buscar</span>
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && handleClose()}
            placeholder="Nombre de estudiante..."
            className="text-sm px-3 py-1.5 rounded-md bg-blue-800 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
          />
          <button
            onClick={handleClose}
            className="text-sm p-1.5 rounded-md hover:bg-blue-800 transition-colors opacity-70 hover:opacity-100"
            title="Cerrar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {showDropdown && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
          {loading && (
            <div className="px-4 py-3 text-sm text-gray-400">Buscando...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-500">
              No se encontró ninguna estudiante con ese nombre.
            </div>
          )}
          {!loading && results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
            >
              <div className="text-sm font-medium text-gray-900">{r.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{r.courses?.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
