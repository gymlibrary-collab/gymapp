'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { FileText, Download, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { cn , nowSGT } from '@/lib/utils'
import { PageSpinner } from '@/components/PageSpinner'

export default function AnnualStatementPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const { error, showError, setError } = useToast()
  const supabase = createClient()

  const [gyms, setGyms] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [selectedGym, setSelectedGym] = useState('')
  const [selectedYear, setSelectedYear] = useState(nowSGT().getUTCFullYear() - 1)
  const [staffResults, setStaffResults] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    if (!user) return
    const load = async () => {
      logActivity('page_view', 'Annual Statements', 'Viewed annual income statement page')
      const { data: gymsData } = await supabase.from('gyms').select('id, name, address, logo_url').eq('is_active', true).order('name')
      setGyms(gymsData || [])
      if (gymsData && gymsData.length > 0) {
        // Manager: default to their gym
        const defaultGym = user.role === 'manager' && user.manager_gym_id
          ? gymsData.find(g => g.id === user.manager_gym_id)?.id || gymsData[0].id
          : gymsData[0].id
        setSelectedGym(defaultGym)
      }
    }
    load().finally(() => setDataLoading(false))
  }, [user])

  // Load qualifying staff whenever gym or year changes
  useEffect(() => {
    if (!selectedGym || !selectedYear) return
    const loadStaff = async () => {
      setLoadingStaff(true)
      setStaffResults([])

      // Get all users who have payslips or commission payouts for this gym+year
      const yearStart = `${selectedYear}-01-01`
      const yearEnd   = `${selectedYear}-12-31`

      const { data: payslipUsers } = await supabase.from('payslips')
        .select('user_id')
        .eq('gym_id', selectedGym)
        .eq('period_year', selectedYear)
        .in('status', ['approved', 'paid'])

      // commission_payouts removed — commission payslips unified in payslips table
      const allUserIds = Array.from(new Set(
        (payslipUsers || []).map((p: any) => p.user_id)
      ))

      if (allUserIds.length === 0) {
        setStaffResults([])
        setLoadingStaff(false)
        return
      }

      const { data: staffData } = await supabase.from('users')
        .select('id, full_name, nric, employment_type, date_of_joining')
        .in('id', allUserIds)
        .eq('is_archived', false)
        .order('full_name')

      // Count payslips and payouts per staff for display
      const results = await Promise.resolve((staffData || []).map((s: any) => {
        const slipCount = (payslipUsers || []).filter((p: any) => p.user_id === s.id).length
        return { ...s, slipCount }
      }))

      setStaffResults(results)
      setLoadingStaff(false)
    }
    loadStaff()
  }, [selectedGym, selectedYear])

  const handleDownload = async () => {
    if (!selectedGym || staffResults.length === 0) return
    setGenerating(true)
    setProgress('Loading data...')
    setError('')

    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const { renderAnnualStatementPdf } = await import('@/lib/pdf')
      const JSZip = await new Promise<any>((resolve, reject) => {
        if ((window as any).JSZip) { resolve((window as any).JSZip); return }
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
        script.onload = () => resolve((window as any).JSZip)
        script.onerror = () => reject(new Error('Failed to load zip library'))
        document.head.appendChild(script)
      })

      const zip = new JSZip()
      const gym = gyms.find(g => g.id === selectedGym)
      const gymName = gym?.name || 'Gym'
      const gymAddress = gym?.address || null
      const logoUrl = gym?.logo_url || null
      const yearStart = `${selectedYear}-01-01`
      const yearEnd   = `${selectedYear}-12-31`

      for (const staff of staffResults) {
        setProgress(`Generating statement for ${staff.full_name}...`)

        const { data: payslips } = await supabase.from('payslips')
          .select('*')
          .eq('user_id', staff.id)
          .eq('gym_id', selectedGym)
          .eq('period_year', selectedYear)
          .in('status', ['approved', 'paid'])
          .order('period_month')

        const doc = new jsPDF()
        await renderAnnualStatementPdf(
          doc, autoTable,
          selectedYear,
          staff,
          { logoUrl, gymName, gymAddress },
          payslips || []
        )
        zip.file(`AnnualStatement-${staff.full_name}-${selectedYear}.pdf`, doc.output('arraybuffer'))
      }

      setProgress('Zipping files...')
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a'); a.href = url
      a.download = `${gymName.replace(/\s+/g, '_')}_AnnualStatements_${selectedYear}.zip`
      a.click(); URL.revokeObjectURL(url)

      logActivity('export', 'Annual Statements', `Downloaded annual statements for ${gymName} ${selectedYear}`)
      setProgress(`Done — ${staffResults.length} statements downloaded`)
    } catch (err: any) {
      showError('Download failed: ' + (err?.message || 'Unknown error'))
      setProgress('')
    } finally {
      setGenerating(false)
    }
  }

  if (loading || dataLoading) return <PageSpinner />
  if (!user) return null

  const availableYears = Array.from({ length: 5 }, (_, i) => nowSGT().getUTCFullYear() - 1 - i)

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/payroll" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Annual Income Statements</h1>
          <p className="text-sm text-gray-500">Generate annual statements for income tax reporting</p>
        </div>
      </div>

      <StatusBanner error={error} onDismissError={() => setError('')} />

      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-red-600" />
          <h2 className="font-semibold text-gray-900 text-sm">Select Gym & Year</h2>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Gym Outlet</label>
            <select className="input" value={selectedGym} onChange={e => setSelectedGym(e.target.value)}>
              {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <select className="input" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Staff list */}
        {loadingStaff ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
            Loading staff data...
          </div>
        ) : staffResults.length === 0 && selectedGym ? (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-500">No approved or paid payslips found for this gym and year.</p>
          </div>
        ) : staffResults.length > 0 ? (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {staffResults.map((s, idx) => (
              <div key={s.id} className={cn('flex items-center justify-between px-4 py-3', idx < staffResults.length - 1 && 'border-b border-gray-100')}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.employment_type === 'part_time' ? 'Part-time' : 'Full-time'}
                    {s.slipCount > 0 && ` · ${s.slipCount} payslip${s.slipCount !== 1 ? 's' : ''}`}
                    {s.payoutCount > 0 && ` · ${s.payoutCount} commission payout${s.payoutCount !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Ready</span>
              </div>
            ))}
          </div>
        ) : null}

        {staffResults.length > 0 && (
          <button
            onClick={handleDownload}
            disabled={generating}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {generating ? 'Generating...' : `Download ZIP (${staffResults.length} statement${staffResults.length !== 1 ? 's' : ''})`}
          </button>
        )}

        {progress && (
          <div className={cn('text-xs px-3 py-2 rounded-lg', progress.startsWith('Done') ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700')}>
            {progress.startsWith('Done') ? '✓ ' : '⏳ '}{progress}
          </div>
        )}

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-700">Zip structure:</p>
          <p className="font-mono">GymName_AnnualStatements_{selectedYear}.zip/</p>
          <p className="font-mono ml-4">AnnualStatement-StaffName-{selectedYear}.pdf</p>
          <p className="font-mono ml-4">...</p>
        </div>
      </div>
    </div>
  )
}
