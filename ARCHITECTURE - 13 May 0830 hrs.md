# GymApp — Shared Utilities & Architecture Reference

This file documents all centralised functions, hooks, and helpers.
**Always check here before writing new utility logic in a page file.**

**Last updated: 13 May 2026**

---

## `src/lib/utils.ts`

| Export | Purpose | Usage |
|---|---|---|
| `cn(...classes)` | Merges Tailwind class names | `className={cn('base', condition && 'extra')}` |
| `formatSGD(amount)` | SGD currency format | `formatSGD(1234.5)` → `$1,234.50` |
| `formatDate(date)` | `dd MMM yyyy` format | `formatDate('2026-05-01')` → `01 May 2026` |
| `formatDateTime(date)` | Date + time format | `formatDateTime(iso)` |
| `formatTimeAgo(date)` | Relative time | `formatTimeAgo(date)` → `2 hours ago` |
| `getMonthName(month)` | Month number → name | `getMonthName(5)` → `May` |
| `calculateAge(dob)` | Age in whole years | `calculateAge('1990-01-01')` |
| `getRoleLabel(role)` | DB role → display label | `getRoleLabel('business_ops')` → `Business Ops` |
| `roleBadgeClass(role)` | DB role → Tailwind badge colour | `className={roleBadgeClass(role)}` |
| `uploadToStorage(supabase, file, bucket, path, maxMb?)` | Upload to Supabase Storage | Returns public URL or null |
| `getGreeting(nickname)` | Time-appropriate greeting | `getGreeting('Alex')` → `Good morning, Alex` |
| `getDisplayName(user)` | nickname or first word of full_name | Used in all dashboard greetings |

### getGreeting + getDisplayName usage
```typescript
import { getGreeting, getDisplayName } from '@/lib/utils'
{getGreeting(getDisplayName(user))}
```

### roleBadgeClass colour map
| Role | Colour |
|---|---|
| `admin` | Red |
| `business_ops` | Purple |
| `manager` | Yellow |
| `trainer` | Teal |
| `staff` | Blue |

---

## `src/lib/pdf.ts`

| Export | Purpose |
|---|---|
| `PDF_TABLE_STYLE` | Standard autoTable style (red header, right-aligned amounts) |
| `loadLogoAsBase64(url)` | Fetches logo URL → base64 data URL |
| `getImageDimensions(src)` | Returns natural `{ w, h }` of an image |
| `addLogoHeader(doc, logoUrl, title, fontSize?)` | Renders gym logo + title, returns Y position |

---

## `src/lib/cpf.ts`

| Export | Purpose |
|---|---|
| `getAgeAsOf(dob, refDate)` | Whole-number age as of reference date |
| `getCpfBracketRates(brackets, dob, year, month)` | Returns `{ employee_rate, employer_rate }` |

**CPF bracket boundary rule:** Age calculated as of the last day of the payroll month.

---

## `src/lib/dashboard.ts`

Shared query functions used by multiple dashboard components.

| Export | Purpose |
|---|---|
| `fetchPendingMemberships(supabase, gymId)` | Pending membership sales |
| `fetchPendingSessionConfirmations(supabase, gymId)` | Sessions awaiting confirmation |
| `fetchUpcomingSessions(supabase, opts)` | Upcoming sessions within 7 days |
| `fetchLowSessionPackages(supabase, opts)` | Packages with ≤2 sessions remaining |
| `fetchExpiringPackages(supabase, opts)` | Packages expiring within N days |
| `fetchExpiringMemberships(supabase, gymId, opts)` | Memberships expiring within N days |
| `fetchAtRiskMembers(supabase, gymId)` | Members with no sessions in 30 days |
| `fetchPendingLeave(supabase, gymId, userId)` | Pending leave (excludes manager's own) |
| `fetchNotifications(supabase, userId, role)` | Rejection notifications |
| `fetchPayslipNotifications(supabase, userId, ...)` | New payslip/commission notifications |
| `dismissPayslipNotifications(supabase, userId)` | Marks payslip/commission notifications seen |

---

## `src/hooks/useToast.ts`

| Return | Type | Purpose |
|---|---|---|
| `success` | `string` | Current success message |
| `error` | `string` | Current error message |
| `showMsg(msg)` | `function` | Success toast, auto-dismisses after 3s |
| `showError(msg)` | `function` | Error toast, auto-dismisses after 3s |
| `setError` | `setState` | Direct setter for inline validation errors |

---

## `src/components/StatusBanner.tsx`

```tsx
<StatusBanner success={success} error={error} onDismissError={() => setError('')} />
```

---

## Supabase Clients

| Import | Use when |
|---|---|
| `createClient()` from `@/lib/supabase-browser` | Client components |
| `createServerClient()` from `@/lib/supabase-server` | Server components and route handlers |
| `createAdminClient()` from `@/lib/supabase-server` | API routes needing service role |

---

## dataLoading Pattern

Every page that loads data must use this pattern to prevent flash of empty state messages.

**The problem:** `useCurrentUser` finishes → `loading = false` → page renders → but page data queries haven't finished yet → "No staff found" flashes briefly.

**The fix:**
```typescript
const [data, setData] = useState<any[]>([])
const [dataLoading, setDataLoading] = useState(true)  // starts true

useEffect(() => {
  if (!user) return
  load().finally(() => setDataLoading(false))  // always fires, even on error
}, [user])

if (loading || !user || dataLoading) return <Spinner />  // guard all three
```

**Rules:**
1. Initialise `dataLoading` to `true`
2. Use `.finally(() => setDataLoading(false))` — not inside load body
3. Include `dataLoading` in loading guard
4. Never put `setDataLoading(false)` only inside `reload()` — must be on initial `load()` call

---

## Manager Dashboard — Two-Phase Loading

**Phase 1 (critical — renders dashboard immediately):**
- Today's sessions, stats, pending confirmations, pending counts, notifications
- → `setLoading(false)` called here

**Phase 2 (non-critical — loads after dashboard visible):**
- Upcoming sessions, gym schedule (heaviest), package alerts, expiring memberships, at-risk members, pending leave

---

## Staff Onboarding Form Layout

Consistent across Admin, Biz Ops, and Manager portals:

| Row | Left | Right |
|---|---|---|
| 1 | Full Name * | Nickname * |
| 2 | NRIC / FIN / Passport | (full width) |
| 3 | Residential Address | (full width) |
| 4 | Phone * | Email * |
| 5 | Nationality | Date of Birth |
| 6 | Date of Joining | Date of Departure |
| 7 | Probation End Date | Annual Leave Entitlement * (Biz Ops/Admin only) |
| 8 | Probation passed checkbox | (if end date set) |

**Edit form only (Biz Ops):** Leave Carry-Forward Days below probation section.
**Medical/Hospitalisation leave:** commented out (not yet implemented).

---

## Nickname Field

`nickname` is mandatory on `users` table. Used in:
- Dashboard greeting: `Good morning, Alex`
- Staff birthday panel banner and list
- WhatsApp session reminder message

Default for existing records: first word of `full_name` (auto-populated by migration v73).

---

## Leave Management Rules

### Cross-year leave block
- `end_date` capped at Dec 31 of `start_date` year via `max` attribute
- Submission blocked if dates cross year boundary — staff must split into two applications

### New year leave block
- Blocked if `start_date` year > `app_settings.leave_reset_year`
- Unblocked when Biz Ops runs year-end reset

### Year-end bulk reset logic
```
closing_year = current_year - 1
days_taken = SUM(approved annual leave in closing_year)
unused = MAX(0, (leave_entitlement_days + leave_carry_forward_days) - days_taken)
carry_forward = MIN(unused, max_carry_forward_cap)
```

**Pre-conditions:**
1. Button available in January only
2. Disabled after reset run for the year
3. Checks for unresolved pending December leave first

---

## Cron Jobs

### Schedule
| Cron | SGT | UTC (vercel.json) |
|---|---|---|
| `/api/cron/prepare-reminders` | 0600 | `"0 22 * * *"` |
| `/api/cron/reminders` | 0800 | `"0 0 * * *"` |
| `/api/cron/daily` | 0001 | `"1 17 * * *"` |

### WhatsApp Reminder Flow
1. **0600 cron** — truncates `session_reminder_members_list`, queries tomorrow's scheduled PT sessions, inserts rows with member name/phone, trainer nickname, session date/time, gym name
2. **0800 cron** — reads queue where `reminder_sent = false`, re-checks `sessions.status = 'scheduled'`, loads `pt_reminder_client_24h` template, replaces `{{member_name}}` `{{trainer_nickname}}` `{{session_date}}` `{{session_time}}` `{{gym_name}}`, sends via Twilio, updates `reminder_sent`/`reminder_failed`, logs to `whatsapp_logs`

### Cron Logging
```
cron_logs: id, cron_name, run_by, source ('daily'|'reminder'), started_at, ended_at, duration_ms, status, result (jsonb), error
```

---

## Notifications

| Table | Written when | Dismissed when |
|---|---|---|
| `pkg_rejection_notif` | PT package rejected | Trainer clicks Dismiss |
| `mem_rejection_notif` | Membership sale rejected | Seller clicks Dismiss |
| `cancellation_rejection_notif` | Cancellation request rejected | Staff/Trainer clicks Dismiss |
| `cancellation_approved_notif` | Cancellation request approved | Biz Ops clicks Dismiss |
| `leave_decision_notif` | Leave approved or rejected | Applicant clicks Dismiss |
| `staff_birthday_reminders` | Daily cron | Auto-refreshed daily |
| `member_birthday_reminders` | Daily cron | Auto-refreshed daily |
| `session_reminder_members_list` | 0600 cron | Truncated and repopulated daily |

**Birthday panel visibility:**
- Staff birthday panel: Manager and Biz Ops dashboards only
- Member birthday tile: Manager, Staff, Trainer dashboards

**Year-end reset reminder (Biz Ops):**
- 28–31 Dec: shows every login, session-only dismiss
- 1 Jan: shows on first load, permanent dismiss stored in `app_settings.leave_reset_reminder_seen_at`

---

## Activity Logging

**Every new page and action handler MUST include activity logging.**

```typescript
import { useActivityLog } from '@/hooks/useActivityLog'
const { logActivity } = useActivityLog()

// Page view (fire-and-forget)
logActivity('page_view', 'Page Name', 'Viewed page description')

// Action (after successful operation)
logActivity('confirm', 'PT Package Sales', 'Confirmed PT package sale')
```

### Action types
`login` · `page_view` · `create` · `update` · `delete` · `confirm` · `reject` · `approve` · `export` · `other`

### Rules
1. Never log content — describe WHAT, not the data
2. Never log sensitive fields (salary, CPF, NRIC)
3. Never await page_view logs
4. Page name must match sidebar nav label exactly

---

## Commission Eligibility Rules

### PT Signup: `manager_confirmed = true AND signup_commission_paid = false AND status != 'cancelled'`
### PT Session: `status = 'completed' AND is_notes_complete = true AND manager_confirmed = true AND commission_paid = false`
### Membership: `sale_status = 'confirmed' AND commission_paid = false`

---

## 48-Hour Escalation

| State | Manager queue | Biz Ops queue |
|---|---|---|
| `escalated_to_biz_ops = false` | ✅ Visible | ❌ Hidden |
| `escalated_to_biz_ops = true` | ❌ Hidden | ✅ Visible |

---

## PT Package Reassignment

Manager and Biz Ops can reassign any pending or confirmed package to a different trainer via PT Package Sales → Reassign button. Trainer archiving blocked if trainer has active/pending packages.

---

## Migration Index

| Migration | Description |
|---|---|
| v1–v58 | See earlier ARCHITECTURE docs for full history |
| v59–v68 | Leave enhancements, escalation config, Biz Ops dashboard, WhatsApp system |
| v69 | staff_birthday_reminders |
| v70 | member_birthday_reminders |
| v71 | cron_logs |
| v72 | membership_cancellation_requests, cancellation_rejection_notif, cancellation_approved_notif |
| v73 | nickname on users and staff_birthday_reminders |
| v74 | leave_reset_year and leave_reset_reminder_seen_at on app_settings |
| v75 | session_reminder_members_list, cron_logs.source, pt_reminder_client_24h template |

---

## Conventions

- **No Promise.all() with Supabase** — sequential awaits only (except Biz Ops bulk gym reads)
- **createAdminClient** in API routes and crons only — never in browser components
- **RLS on users table is disabled** — app-layer security instead
- **useCurrentUser must be FIRST hook** in every component
- **dataLoading pattern** — required on every data-loading page
- **Nickname is mandatory** — include in all staff create/edit forms and API handlers
- **Leave year boundary** — never allow cross-year; block new year until reset runs
- **Cron auth** — all cron routes check `Authorization: Bearer ${CRON_SECRET}`
