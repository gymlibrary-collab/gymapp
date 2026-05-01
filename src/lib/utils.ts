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
