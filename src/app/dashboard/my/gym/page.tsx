'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, uploadToStorage } from '@/lib/utils'
import { Building2, MapPin, Maximize2, Calendar, ImageIcon, Upload, CheckCircle, AlertCircle } from 'lucide-react'

export default function MyGymPage() {
  const [gym, setGym] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.replace('/dashboard'); return }
      const { data: me } = await supabase.from('users').select('role, manager_gym_id').eq('id', authUser.id).single()
      if (!me || me.role !== 'manager' || !me.manager_gym_id) { router.replace('/dashboard'); return }

      const { data: gymData } = await supabase.from('gyms').select('*').eq('id', me.manager_gym_id).single()
      setGym(gymData)
      setLogoPreview(gymData?.logo_url ? gymData.logo_url + '?t=' + Date.now() : null)
      setLoading(false)
    }
    load()
  }, [])

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !gym) return
    setUploading(true); setError('')

    // Show preview immediately
    setLogoPreview(URL.createObjectURL(file))

    if (file.size > 2 * 1024 * 1024) {
      setError('Image exceeds 2MB. Please choose a smaller file.'); setUploading(false); return
    }

    const path = `gym-${gym.id}`
    // Use upsert:true — no need to remove first, and remove() on a
    // non-existent object triggers an RLS error when the row doesn't exist.
    const uploaded = await uploadToStorage(supabase, file, 'gym-logos', path)
    if (!uploaded) { setUploading(false); return }

    const logoUrl = data.publicUrl.split('?')[0]
    await supabase.from('gyms').update({ logo_url: logoUrl }).eq('id', gym.id)
    setGym((g: any) => ({ ...g, logo_url: logoUrl }))
    setLogoPreview(logoUrl + '?t=' + Date.now())
    setUploading(false)
    showMsg('Logo updated')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  if (!gym) return (
    <div className="card p-8 text-center max-w-lg mx-auto">
      <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500 text-sm">No gym assigned to your account. Contact Business Operations.</p>
    </div>
  )

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Gym</h1>
        <p className="text-sm text-gray-500">Your assigned gym club details</p>
      </div>

      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="card p-5 space-y-5">
        {/* Logo */}
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
            {logoPreview
              ? <img src={logoPreview} alt={gym.name} className="w-full h-full object-contain p-1"
                  onError={() => setLogoPreview(null)} />
              : <ImageIcon className="w-8 h-8 text-gray-300" />
            }
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-2">Gym logo shown in the sidebar for all staff at this gym.</p>
            <label htmlFor="gym-logo" className="btn-secondary cursor-pointer inline-flex items-center gap-2 text-xs">
              {uploading
                ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600" /> Uploading...</>
                : <><Upload className="w-3.5 h-3.5" /> {logoPreview ? 'Change Logo' : 'Upload Logo'}</>
              }
            </label>
            <input id="gym-logo" type="file" accept="image/*" className="hidden"
              disabled={uploading} onChange={handleLogoChange} />
            <p className="text-xs text-gray-400 mt-1">PNG, JPG or SVG · Square image recommended · Max 2MB</p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-3">
          {/* Name */}
          <div className="flex items-start gap-3">
            <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400">Gym Name</p>
              <p className="text-sm font-semibold text-gray-900">{gym.name}</p>
            </div>
          </div>

          {/* Address */}
          {gym.address ? (
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Address</p>
                <p className="text-sm text-gray-900">{gym.address}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Address</p>
                <p className="text-sm text-gray-400 italic">Not set — contact Business Operations</p>
              </div>
            </div>
          )}

          {/* Size */}
          {gym.size_sqft ? (
            <div className="flex items-start gap-3">
              <Maximize2 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Size</p>
                <p className="text-sm text-gray-900">
                  {gym.size_sqft.toLocaleString('en-SG', { maximumFractionDigits: 2 })} sq ft
                </p>
              </div>
            </div>
          ) : null}

          {/* Date Opened */}
          {gym.date_opened ? (
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Date Opened</p>
                <p className="text-sm text-gray-900">{formatDate(gym.date_opened)}</p>
              </div>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
          To update gym name, address, or size, contact Business Operations.
        </p>
      </div>
    </div>
  )
}
