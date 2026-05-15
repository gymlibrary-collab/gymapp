import { nowSGT } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'


export async function GET(request: NextRequest) {
  return runCron(request, 'check-staff-birthdays', 'daily', async (supabase) => {

    const now = nowSGT() // SGT
    const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const todayMMDD = `${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
    const in7DaysMMDD = `${String(in7Days.getUTCMonth() + 1).padStart(2, '0')}-${String(in7Days.getUTCDate()).padStart(2, '0')}`
    const { data: staff } = await supabase.from('users')
      .select('id, full_name, nickname, role, date_of_birth, is_archived, manager_gym_id, trainer_gyms(gym_id), gym:gyms!users_manager_gym_id_fkey(name)')
      .in('role', ['trainer', 'staff', 'manager', 'business_ops']).eq('is_archived', false)
      .not('date_of_birth', 'is', null)
    const birthdayStaff = (staff || []).filter((s: any) => {
      if (!s.date_of_birth) return false
      const mmdd = s.date_of_birth.substring(5)
      return todayMMDD <= in7DaysMMDD
        ? (mmdd >= todayMMDD && mmdd <= in7DaysMMDD)
        : (mmdd >= todayMMDD || mmdd <= in7DaysMMDD)
    })
    await supabase.from('staff_birthday_reminders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (birthdayStaff.length > 0) {
      const rows = birthdayStaff.map((s: any) => {
        const mmdd = s.date_of_birth.substring(5)
        const year = now.getUTCMonth() + 1 > parseInt(mmdd.split('-')[0])
          ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
        const birthdayDate = `${year}-${mmdd}`
        const daysUntil = Math.round((new Date(birthdayDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        const gymId = s.role === 'manager' ? s.manager_gym_id : (s.trainer_gyms?.[0]?.gym_id || null)
        const gymName = s.gym?.name || null
        return { user_id: s.id, full_name: s.full_name, nickname: s.nickname || s.full_name.split(' ')[0], role: s.role, gym_id: gymId, gym_name: gymName, date_of_birth: s.date_of_birth, days_until_birthday: daysUntil, birthday_date: birthdayDate, refreshed_at: now.toISOString() }
      })
      await supabase.from('staff_birthday_reminders').insert(rows)
    }
    return { birthdays_found: birthdayStaff.length, refreshed_at: todayStr }
  })
}
