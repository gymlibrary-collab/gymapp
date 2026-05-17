# GymApp — Multi-Gym SaaS Management Platform

A mobile-first web application for managing gym operations across multiple locations — covering members, PT sessions, payroll, commissions, duty roster and WhatsApp reminders.

---

## User Roles

| Role | What they do |
|---|---|
| **Admin** | System configuration, Business Ops accounts, gym setup, activity logs, cron monitoring |
| **Business Ops** | All gyms: HR, payroll, commissions, duty roster disputes, leave, year-end reset |
| **Manager** | Own gym: members, PT sessions, duty roster, staff management, reports |
| **Trainer** | PT clients, sessions, notes, commission tracking |
| **Staff (Full-time)** | Member registration, membership sales, gym schedule |
| **Staff (Part-time)** | Same as full-time + shift roster, dispute management |

---

## Tech Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database + Auth | Supabase (PostgreSQL + Google OAuth) |
| Styling | Tailwind CSS |
| PDF Export | jsPDF + jsPDF-AutoTable |
| WhatsApp | Twilio WhatsApp API |
| Hosting | Vercel |
| Timezone | SGT (UTC+8) — all dates |

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- A Supabase project
- A Vercel account (optional for local dev)
- A Twilio account with WhatsApp sandbox (optional)

### 1. Clone and install

```bash
git clone <repo-url>
cd gymapp-main
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CRON_SECRET=your-random-secret-string
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_FROM=whatsapp:+1415xxxxxxx
```

### 3. Database setup

Run the migrations in order in the Supabase SQL editor. See `supabase/schema.sql` for the current full schema.

Key post-schema steps:
1. Enable Google OAuth in Supabase → Authentication → Providers
2. Add your domain to Supabase → Authentication → URL Configuration
3. Create the first admin user by inserting directly into the `users` table via the Supabase dashboard

### 4. Run locally

```bash
npm run dev
```

---

## Deployment (Vercel)

1. Connect repo to Vercel
2. Set all environment variables in Vercel project settings
3. Add Vercel Cron jobs in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/daily", "schedule": "1 16 * * *" },
    { "path": "/api/cron/prepare-reminders", "schedule": "0 22 * * *" },
    { "path": "/api/cron/reminders", "schedule": "0 0 * * *" }
  ]
}
```

(Times are UTC — 00:01 SGT, 06:00 SGT, 08:00 SGT)

---

## Key Features

### Multi-Gym Support
- Each gym has its own manager, staff, members and branding
- Biz Ops has cross-gym visibility for all HR and payroll functions
- Part-time staff can be assigned to multiple gyms

### HR & Payroll

### CPF Rate Handling

CPF rates are determined by the `cpf_age_brackets` table, which holds multiple period sets identified by `effective_from` date. The app supports up to 3 concurrent periods: old, current, and pending (future).

**Rate selection at payroll generation time:**
- Rates are picked based on the **payroll period month** (the work month being paid), not the generation date. A January payroll run for December work uses December's brackets.
- `getCpfBracketRates()` filters brackets where `effective_from ≤ first day of payroll month`, then picks the most recent valid set.
- OW and AW ceilings follow the same logic via `getCpfCeilings()`.

**Payslip CPF snapshot — rates are locked at generation:**
- When a payslip is generated, the CPF rates (`employee_cpf_rate`, `employer_cpf_rate`) and ceiling values (`capped_ow`, `ow_ceiling`) are written directly onto the payslip row.
- Approved and paid payslips are **never recalculated**. Changing or deleting CPF bracket rows has no effect on existing payslips.
- This means bracket cleanup (removing old periods) is safe at any time — past payslips are self-contained records.

**Payroll period vs payout month:**
- The month/year selector on the payroll page is labelled "Payroll period month" — this is the work month being paid, not the payout month. A January run for December work correctly uses December's CPF brackets.

**CPF bracket changeover:**
- When a payroll run's period month reaches or passes a pending bracket's `effective_from`, the app prompts biz ops to apply the changeover.
- Changeover deletes the oldest period's bracket rows (if 3 periods exist) and the pending period automatically becomes current.
- If biz ops skips the prompt, the run proceeds with current brackets. The prompt reappears on the next payroll run.
- Changeover is executed server-side via `POST /api/cpf-changeover` (business_ops only, adminClient).

- Full-time staff: monthly payslips with CPF calculation (age-bracket aware)
- Part-time staff: hourly payslips based on duty roster attendance
- Commission payouts for trainers (session + signup commissions)
- Deductions for overpayment recovery (dispute-approved absent shifts)
- PDF payslip export with gym logo

### Duty Roster (Part-Timers)
- Managers create and manage shifts
- Part-timers can dispute incorrect shift statuses within 3 calendar days
- Biz Ops approves/rejects disputes with automatic deduction creation
- Shifts auto-lock after 3 days — payslip_id stamped on lock to prevent double-payment

### Leave Management
- Annual, medical and hospitalisation leave types
- Calendar view for managers
- Year-end reset with carry-forward calculation
- Public holidays excluded from leave working-day counts

### PT Session Management
- Package-based session tracking
- Shared packages (primary + secondary member)
- Session notes required before commission is calculated
- WhatsApp reminders day before sessions

### Security
- `src/middleware.ts` handles RSC (React Server Component) requests gracefully when sessions expire — returns a client-redirect header instead of a 302, preventing "Failed to fetch RSC payload" console errors on idle sessions.
- Google OAuth — no passwords stored
- Users table RLS — staff cannot access other staff's salary or NRIC
- SECURITY DEFINER functions for safe cross-table RLS evaluation
- Trigger blocks sensitive field updates from browser sessions
- users_safe view for non-sensitive cross-user queries
- Activity logs for audit trail (14-day rolling window)
- Auto-logout after configurable idle period

---

## Project Structure

```
src/
  app/
    auth/callback/          Google OAuth callback
    dashboard/
      _components/          Shared dashboard components (BizOpsDashboard, ManagerDashboard etc)
      admin/                Admin portal pages
      config/               Configuration pages (leave policy, WhatsApp, commission, CPF, public holidays)
      guide/                Role-specific user guides
      hr/                   HR pages (staff, leave, roster, payroll)
      members/              Member management
      membership/           Membership sales
      my/                   Staff self-service (particulars, leave, roster, payslips)
      payroll/              Payroll pages (bulk, annual, commission, CPF)
      pt/                   Personal training (sessions, packages, onboarding, capacity)
      reports/              Monthly reports
    api/
      activity-log/         Activity log write endpoint
      cron/                 Automated job handlers
      cpf-changeover/       CPF bracket period changeover (business_ops only)
      staff/                Staff CRUD (adminClient)
      staff-rates/          Hourly rate lookup (managers only) — RETIRED
  components/               Shared UI components
  hooks/                    Custom hooks (useCurrentUser, useToast, useActivityLog etc)
  lib/                      Shared utilities (utils, dashboard, pdf, cpf, cron)
  types/                    TypeScript type definitions
supabase/
  schema.sql                Canonical database schema
  migration_v*.sql          Individual migration files
```

---

## Cron Schedule

| Time SGT | Endpoint | Purpose |
|---|---|---|
| 00:01 | `/api/cron/daily` | Orchestrator — runs all daily jobs |
| 06:00 | `/api/cron/prepare-reminders` | Build WhatsApp reminder queue |
| 08:00 | `/api/cron/reminders` | Send WhatsApp reminders |

---

## Architecture Notes

See `ARCHITECTURE.md` for full developer reference including:
- Shared utility functions and their signatures
- Security architecture (RLS policies, trigger, views)
- Cron job details
- Migration history
- Key design decisions
