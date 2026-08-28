'use client'

import { useState } from 'react'
import type { Student } from '@/lib/types'

interface Group {
  id: string
  name: string
  course_id: string
  work_group_members: { student_id: string }[]
}

interface Props {
  courseId: string
  students: Student[]
  groups: Group[]
  onGroupsChange: (groups: Group[]) => void
  onClose: () => void
}

export default function GroupsPanel({ courseId, students, groups, onGroupsChange, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)

  function startCreating() {
    setNewGroupName(`Grupo ${groups.length + 1}`)
    setCreating(true)
  }
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [editName, setEditName] = useState('')
  const [editMembers, setEditMembers] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  async function createGroup() {
    if (!newGroupName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseId,
          name: newGroupName.trim(),
          member_ids: Array.from(selectedMembers),
        }),
      })
      if (res.redirected || res.url.includes('/login')) {
        alert('Tu sesión expiró. Recarga la página e inicia sesión de nuevo.')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert('Error al crear el grupo: ' + (data.error ?? 'Error desconocido'))
        return
      }
      const data = await res.json()
      if (data.id) {
        const newGroup = {
          ...data,
          work_group_members: Array.from(selectedMembers).map((sid) => ({ student_id: sid })),
        }
        onGroupsChange([...groups, newGroup])
        setNewGroupName('')
        setSelectedMembers(new Set())
        setCreating(false)
      }
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(group: Group) {
    setEditingId(group.id)
    setEditName(group.name)
    setEditMembers(new Set(group.work_group_members.map((m) => m.student_id)))
  }

  async function saveEdit(groupId: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, member_ids: Array.from(editMembers) }),
      })
      if (!res.ok) { alert('Error al guardar el grupo.'); return }
      onGroupsChange(
        groups.map((g) =>
          g.id === groupId
            ? { ...g, name: editName, work_group_members: Array.from(editMembers).map((sid) => ({ student_id: sid })) }
            : g
        )
      )
      setEditingId(null)
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteGroup(groupId: string, name: string) {
    if (!confirm(`¿Eliminar el grupo "${name}"?`)) return
    try {
      const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' })
      if (!res.ok) { alert('Error al eliminar el grupo.'); return }
      onGroupsChange(groups.filter((g) => g.id !== groupId))
    } catch {
      alert('No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.')
    }
  }

  function toggleMember(set: Set<string>, sid: string, setter: (s: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(sid)) next.delete(sid)
    else next.add(sid)
    setter(next)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold">Grupos de trabajo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Existing groups */}
          {groups.map((group) => {
            const members = students.filter((s) =>
              group.work_group_members.some((m) => m.student_id === s.id)
            )
            const isEditing = editingId === group.id

            return (
              <div key={group.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
                  {isEditing ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border rounded-lg px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    <span className="flex-1 font-medium text-gray-800">{group.name}</span>
                  )}
                  <span className="text-xs text-gray-400">{members.length} integrantes</span>
                  {isEditing ? (
                    <div className="flex gap-1">
                      <button onClick={() => saveEdit(group.id)} disabled={saving} className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg">Guardar</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">Cancelar</button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(group)} className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1">Editar</button>
                      <button onClick={() => deleteGroup(group.id, group.name)} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1">Eliminar</button>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3">
                  {isEditing ? (
                    <div className="grid grid-cols-2 gap-1">
                      {students.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => toggleMember(editMembers, s.id, setEditMembers)}
                          className={`text-left text-sm px-2 py-1 rounded-lg transition-colors ${
                            editMembers.has(s.id)
                              ? 'bg-blue-100 text-blue-800 font-medium'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {editMembers.has(s.id) ? '✓ ' : ''}{s.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {members.length === 0 ? (
                        <span className="text-xs text-gray-400">Sin integrantes</span>
                      ) : (
                        members.map((s) => (
                          <span key={s.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            {s.name.split(',')[0]}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Create new group */}
          {creating ? (
            <div className="border-2 border-blue-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-50">
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createGroup()}
                  placeholder="Nombre del grupo (ej: Grupo 1)"
                  className="flex-1 border rounded-lg px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button onClick={createGroup} disabled={saving || !newGroupName.trim()} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                  {saving ? '...' : 'Crear'}
                </button>
                <button onClick={() => { setCreating(false); setNewGroupName(''); setSelectedMembers(new Set()) }} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-gray-500 mb-2">Selecciona las integrantes:</p>
                <div className="grid grid-cols-2 gap-1">
                  {students.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => toggleMember(selectedMembers, s.id, setSelectedMembers)}
                      className={`text-left text-sm px-2 py-1 rounded-lg transition-colors ${
                        selectedMembers.has(s.id)
                          ? 'bg-blue-100 text-blue-800 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {selectedMembers.has(s.id) ? '✓ ' : ''}{s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={startCreating}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              + Nuevo grupo
            </button>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
