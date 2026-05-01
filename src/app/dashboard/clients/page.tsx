'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Client, User } from '@/types'
import { formatDate, calculateAge } from '@/lib/utils'
import { Search, Plus, UserCheck, UserX, Clock } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const statusConfig = {
  active: { label: 'Active', className: 'badge-active' },
  inactive: { label: 'Inactive', className: 'badge-inactive' },
  lost: { label: 'Lost', className: 'badge-danger' },
}

export default function ClientsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      setUser(userData)

      let query = supabase
        .from('clients')
        .select('*, users(full_name), gyms(name)')
        .order('created_at', { ascending: false })

      if (userData?.role === 'trainer') {
        query = query.eq('trainer_id', authUser.id)
      }

      const { data } = await query
      setClients(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = clients.filter(c => {
    const matchSearch = c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const isTrainer = user?.role === 'trainer'

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isTrainer ? 'My Clients' : 'All Clients'}</h1>
          <p className="text-sm text-gray-500">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {isTrainer && (
          <Link href="/dashboard/clients/new" className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Client
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <div className="flex gap-1">
          {['all', 'active', 'inactive', 'lost'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors',
                statusFilter === s ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Client List */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No clients found</p>
          {isTrainer && (
            <Link href="/dashboard/clients/new" className="btn-primary inline-block mt-3">
              Add your first client
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(client => (
            <Link
              key={client.id}
              href={`/dashboard/clients/${client.id}`}
              className="card p-4 flex items-center gap-3 hover:border-green-200 transition-colors block"
            >
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-green-700 font-semibold text-sm">
                  {client.full_name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 text-sm truncate">{client.full_name}</p>
                  <span className={statusConfig[client.status].className}>
                    {statusConfig[client.status].label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {client.phone}
                  {client.date_of_birth && ` · Age ${calculateAge(client.date_of_birth)}`}
                  {(client as any).gyms?.name && ` · ${(client as any).gyms.name}`}
                </p>
              </div>
              <div className="text-xs text-gray-400 flex-shrink-0">
                {formatDate(client.created_at)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
