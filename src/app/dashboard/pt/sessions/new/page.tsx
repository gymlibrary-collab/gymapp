'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate, cn } from '@/lib/utils'
import { queueWhatsApp } from '@/lib/whatsapp'
import { ArrowLeft, Calendar, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function NewPtSessionPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['trainer', 'manager'] })
  if (loading || !user) return null


  const { logActivity } = useActivityLog()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [packages, setPackages] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [doubleBookingWarning, setDoubleBookingWarning] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  const [form, setForm] = useState({
    member_id: searchParams.get('member') || '',
    package_id: searchParams.get('package') || '',
    scheduled_at_date: '',
    scheduled_at_time: '09:00',
    duration_minutes: '60',
    location: '',
    notes: '',
    attending_member_id: '',  // for shared packages — which member is attending
  })

  const supabase = createClient()
}
