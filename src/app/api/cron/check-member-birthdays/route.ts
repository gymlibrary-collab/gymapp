import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'


export async function GET(request: NextRequest) {
  return runCron(request, 'check-member-birthdays', 'daily', async (supabase) => {

    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const todayMMDD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const { data: members } = await supabase.from('members')
      .select('id, full_name, date_of_birth, gym_id, gym:gyms(name), packages(trainer_id, status, manager_confirmed, trainer:users!packages_trainer_id_fkey(full_name, nickname))')
      .not('date_of_birth', 'is', null)
    const birthdayMembers = (members || []).filter((m: any) => m.date_of_birth && m.date_of_birth.substring(5) === todayMMDD)
    await supabase.from('member_birthday_reminders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (birthdayMembers.length > 0) {
      const rows: any[] = []
      for (const m of birthdayMembers) {
        const dob = new Date(m.date_of_birth)
        const age = now.getFullYear() - dob.getFullYear()
        const activePkgs = (m.packages || []).filter((p: any) => p.status === 'active' && p.manager_confirmed)
        if (activePkgs.length > 0) {
          for (const pkg of activePkgs) {
            rows.push({ member_id: m.id, full_name: m.full_name, gym_id: m.gym_id, gym_name: m.gym?.name, date_of_birth: m.date_of_birth, age, birthday_date: todayStr, trainer_id: pkg.trainer_id, trainer_names: pkg.trainer?.nickname || pkg.trainer?.full_name?.split(' ')[0] || null, refreshed_at: now.toISOString() })
          }
        } else {
          rows.push({ member_id: m.id, full_name: m.full_name, gym_id: m.gym_id, gym_name: m.gym?.name, date_of_birth: m.date_of_birth, age, birthday_date: todayStr, trainer_id: null, trainer_names: null, refreshed_at: now.toISOString() })
        }
      }
      await supabase.from('member_birthday_reminders').insert(rows)
    }
    return { birthdays_found: birthdayMembers.length, refreshed_at: todayStr }
  })
}
