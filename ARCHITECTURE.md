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
