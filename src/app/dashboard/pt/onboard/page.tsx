'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD, formatDate } from '@/lib/utils'
import { Package, User, Calendar, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function PtOnboardPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops'] })
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const router = useRouter()
  const { success, error, showMsg, showError, setError } = useToast()
  const [activeMembers, setActiveMembers] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [saving, setSaving] = useState(false)


  const [tab, setTab] = useState<'renew' | 'new'>('renew')
  const [form, setForm] = useState({
    member_id: '',
    template_id: '',
    start_date: new Date().toISOString().split('T')[0],
    secondary_member_id: '',
  })
  const [trainerMembers, setTrainerMembers] = useState<any[]>([]) // members with active package by this trainer
  if (loading || !user) return null
}
