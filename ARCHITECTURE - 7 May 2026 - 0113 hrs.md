# GymApp — Shared Utilities & Architecture Reference

This file documents all centralised functions, hooks, and helpers.
**Always check here before writing new utility logic in a page file.**

---

## `src/lib/utils.ts`

General-purpose utilities imported across all pages.

| Export | Purpose | Usage |
|---|---|---|
| `cn(...classes)` | Merges Tailwind class names safely | `className={cn('base', condition && 'extra')}` |
| `formatSGD(amount)` | Formats a number as SGD currency | `formatSGD(1234.5)` → `$1,234.50` |
| `formatDate(date)` | Formats date as `dd MMM yyyy` | `formatDate('2026-05-01')` → `01 May 2026` |
| `formatDateTime(date)` | Formats date + time as `dd MMM yyyy, h:mm a` | `formatDateTime(iso)` |
| `formatTimeAgo(date)` | Relative time string | `formatTimeAgo(date)` → `2 hours ago` |
| `getMonthName(month)` | Month number → full name | `getMonthName(5)` → `May` |
| `calculateAge(dob)` | Age in whole years from DOB to today | `calculateAge('1990-01-01')` |
| `getRoleLabel(role)` | DB role value → display label | `getRoleLabel('business_ops')` → `Business Ops` |
| `roleBadgeClass(role)` | DB role value → Tailwind badge colour string | `className={roleBadgeClass(member.role)}` |
| `uploadToStorage(supabase, file, bucket, path, maxMb?)` | Uploads a file to Supabase Storage, returns public URL or null | Use for all logo/image uploads |

### `roleBadgeClass` colour map
| Role | Colour |
|---|---|
| `admin` | Red |
| `business_ops` | Purple |
| `manager` | Yellow |
| `trainer` | Teal (avoids clash with green Active badge) |
| `staff` | Blue |

### `uploadToStorage` usage
```typescript
import { uploadToStorage } from '@/lib/utils'

const url = await uploadToStorage(supabase, file, 'gym-logos', `gym-${gymId}`)
if (url) await supabase.from('gyms').update({ logo_url: url.split('?')[0] }).eq('id', gymId)
```

---

## `src/lib/pdf.ts`

PDF generation helpers used by payslip and commission statement exports.

| Export | Purpose |
|---|---|
| `PDF_TABLE_STYLE` | Standard autoTable style object (red header, right-aligned amounts) |
| `loadLogoAsBase64(url)` | Fetches a logo URL and returns a base64 data URL, or null on failure |
| `getImageDimensions(src)` | Returns natural `{ w, h }` of a base64/URL image |
| `addLogoHeader(doc, logoUrl, title, fontSize?)` | Renders gym logo + title in the PDF header, returns final Y position |

### Usage
```typescript
import { addLogoHeader, PDF_TABLE_STYLE } from '@/lib/pdf'

const yPos = await addLogoHeader(doc, gym.logo_url, 'PAYSLIP')
autoTable(doc, { startY: yPos, head: [['Description', 'Amount']], body: rows, ...PDF_TABLE_STYLE })
```

---

## `src/lib/cpf.ts`

CPF calculation helpers used by payroll generation pages.

| Export | Purpose |
|---|---|
| `getAgeAsOf(dob, refDate)` | Returns whole-number age as of a reference date, or null if no DOB |
| `getCpfBracketRates(brackets, dob, year, month)` | Returns `{ employee_rate, employer_rate }` for the correct CPF age bracket |

### CPF bracket boundary rule
Staff move to the next bracket the **day after** their birthday at the upper age of the current bracket. Age is calculated as of the **last day of the payroll month**.

### Usage
```typescript
import { getCpfBracketRates } from '@/lib/cpf'

const rates = getCpfBracketRates(cpfBrackets, staff.date_of_birth, year, month)
// rates.employee_rate, rates.employer_rate
```

---

## `src/hooks/useToast.ts`

Shared toast notification state. Replaces the repeated 3-line pattern in every page.

| Return value | Type | Purpose |
|---|---|---|
| `success` | `string` | Current success message (empty = hidden) |
| `error` | `string` | Current error message (empty = hidden) |
| `showMsg(msg)` | `function` | Shows a success toast, auto-dismisses after 3s |
| `showError(msg)` | `function` | Shows an error toast, auto-dismisses after 3s |
| `clearMessages()` | `function` | Clears both success and error immediately |
| `setError` | `setState` | Direct setter for error (for inline validation) |
| `setSuccess` | `setState` | Direct setter for success (rarely needed) |

### Usage
```typescript
import { useToast } from '@/hooks/useToast'

const { success, error, showMsg, showError, setError } = useToast()

// Show success after save
showMsg('Settings saved')

// Show error
showError('Failed to save')

// Inline validation error (no auto-dismiss)
setError('Phone number is required')
```

### Rendering the banners
The `success` and `error` strings are consumed by the existing banner JSX in each page.
When adding a new page, use this pattern:
```tsx
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
```

---

## `src/components/StatusBanner.tsx`

Shared success/error notification banner. Replaces the repeated green/red `div` block in every page.

| Prop | Type | Purpose |
|---|---|---|
| `success?` | `string` | Success message to display (hidden when empty) |
| `error?` | `string` | Error message to display (hidden when empty) |
| `onDismissError?` | `() => void` | If provided, shows an X button to manually dismiss the error |

### Usage
```tsx
import { StatusBanner } from '@/components/StatusBanner'

// With dismiss button on error
<StatusBanner success={success} error={error} onDismissError={() => setError('')} />

// Success only
<StatusBanner success={success} />

// Error only
<StatusBanner error={error} />
```

Always use together with `useToast` — the `success` and `error` strings come from the hook:
```tsx
const { success, error, showMsg, setError } = useToast()
// ...
<StatusBanner success={success} error={error} onDismissError={() => setError('')} />
```

---

## Supabase clients

| Import | Use when |
|---|---|
| `createClient()` from `@/lib/supabase-browser` | In any client component (`'use client'`) — uses anon key + user JWT |
| `createServerClient()` from `@/lib/supabase-server` | In server components and route handlers |
| `createAdminClient()` from `@/lib/supabase-server` | In API route handlers that need service role (bypasses RLS) |

---

## Migration history

| Migration | What it does |
|---|---|
| v1–v15 | Base schema, gyms, users, sessions, packages, clients, payroll |
| v16 | Duty roster, membership sales, commission config, CPF submissions |
| v17 | Members table, gym memberships |
| v19 | Staff role, RLS policies for staff |
| v21 | app_settings payslip logo + company name columns |
| v24 | Leave applications RLS |
| v27 | Biz Ops RLS policies |
| v28 | Part-timer role: trainer → staff |
| v29 | Biz Ops RLS on users + trainer_gyms |
| v30 | users_manager_read RLS scoped policy |
| v32 | Gyms write RLS for Biz Ops + manager |
| v33 | gym-logos Storage policies |
| v35 | Payslips schema overhaul, CPF stored columns |
| v36 | CPF bracket labels + 2026 rates |
| v38 | address column on users |
| v39 | membership_commission_pct → membership_commission_sgd |
| v40 | Tighten users_biz_ops_read_all RLS |
| v41 | RLS cleanup + performance (STABLE functions, scoped policies) |
| v42 | Security tightening (anon execute revoke, commission config, storage) |
| v43 | users RLS disabled (recursive policy issue), app-layer security instead |
| v44 | gym_id on payslips, enforce single gym per trainer, part-timer multi-gym |
| v45 | fy_start_month on gyms table |
| **Next** | **v46** |

---

## Refactoring completed (Batches 1–6)

All shared utilities are documented above. When building new pages or features, follow this checklist:

| Need | Use |
|---|---|
| Format currency | `formatSGD()` from `@/lib/utils` |
| Format dates | `formatDate()` / `formatDateTime()` from `@/lib/utils` |
| Role badge colour | `roleBadgeClass(role)` from `@/lib/utils` |
| Role display label | `getRoleLabel(role)` from `@/lib/utils` |
| Upload a logo/image | `uploadToStorage(supabase, file, bucket, path)` from `@/lib/utils` |
| PDF logo header | `addLogoHeader(doc, logoUrl, title)` from `@/lib/pdf` |
| PDF table styling | `PDF_TABLE_STYLE` from `@/lib/pdf` |
| CPF bracket rates | `getCpfBracketRates(brackets, dob, year, month)` from `@/lib/cpf` |
| Age calculation | `getAgeAsOf(dob, refDate)` from `@/lib/cpf` |
| Toast notifications | `useToast()` from `@/hooks/useToast` |
| Success/error banner | `<StatusBanner />` from `@/components/StatusBanner` |

---

## Conventions

- **Never use `Promise.all()` with Supabase query builders** — they return PromiseLike not Promise. Use sequential awaits.
- **Service role client** (`createAdminClient`) is used in API routes and auth callbacks only — never in browser components.
- **RLS on users table is disabled** — protected at application layer instead (recursive policy issue with Supabase Free plan).
- **Tailwind content scanning** includes `src/lib/**` and `src/hooks/**` — add class names there freely.
- **Role hierarchy**: admin → business_ops → manager → trainer / staff

---

## Activity Logging — `src/hooks/useActivityLog.ts`

**Every new page and every new action handler MUST include activity logging.**
This is a non-negotiable requirement for all future enhancements.

### Hook usage

```typescript
import { useActivityLog } from '@/hooks/useActivityLog'

export default function MyPage() {
  const { logActivity } = useActivityLog()
  // ...
}
```

### Action types

| Type | When to use |
|---|---|
| `login` | User logs in — handled by layout.tsx, do not duplicate |
| `page_view` | User lands on a meaningful page — fire in useEffect load function |
| `create` | New record created (member, package, payslip, leave application) |
| `update` | Existing record updated (staff details, session notes, payslip status) |
| `delete` | Record deleted (payslip, package rejection) |
| `confirm` | Sale or session confirmed by manager |
| `reject` | Sale, package or leave rejected |
| `approve` | Payslip or commission marked as approved/paid |
| `export` | CSV or PDF exported |
| `other` | Anything that doesn't fit above |

### Page view — fire-and-forget in load function

```typescript
useEffect(() => {
  const load = async () => {
    logActivity('page_view', 'Page Name', 'Viewed page description')
    // ... rest of load logic
  }
  load()
}, [])
```

### Action logging — call after successful operation

```typescript
const handleConfirm = async (id: string) => {
  await supabase.from('...').update({ ... }).eq('id', id)
  logActivity('confirm', 'Page Name', 'Brief description of what was confirmed')
  showMsg('Confirmed')
}
```

### Rules

1. **Log page views** for all meaningful pages — skip dashboard, redirect pages, and loading states
2. **Log all mutating actions** — create, update, delete, confirm, reject, approve
3. **Never log content** — describe WHAT happened, not the data itself
   - ✅ `'Confirmed membership sale'`
   - ❌ `'Confirmed membership sale for John Tan — $80 Monthly'`
4. **Never log sensitive fields** — salary amounts, CPF figures, NRIC, health notes
5. **Never await page_view logs** — use fire-and-forget to avoid blocking navigation
6. **Do await action logs** — actions are already async so awaiting is fine
7. **Page name** should match the sidebar nav label exactly for consistency
8. **Description** should be past tense, concise, max ~60 characters

### Logs are stored in `activity_logs` table

- Rolling 14-day window per user — older entries auto-deleted on each insert
- Admin-only read access via `admin/activity-logs` page
- Exportable as CSV with custom date range
- Auto-refreshes every 30 seconds in admin view


---

## Commission Eligibility Rules

All three commission types have explicit gates. These are non-negotiable and must not be bypassed.

### PT Signup Commission (packages table)
```
manager_confirmed = true
AND signup_commission_paid = false
AND status != 'cancelled'
```
- `manager_confirmed` is set by manager OR Biz Ops (after 48-hour escalation)
- Rejected packages are hard-deleted — no need to filter by status in most queries
- Commission eligible regardless of who confirmed (manager or Biz Ops)

### PT Session Commission (sessions table)
```
status = 'completed'
AND is_notes_complete = true
AND manager_confirmed = true
AND commission_paid = false
```
- `is_notes_complete` must be true — trainer must submit notes first
- `manager_confirmed` set by manager OR Biz Ops (after 48-hour escalation)
- Commission eligible regardless of who confirmed

### Membership Sale Commission (gym_memberships table)
```
sale_status = 'confirmed'
AND commission_paid = false
```
- Confirmed by manager (for trainer/staff sales) or Biz Ops (for manager sales)

---

## 48-Hour Escalation Flow

For PT packages and session notes, unacknowledged items escalate to Biz Ops after 48 hours.

### How it works
- Clock starts: `packages.created_at` (packages) / `sessions.notes_submitted_at` (sessions)
- **Trigger**: runs on every trainer dashboard load — no cron job needed (Free plan compatible)
- Check: any unconfirmed items older than 48 hours → `escalated_to_biz_ops = true` + `escalated_at`

### Routing
| State | Manager sees | Biz Ops sees |
|---|---|---|
| `escalated_to_biz_ops = false` | ✅ In pending queue | ❌ Not shown |
| `escalated_to_biz_ops = true` | ❌ Removed from queue | ✅ In pending queue |

### Confirmation
- Either manager or Biz Ops can confirm/reject at any time — routing is purely about which queue it appears in
- Once confirmed by either, `manager_confirmed = true` — commission becomes eligible
- No notification to manager on escalation — silent routing

### Schema columns added (migration v58)
```sql
-- packages
escalated_to_biz_ops boolean default false
escalated_at timestamptz

-- sessions
escalated_to_biz_ops boolean default false
escalated_at timestamptz
```

### Pages affected
- `pt/package-sales/page.tsx` — open to both manager and Biz Ops; filters by `escalated_to_biz_ops`
- `pt/sessions/page.tsx` — open to both manager and Biz Ops; pending_confirm tab filters by `escalated_to_biz_ops`
- `dashboard/page.tsx` — escalation check runs in trainer load function

---

## Notification Tables

Three separate notification tables for in-app alerts. All follow the same pattern:
- Written by service role (API route or direct from client with RLS insert policy)
- Read by the recipient via RLS select policy
- Dismissed by updating `seen_at` timestamp
- Dashboard banners check for `seen_at IS NULL`

| Table | Written when | Read by | Dismissed when |
|---|---|---|---|
| `pkg_rejection_notif` | Manager/Biz Ops rejects a PT package | Trainer | Trainer clicks Dismiss on dashboard |
| `mem_rejection_notif` | Manager/Biz Ops rejects a membership sale | Seller (trainer/staff/manager) | Seller clicks Dismiss on dashboard |
| `activity_logs` | Any page view or action (not a notification — audit only) | Admin | Auto-purged after 14 days |

### Dashboard banner priority (trainer portal, top to bottom)
1. PT package rejection (red) — `pkg_rejection_notif` unseen
2. Membership rejection (red) — `mem_rejection_notif` unseen
3. Pending membership sales (amber) — own `gym_memberships` with `sale_status = 'pending'`

---

## Membership Sale Rejection Flow

When manager/Biz Ops rejects a membership sale:

1. Check if member has any other `confirmed` memberships:
   - **None found** → member is brand new → delete member record (cascade deletes the rejected membership)
   - **Found** → existing member renewing → soft-delete only (`sale_status = 'rejected', status = 'cancelled'`)

2. Write `mem_rejection_notif` record for the seller

3. Seller sees red banner on next dashboard load:
   - New member: *"[Type] for [Name] rejected — member record removed, please re-register"*
   - Renewal: *"[Type] for [Name] rejected — existing membership remains active"*

---

## PT Package Rejection Flow

When manager/Biz Ops rejects a PT package sale:

1. Pre-checks (block or warn):
   - `signup_commission_paid = true` → **block** — commission already paid, cannot reject
   - Draft/approved commission payout exists covering this package → **warn** — manager can proceed but discrepancy noted

2. Hard delete the package (`packages` table) — cascade deletes any linked sessions

3. Write `pkg_rejection_notif` record for the trainer

4. Trainer sees red banner on next dashboard load: *"[Package] for [Member] rejected by [Manager]"*

---

## Migration Index (complete)

| Migration | Description |
|---|---|
| v1–v15 | Base schema, gyms, users, sessions, packages, clients, payroll |
| v16 | Duty roster, membership sales, commission config, CPF submissions |
| v17 | Members table, gym memberships, shared packages, manager_confirmed |
| v19 | Staff role, RLS policies |
| v21 | app_settings logo + company name |
| v24 | Leave applications RLS |
| v27 | Biz Ops RLS policies |
| v28 | Part-timer role |
| v29–v30 | Biz Ops and manager RLS scoping |
| v32–v33 | Gyms write RLS, storage policies |
| v35–v36 | Payslips overhaul, CPF 2026 rates |
| v38–v42 | Schema additions, security tightening |
| v43 | users RLS disabled — app-layer security |
| v44 | gym_id on payslips, single gym per trainer |
| v45 | fy_start_month on gyms |
| v47 | payslip_deletions audit table |
| v48 | payslip_notif_seen_at, commission_notif_seen_at on users |
| v49 | DROP TABLE membership_sales |
| v50 | manager_confirmed backfill on packages |
| v52 | Probation, leave carry-forward on users + app_settings |
| v53 | validity_months on package_templates, duration_months on membership_types |
| v54 | offboarding_completed_at on users |
| v55 | pkg_rejection_notif table |
| v56 | activity_logs table — 14-day rolling audit trail |
| v57 | mem_rejection_notif table |
| v58 | escalated_to_biz_ops + escalated_at on packages and sessions |
| **Next** | **v59** |

