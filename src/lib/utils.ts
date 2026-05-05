import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSGD(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy')
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy, h:mm a')
}

export function formatTimeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function getMonthName(month: number): string {
  return format(new Date(2024, month - 1, 1), 'MMMM')
}

export function calculateAge(dob: string): number {
  const today = new Date()
  const birthDate = new Date(dob)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}

export function getSessionsRemaining(totalSessions: number, sessionsUsed: number): number {
  return Math.max(0, totalSessions - sessionsUsed)
}

export function getPackageProgress(totalSessions: number, sessionsUsed: number): number {
  return Math.round((sessionsUsed / totalSessions) * 100)
}

export const MOTIVATIONAL_MESSAGES = [
  "💪 Every session brings you closer to your goals!",
  "🔥 Consistency is the key to transformation!",
  "⚡ Today's effort is tomorrow's result!",
  "🏆 Champions are made in the gym!",
  "💥 Push your limits and discover your potential!",
  "🌟 You're stronger than yesterday!",
  "🎯 One more session. One step closer!",
  "🚀 Progress, not perfection. See you soon!",
]

export function getRandomMotivationalMessage(): string {
  return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)]
}

export function formatWhatsAppReminder({
  clientName,
  trainerName,
  scheduledAt,
  location,
  gymName,
}: {
  clientName: string
  trainerName: string
  scheduledAt: string
  location?: string
  gymName: string
}): { clientMessage: string; trainerMessage: string } {
  const dateStr = formatDateTime(scheduledAt)
  const motivation = getRandomMotivationalMessage()

  const clientMessage = `Hi ${clientName}! 👋\n\nReminder: Your training session with *${trainerName}* is tomorrow!\n\n📅 *${dateStr}*\n📍 ${location || gymName}\n\n${motivation}\n\nSee you there! 🏋️`

  const trainerMessage = `Hi ${trainerName}! 👋\n\nReminder: You have a session with *${clientName}* tomorrow!\n\n📅 *${dateStr}*\n📍 ${location || gymName}\n\nGet ready to inspire! 💪`

  return { clientMessage, trainerMessage }
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Admin',
    business_ops: 'Business Ops',
    manager: 'Manager',
    trainer: 'Trainer',
    staff: 'Staff',
  }
  return labels[role] ?? role
}

// ── Role badge colours ────────────────────────────────────────
// Returns a Tailwind bg+text colour string for a given role.
// Teal for trainer avoids clash with the green "Active" badge.
export function roleBadgeClass(role: string): string {
  const classes: Record<string, string> = {
    admin:        'bg-red-100 text-red-700',
    business_ops: 'bg-purple-100 text-purple-700',
    manager:      'bg-yellow-100 text-yellow-800',
    trainer:      'bg-teal-100 text-teal-700',
    staff:        'bg-blue-100 text-blue-700',
  }
  return classes[role] || 'bg-gray-100 text-gray-600'
}

// ── Storage logo upload ───────────────────────────────────────
// Generic logo upload helper. Uploads file to the given bucket
// at the given path (upsert — overwrites existing). Returns the
// public URL with a cache-busting timestamp, or null on failure.
export async function uploadToStorage(
  supabase: any,
  file: File,
  bucket: string,
  path: string,
  maxMb = 2
): Promise<string | null> {
  if (file.size > maxMb * 1024 * 1024) {
    alert(`Image exceeds ${maxMb}MB. Please choose a smaller file.`)
    return null
  }
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, cacheControl: '0' })
  if (error) {
    console.error('Storage upload error:', error)
    alert(`Upload failed: ${error.message}`)
    return null
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl + '?t=' + Date.now()
}
