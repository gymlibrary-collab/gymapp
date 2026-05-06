# GymApp — Multi-Gym Staff & Operations Management

A mobile-first web application for managing gym staff, PT sessions, payroll, CPF, commissions, leave, membership sales and activity logs across multiple gym outlets.

---

## Role Hierarchy

| Role | Access |
|---|---|
| **Admin** | System-wide configuration, Biz Ops account management, app branding, auto-logout settings, activity logs |
| **Business Operations** | Staff management, gym configuration, payroll generation, CPF, commission config, leave approvals, membership types, PT package templates, public holidays, reports |
| **Manager** | Own gym staff and sessions, membership sales confirmation, leave approvals, roster, commission payouts, gym profile. Can also switch to Trainer view if is_also_trainer |
| **Trainer** | Own PT sessions, clients, packages, onboarding, commission dashboard, personal particulars |
| **Staff (full-time)** | Gym schedule, member registration, membership renewals, personal particulars, payslips, leave |
| **Staff (part-time)** | Assigned gym rosters, member registration, membership renewals, personal particulars, payslips |

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database + Auth**: Supabase (PostgreSQL + Google OAuth)
- **Styling**: Tailwind CSS
- **PDF Export**: jsPDF + jsPDF-AutoTable
- **WhatsApp**: Twilio WhatsApp API
- **Hosting**: Vercel

---

## Key Features

### Member Management
- Gym member registry per outlet
- New member registration with membership sale logged in one flow
- Members page accessible to Manager, Trainer and Staff — all see all gym members
- Member profile shows: particulars, active gym membership, PT packages, attended sessions
- Membership renewal on member profile — logged as pending, confirmed by manager

### Membership Sales
- Staff/Trainer/Manager register new members or renew memberships — commission auto-logged
- Pending sales shown as amber banner on seller's dashboard
- Manager confirms/rejects staff sales via Membership Sales page
- Biz Ops confirms/rejects manager sales via Members page
- On rejection of new member: member record deleted (cascade). On rejection of renewal: soft-deleted, existing membership untouched
- Seller notified via dashboard red banner on rejection (dismissible)

### PT Package Management
- Package templates configured by Biz Ops (name, sessions, price, validity months, commission)
- PT Onboarding page — two tabs: Renew (trainer's existing members) and New Onboarding (all active gym members)
- Shared packages: primary + secondary member share session pool; 1 session deducted per attendance regardless of who attends
- Old package not expired on renewal — member can hold 2 active packages simultaneously
- Lazy expiry: packages expire when sessions exhausted or end date passed, checked on page load

### PT Sessions
- Session scheduling against active packages
- For shared packages: trainer selects attending member (primary or secondary)
- Session notes required before commission eligible for payout
- Manager confirms sessions for commission payout
- Rejection: hard deletes package (cascade deletes sessions), revokes commission, notifies trainer

### Commission Policy
- **PT signup**: eligible on package creation — not gated on manager confirmation. Revoked if rejected
- **PT session**: eligible once completed AND notes submitted
- **Membership**: eligible once manager confirms the sale
- Errors handled as manual adjustments next month — no reversals
- Paid payslips are immutable

### Payroll & CPF
- Monthly payslip generation per gym per staff member
- Full-timers: one payslip from assigned gym
- Part-timers: payslips per gym based on completed roster shifts
- CPF calculation with age bracket rates, OW/AW/annual ceilings
- Approved (unpaid) payslips deletable by Biz Ops with mandatory reason — audit trail logged
- Paid payslips immutable — correct via next-month adjustment

### Staff Management
- Probation tracking — end date + irreversible pass confirmation (Biz Ops only)
- Leave carry-forward per staff — capped by global max (Biz Ops configures in Leave Policy)
- Auto-reject pending leave when departure date is set
- Offboarding checklist: system warnings + manual tickboxes. Biz Ops must tick all before confirming

### Dashboard

**Trainer / Manager-as-Trainer:**
- 4 tiles: My Members (distinct members with active packages), Active Packages, Sessions This Month, My Commission (total = sessions + signup with breakdown)
- Today's Sessions with session count pill (amber on last session of package)
- Pending membership sale banner, membership rejection banner, PT package rejection banner
- 7-day gym schedule calendar (colour-coded by trainer, proportional blocks, forward-only navigation)

**Manager:**
- Gym-wide stats, expiring membership alerts (30 days), expiring PT packages (7 days), low session packages
- Pending membership sale banner (own sales awaiting Biz Ops confirmation)
- 7-day gym schedule calendar (clickable — modal shows trainer, client, package, session progress)

**Staff:**
- Today's Sessions, pending membership sale banner, membership rejection banner
- 7-day gym schedule calendar (non-clickable — sees schedule but not client details)

**Biz Ops:**
- Summary stats row (all gyms) + gym tabs
- Selected gym: stats, pending confirmations, alerts, today's sessions
- Year-end reminders from 1 Dec

### Activity Logs (Admin only)
- Rolling 14-day window — auto-purged on each new entry
- Captures: logins, page views, create/update/delete/confirm/reject/approve/export actions
- Logs: staff name, role, action, page, description, browser, OS, device, IP — no content
- Auto-refreshes every 30 seconds; CSV export with custom date range
- All new pages and actions must use `useActivityLog` hook — see `ARCHITECTURE.md`

---

## Navigation Summary

| Portal | Key Nav Items |
|---|---|
| **Admin** | Dashboard, Business Ops Staff, Leave Approvals, Payslip Audit, Activity Logs, App Settings |
| **Biz Ops** | Dashboard · HR & Payroll (Payroll, Commission, CPF) · Gym Operations (Members, Staff, Leave, Membership Types, PT Templates, Public Holidays) · Configuration (Gyms, Commission Rates, Leave Policy, WhatsApp) · Reports |
| **Manager** | Dashboard, Members, Membership Sales, PT Schedule, PT Package Sales, My Gym, My Staff, Duty Roster, Leave Management, Trainer Capacity, Reports |
| **Trainer** | Dashboard, Members, PT Onboarding, My Sessions, My Account |
| **Staff** | Dashboard, Members, Gym Schedule, My Account |
| **Part-timer** | Dashboard, My Roster, My Account |

---

## Database Migrations

Run in order after `schema.sql`:

| Migration | Description |
|---|---|
| v1–v16 | Base schema, roles, sessions, packages, roster |
| v17 | Packages — manager_confirmed, shared packages, commission fields |
| v44 | gym_id on payslips, single gym per trainer |
| v45 | fy_start_month on gyms |
| v47 | payslip_deletions audit table |
| v48 | payslip_notif_seen_at, commission_notif_seen_at on users |
| v49 | DROP TABLE membership_sales |
| v50 | manager_confirmed backfill on packages |
| v52 | Probation, leave carry-forward on users and app_settings |
| v53 | validity_months on package_templates, duration_months on membership_types |
| v54 | offboarding_completed_at on users |
| v55 | pkg_rejection_notif — PT package rejection notifications |
| v56 | activity_logs — 14-day rolling audit trail |
| v57 | mem_rejection_notif — membership sale rejection notifications |

---

## Key Architectural Decisions

- **No Promise.all() with Supabase** — sequential awaits only
- **RLS disabled on users table** — recursive policy issue; app-layer security instead
- **Lazy expiry** — packages and memberships expire on page load, not cron jobs (Free plan)
- **Commission errors** — manual adjustments next month, not reversals
- **Membership rejection** — new member deleted; renewal soft-deleted; existing membership untouched
- **PT package rejection** — hard delete + cascade; trainer notified via dashboard
- **Payslip immutability** — paid payslips cannot be deleted; approved can be deleted with audit
- **Activity logging** — every page and action must use `useActivityLog` — see `ARCHITECTURE.md`

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=
```

---

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

---

## Database Setup

1. Create Supabase project (Singapore region)
2. Run `supabase/schema.sql` in SQL Editor
3. Run migrations in order
4. Enable Google OAuth
5. Add Vercel URL to Supabase redirect URLs

### Create first Admin account

```sql
INSERT INTO users (id, full_name, email, role)
VALUES ('PASTE_USER_ID', 'Your Name', 'your@email.com', 'admin');
```

---

## Deployment

1. Push to GitHub → Vercel auto-deploys on push to `main`
2. Add environment variables in Vercel → Project Settings
3. Update Supabase redirect URL with production domain

---

## Maintenance

```bash
git add . && git commit -m "Description" && git push
```

### Adding a new migration
1. Create `supabase/migration_vNN.sql`
2. Run in Supabase SQL Editor
3. Commit to repo

### Adding a new page or action
1. Import and use `useActivityLog` hook
2. Call `logActivity('page_view', ...)` in load function
3. Call `logActivity(actionType, ...)` after each mutating action
4. See `ARCHITECTURE.md` for full reference
