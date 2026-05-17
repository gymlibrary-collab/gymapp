# GymApp — Architecture & Developer Reference

Last updated: 15 May 2026

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, `'use client'` components) |
| Database + Auth | Supabase (PostgreSQL + Google OAuth) |
| Styling | Tailwind CSS |
| PDF Export | jsPDF + jsPDF-AutoTable |
| WhatsApp | Twilio WhatsApp API |
| Hosting | Vercel |

---

## Role Hierarchy

```
admin → business_ops → manager → trainer / staff (full-time or part-time)
```

| Role | Access |
|---|---|
| `admin` | System config, Biz Ops accounts, gym setup, activity/cron logs |
| `business_ops` | All gyms: HR, payroll, commissions, leave, configuration |
| `manager` | Own gym: members, sessions, duty roster, staff, reports |
| `trainer` | PT clients, sessions, commission, own account |
| `staff` | Member registration, membership sales, gym schedule, own account |

---

## Conventions

- **`Promise.all()` is safe for Supabase reads only** — never for writes (insert/update/delete must stay sequential). Approved patterns: dashboard load functions where multiple reads are independent (`ManagerDashboard`, `TrainerDashboard`, `StaffDashboard`, `payroll/page`), biz-ops bulk gym reads in `reports/page.tsx`, and `getGymStaffIds()` in `dashboard.ts`. Sequential await remains default for writes and anywhere a result feeds the next query.
- **`adminClient`** (`createAdminClient`) is used in API routes and auth callbacks only — never in browser components.
- **Date/time**: always use SGT. Use `nowSGT()` from `@/lib/utils` for current time. Use `getTodayStart()`, `getTodayEnd()`, `getMonthStart()`, `getDaysFromToday()` from `@/lib/dashboard` for query ranges.
- **Users table**: RLS enabled. Client queries use `users_safe` (non-sensitive) or direct `users` for own row. Sensitive data (salary, NRIC, commission rates) only via `adminClient` in API routes.
- **useCurrentUser hook must be the FIRST hook** in every component.
- **Set deduplication**: `Array.from(new Set([...a, ...b]))` — never `[...new Set()]`. `tsconfig.json` targets ES5 which does not support Set spread; the spread inside `Array.from` works because it spreads an array literal, not the Set itself.

---

## Shared Libraries

### `src/lib/utils.ts`

| Export | Purpose |
|---|---|
| `nowSGT()` | Returns current time as Date in SGT (UTC+8). Use `.getUTCFullYear()`, `.getUTCMonth()`, `.getUTCDate()` on result. |
| `todaySGT()` | Today's date as `YYYY-MM-DD` in SGT |
| `currentTimeSGT()` | Current time as `HH:MM` in SGT |
| `cn(...classes)` | Merges Tailwind class names safely |
| `formatSGD(amount)` | Formats number as SGD currency |
| `formatDate(date)` | `dd MMM yyyy` |
| `formatDateTime(date)` | `dd MMM yyyy, h:mm a` |
| `formatTimeAgo(date)` | Relative time string |
| `getMonthName(month)` | Month number → full name |
| `calculateAge(dob)` | Age in whole years from DOB to today (SGT) |
| `getRoleLabel(role)` | DB role → display label |
| `roleBadgeClass(role)` | DB role → Tailwind badge colour |
| `uploadToStorage(supabase, file, bucket, path, maxMb?)` | Upload file to Supabase Storage, returns public URL |
| `getGreeting(nickname)` | Time-aware greeting (SGT) |
| `withinWorkingDays(shiftDateStr, days, publicHolidays)` | Check if date is within N working days |
| `getDisplayName(user)` | Returns nickname if set, else first word of full_name |

### `src/lib/dashboard.ts`

| Export | Purpose |
|---|---|
| `getTodayStart()` | ISO datetime for start of today (SGT midnight) |
| `getTodayEnd()` | ISO datetime for end of today (23:59:59 SGT) |
| `getMonthStart()` | ISO datetime for start of current month (SGT) |
| `getDaysFromToday(days)` | YYYY-MM-DD string N days from today (SGT) |
| `getTodayStr()` | Today as YYYY-MM-DD (SGT) |
| `getGymStaffIds(supabase, gymId)` | Returns all staff IDs for a gym |
| `fetchPayslipNotifications(...)` | Payslip notification data for banners |
| `fetchPendingSessionConfirmations(...)` | Sessions awaiting manager confirmation |
| `fetchPendingMemberships(...)` | Membership sales pending confirmation |
| `fetchLowSessionPackages(...)` | Packages with ≤2 sessions remaining |
| `fetchExpiringPackages(...)` | Packages expiring within 30 days |
| `fetchExpiringMemberships(...)` | Memberships expiring within 30 days |
| `fetchAtRiskMembers(...)` | Members with no sessions in 30 days |
| `fetchNotifications(...)` | Cancellation and other notifications |
| `fetchPendingLeave(...)` | Leave applications pending approval |
| `fetchUpcomingSessions(...)` | Upcoming PT sessions for schedule view |

### `src/lib/pdf.ts`

| Export | Purpose |
|---|---|
| `renderUnifiedPayslipPdf(doc, autoTable, slip, staff, branding, allSlips)` | **Primary PDF renderer** — handles all payment types (salary/commission/combined). Shows all earnings rows (0.00 when not applicable), CPF detail, YTD summary, commission breakdown. |
| `resolvePayslipBranding(supabase, gymId)` | Loads gym logo + company name for PDF header |
| `loadLogoAsBase64(url)` | Fetches logo URL → base64 data URL |
| `getImageDimensions(src)` | Returns `{ w, h }` of an image |

### `src/lib/cpf.ts`

| Export | Purpose |
|---|---|
| `getAgeAsOf(dob, refDate)` | Whole-number age as of reference date |
| `getCpfBracketRates(brackets, dob, year, month)` | Returns `{ employee_rate, employer_rate }` for the bracket effective on the payroll period month |
| `getCpfCeilings(brackets, year)` | Returns `{ owCeiling, annualAWCeiling }` — reads from DB, falls back to $6,800 / $102,000 |
| `getCpfPeriods(brackets)` | Returns all distinct `effective_from` keys sorted newest first |
| `needsCpfChangeover(brackets, year, month)` | Returns `{ pendingPeriod, oldestPeriod }` if the payroll period has crossed a pending bracket's effective date, else null |

### Commission Items

`commission_items` is the source of truth for all commissions earned. It replaces boolean flags (`commission_paid`) on `sessions`, `packages`, and `gym_memberships`.

| Field | Purpose |
|---|---|
| `source_type` | `'pt_session'` \| `'pt_package'` \| `'membership'` |
| `source_id` | FK to the originating row |
| `period_month/year` | Payroll period the item belongs to (set at confirmation time in SGT) |
| `payslip_id` | `NULL` = unpaid. Stamped when commission payslip is marked paid. FK `ON DELETE SET NULL` enables safe payslip deletion without orphaning items. |

**Unpaid commission query:** `WHERE payslip_id IS NULL AND period_month = X AND period_year = Y`
**Reversal on delete:** FK automatically clears `payslip_id` — no manual flag reversal needed.

### `src/lib/cron.ts`

| Export | Purpose |
|---|---|
| `runCron(request, name, type, handler)` | Wraps cron handler with auth check, logging, error handling |

---

## Supabase Clients

| Import | Use when |
|---|---|
| `createClient()` from `@/lib/supabase-browser` | Client components (`'use client'`) |
| `createSupabaseServerClient()` from `@/lib/supabase-server` | Server components and route handlers |
| `createAdminClient()` from `@/lib/supabase-server` | API routes needing service role (bypasses RLS) |

---

## Security Architecture

### Users Table RLS (enabled — migration v89)

| Policy | Who | Access |
|---|---|---|
| `users_read_own` | Any authenticated | Own row only |
| `users_admin_read` | Admin | All rows |
| `users_biz_ops_read` | Business Ops | All rows |
| `users_manager_read` | Manager | Own row + gym full-time staff (manager_gym_id match) |
| `users_update_own` | Any authenticated | Own row (trigger blocks sensitive fields) |
| `users_admin_update` | Admin | Any row |
| `users_biz_ops_update` | Business Ops | Any row |
| `users_manager_update` | Manager | Gym staff (leave/capacity fields) |

### Views

| View | Purpose |
|---|---|
| `users_safe` | Non-sensitive columns for cross-user client queries. Excludes: `nric`, `address`, `commission_*`, `departure_reason`, `probation_*`, `offboarding_completed_at`, `archived_by`, `date_of_departure` |

### Trigger

`trg_protect_sensitive_user_fields` — fires on every UPDATE to `users` from an authenticated browser session (`auth.uid() IS NOT NULL`). Blocks changes to: `role`, `employment_type`, `hourly_rate`, `manager_gym_id`, `is_archived`, `is_active`, `commission_signup_pct`, `commission_session_pct`, `membership_commission_sgd`. Service role (adminClient) bypasses via `auth.uid() IS NULL`.

### Key RLS Notes

- `trainer_gyms_read`: must not contain subqueries on `users` or self-referencing subqueries — use `gym_id = get_manager_gym_id()` (SECURITY DEFINER, no recursion)
- `payslips_own_read`: staff can only read own payslips
- `get_user_role()` and `get_manager_gym_id()`: both SECURITY DEFINER — bypass RLS safely

---

## Hooks

### `useCurrentUser(options?)`

```typescript
const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops'] })
```

- Must be the **first hook** in every component
- Redirects to `/` if role not in `allowedRoles`
- Returns full users row + `trainer_gyms(gym_id, gyms(name))` join
- Queries `users` directly for own row (all columns)

### `useToast()`

```typescript
const { success, error, showMsg, showError, setError } = useToast()
```

Auto-dismissing toast notifications (3s).

### `useActivityLog()`

```typescript
const { logActivity } = useActivityLog()
logActivity('page_view', 'PT Sessions', 'Viewed PT sessions')
```

Action types: `page_view | create | update | delete | approve | reject | export | login | other`

### `useViewMode()`

For manager-who-is-also-trainer: switches between `manager` and `trainer` views.

### `usePartTimerContext()`

Provides `partTimerActiveGymId` — the gym a part-timer is currently on shift at. Gates access to Members and Gym Schedule pages.

---

## Cron Jobs

| Time SGT | Path | Purpose |
|---|---|---|
| 00:01 | `/api/cron/daily` | Orchestrator — runs all daily jobs sequentially |
| 06:00 | `/api/cron/prepare-reminders` | Populate WhatsApp reminder queue |
| 08:00 | `/api/cron/reminders` | Send WhatsApp reminders |

Daily jobs (in order):

| Job | Purpose |
|---|---|
| `expire-memberships` | Mark expired memberships |
| `expire-pt-packages` | Mark expired PT packages |
| `lock-roster-shifts` | Auto-lock past shifts (3 calendar day grace) |
| `purge-activity-logs` | Delete logs older than 14 days |
| `escalate-leave` | Escalate pending leave to Biz Ops |
| `escalate-expiring-memberships` | Notify of memberships expiring soon |
| `escalate-membership-sales` | Escalate pending membership sales |
| `escalate-pt-package-sales` | Escalate pending PT package sales |
| `escalate-pt-session-notes` | Escalate sessions with missing notes |
| `check-staff-birthdays` | Staff birthday notifications |
| `check-member-birthdays` | Member birthday notifications |

---

## Migration History

| Migration | What it does |
|---|---|
| v1–v15 | Base schema: gyms, users, sessions, packages, clients, payroll |
| v16 | Duty roster, membership sales, commission config, CPF submissions |
| v17 | Members table, gym memberships |
| v19–v45 | RLS policies, CPF, commissions, storage, part-timer support |
| v46–v79 | Incremental features and fixes |
| v80 | Dispute columns on duty_roster, shift_dispute_notif |
| v81 | deduction_amount on payslips, pending_deductions table |
| v82 | payslip_id FK on duty_roster |
| v83 | manager_dispute_notif table |
| v84 | Deduction columns on commission_payouts |
| v85 | get_gym_staff_ids() SECURITY DEFINER, trainer_gyms_read fix |
| v86 | gyms_manager_read + gyms_staff_read expanded |
| v87b | protect_sensitive_user_fields trigger |
| v88 | users_safe view |
| v89 | Users RLS enabled — recursion-free policies |
| v90 | Unified payslip redesign: renames `payslips` columns (`month/year` → `period_month/year`, `basic_salary` → `salary_amount`), adds `payment_type`, `commission_amount`, `allowance_amount`, `others_*`, `ow_ceiling_used`, `annual_aw_ceiling_used`, `ytd_ow_before`, `ytd_aw_before`. Restructures `staff_payroll` as a payroll profile (one row per staff). Creates `commission_items` table. Adds `combined_payslip_enabled` to `app_settings`. Adds `residency_status` to `users`. |
| v91 | CPF bracket period model: `cpf_age_brackets` restructured with `effective_from`, `age_from/to`, `ow_ceiling`, `annual_aw_ceiling`. `getCpfPeriods()`, `needsCpfChangeover()` added to `cpf.ts`. New `POST /api/cpf-changeover` route. |
| **Next** | **v92** |

---

## Key Design Decisions

### Why Next.js
Next.js was chosen over alternatives (Nuxt, SvelteKit, Remix, plain React SPA) for the following reasons:

- **API routes built-in** — payroll, commission, CPF changeover, and auth routes live in the same codebase as the UI. No separate backend server to deploy or maintain.
- **Vercel deployment is seamless** — Next.js is made by Vercel. Deploy is one push to GitHub. Serverless functions, cron jobs, and environment variables all work natively with zero config.
- **Server-side auth middleware** — `src/middleware.ts` guards all `/dashboard/*` routes server-side before the page loads, which is more secure than client-only auth guards. RSC requests on session expiry are handled gracefully (no "Failed to fetch RSC payload" errors).
- **TypeScript first-class** — type safety across API routes and UI components catches errors at build time, which matters for payroll logic where a wrong type can cause incorrect CPF calculations.
- **Large ecosystem** — libraries for PDF generation (jsPDF), CPF calculations, Supabase, and Twilio WhatsApp all have Next.js support and examples.

### Dashboard Refresh Pattern
All dashboard components (`ManagerDashboard`, `TrainerDashboard`, `StaffDashboard`, `BizOpsDashboard`, `AdminDashboard`) use `useDashboardRefresh` from `src/hooks/useDashboardRefresh.ts` to silently re-run their `load()` function on a fixed interval.

**How it works:**
- Initial load runs on mount with `silent = false` — shows the `<PageSpinner />` as normal
- Background refreshes run with `silent = true` — `setLoading(true)` is skipped so the screen never blanks
- The interval is paused automatically when the browser tab is hidden (`visibilitychange` API)
- On tab refocus, one immediate silent refresh fires to catch up, then the interval resumes
- The interval stops completely on component unmount — no queries fire when the user navigates away

**Interval:** `DASHBOARD_REFRESH_INTERVAL_MS = 5 * 60 * 1000` (5 minutes), hardcoded in `src/hooks/useDashboardRefresh.ts`. To change the interval, update this constant and redeploy. Do not store it in `app_settings` — that would add a meta-query on every refresh cycle.

**Usage in each dashboard:**
```typescript
const load = async (silent = false) => {
  if (!silent) setLoading(true)
  if (!silent) logActivity(...)   // page_view only on real navigation
  // ... all queries unchanged ...
  setLoading(false)
}
useEffect(() => { load() }, [])
useDashboardRefresh(load)
```

**What refreshes:** everything in `load()` — notifications, pending counts, stats tiles, action items. The refresh is not selective because the queries are fast (all indexed, tiny payloads) and running all of them ensures complete consistency.

**What does not refresh:** commission period stats (navigator offset) and drill-down data — these are user-driven views that only update when the user interacts with the period navigator.

### `Promise.all()` with Supabase — reads only
Supabase query builders return PromiseLike, not native Promise. `Promise.all()` is safe for **reads** where queries are independent. Rules:
- **Reads:** use `Promise.all()` when queries do not depend on each other's result.
- **Writes:** always sequential — insert/update/delete must never run in `Promise.all()`.
- **Dependencies:** if query B needs a result from query A, await A first, then parallelise B with other independent reads.
- **Dashboard pattern:** Phase 1 critical reads fire together; Phase 2 non-critical reads fire together after `setLoading(false)`. See `ManagerDashboard.tsx` as the reference implementation.

### users_safe vs users vs adminClient
- `from('users_safe')` — non-sensitive cross-user data (names, roles, gym assignments, hourly_rate)
- `from('users')` in browser — own row only (useCurrentUser, pt/onboard)
- `adminClient.from('users')` — all columns, server-side only (payroll, staff management for Biz Ops)

### CPF Bracket Periods
`cpf_age_brackets` holds up to 3 concurrent period sets identified by `effective_from` date (old / current / pending). Rate selection is lazy — `getCpfBracketRates()` and `getCpfCeilings()` filter by `effective_from ≤ payroll month start` at generation time. No cron or dashboard polling needed. Changeover (deleting the oldest period when a new one takes effect) is triggered during a payroll run and executed server-side via `POST /api/cpf-changeover` (business_ops only, adminClient). CPF rates are snapshotted onto payslip rows at generation — existing payslips are unaffected by bracket changes.

### SGT Timezone
All date calculations use SGT (UTC+8). `new Date()` is UTC and causes off-by-one errors near midnight. Always use `nowSGT()`. `timestamptz` field writes (approved_at, updated_at etc) correctly use UTC for database storage.

### trainer_gyms RLS Recursion
Never use subqueries on `users` or `trainer_gyms` within `trainer_gyms_read` policy. The chain `trainer_gyms → get_gym_staff_ids() → trainer_gyms` and `trainer_gyms → users.manager_gym_id → users RLS → trainer_gyms` both cause infinite recursion. Use `gym_id = get_manager_gym_id()` directly.
