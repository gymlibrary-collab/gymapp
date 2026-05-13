# GymApp — Multi-Gym Staff & Operations Management

A mobile-first web application for managing gym staff, PT sessions, payroll, CPF, commissions, leave, membership sales and activity logs across multiple gym outlets.

**Last updated: 13 May 2026**

---

## Role Hierarchy

| Role | Access |
|---|---|
| **Admin** | System-wide configuration, Biz Ops account management, app branding, auto-logout settings, activity logs, cron logs |
| **Business Operations** | Staff onboarding, gym configuration, payroll generation, CPF, commission config, leave approvals, year-end leave reset, membership types, PT package templates, public holidays, WhatsApp templates, reports |
| **Manager** | Own gym staff and sessions, membership sales confirmation, leave approvals, roster, commission payouts, gym profile, trainer capacity, PT package reassignment |
| **Trainer** | Own PT sessions, clients, packages, onboarding, commission dashboard, personal particulars, leave |
| **Staff (full-time)** | Gym schedule, member registration, membership renewals, personal particulars, payslips, leave |
| **Staff (part-time)** | Assigned gym rosters, member registration, membership renewals, personal particulars, payslips |

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database + Auth**: Supabase (PostgreSQL + Google OAuth)
- **Styling**: Tailwind CSS
- **PDF Export**: jsPDF + jsPDF-AutoTable
- **WhatsApp**: Twilio WhatsApp API
- **Hosting**: Vercel (with cron jobs)

---

## Key Features

### Member Management
- Gym member registry per outlet
- New member registration with duplicate phone detection — amber warning if existing member with same phone found, staff confirms "different person" to proceed
- New member registration with membership sale logged in one flow
- Member profile shows: particulars, active gym membership, PT packages, attended sessions
- Membership renewal on member profile — logged as pending, confirmed by manager

### Membership Sales
- Staff/Trainer/Manager register new members or renew memberships — commission auto-logged
- Pending sales shown as amber banner on seller's dashboard
- Manager confirms/rejects staff sales via Membership Sales page
- Biz Ops confirms/rejects manager sales via Members page
- On rejection of new member: member record deleted (cascade). On rejection of renewal: soft-deleted, existing membership untouched
- Seller notified via dashboard red banner on rejection (dismissible, cross-device)

### Membership Cancellation
- Staff/Trainer submit cancellation request (types "confirmed!" to prevent accidental submission)
- Manager sees red banner on dashboard — approves or rejects with reason
- Manager can also cancel directly (no approval needed)
- On approval: membership ends on the set date via daily cron
- Biz Ops sees dismissible notification of approved cancellations
- Staff/Trainer sees dismissible rejection notification if rejected

### PT Package Management
- Package templates configured by Biz Ops (name, sessions, price, validity months, commission)
- PT Onboarding page — two tabs: Renew (trainer's existing members) and New Onboarding (all active gym members)
- Shared packages: primary + secondary member share session pool; 1 session deducted per attendance regardless of who attends
- Old package not expired on renewal — member can hold 2 active packages simultaneously
- Lazy expiry: packages expire when sessions exhausted or end date passed, checked on page load
- Manager and Biz Ops can reassign a package to a different trainer at any time (pending or confirmed)

### PT Sessions
- Session scheduling against active packages
- For shared packages: trainer selects attending member (primary or secondary)
- Session notes required before commission eligible for payout
- Manager confirms sessions for commission payout (no rejection flow — confirm only)
- Rejection: hard deletes package (cascade deletes sessions), revokes commission, notifies trainer

### WhatsApp Reminders
- **0600 SGT daily**: `/api/cron/prepare-reminders` — truncates and repopulates `session_reminder_members_list` with all scheduled PT sessions for tomorrow. Stores member name, phone, trainer nickname, session date/time, gym name.
- **0800 SGT daily**: `/api/cron/reminders` — reads the queue, re-verifies each session is still `scheduled`, sends WhatsApp to member using the `pt_reminder_client_24h` template from `whatsapp_templates` (configurable by Biz Ops). Updates `reminder_sent` / `reminder_failed` per row. Trainer reminders removed.
- Both cron runs logged to `cron_logs` with `source = 'reminder'`

### Commission Policy
- **PT signup**: eligible on package creation — not gated on manager confirmation. Revoked if rejected
- **PT session**: eligible once completed AND notes submitted AND manager confirmed
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
- **Onboarding form** (Biz Ops and Manager): Full Name, Nickname, NRIC, Address, Phone, Email, Nationality, DOB, Date of Joining, Date of Departure, Probation End Date, Annual Leave Entitlement (Biz Ops only)
- Nickname field: mandatory, used in dashboard greeting and staff birthday panel
- Probation tracking — end date + irreversible pass confirmation
- Leave carry-forward per staff — editable by Biz Ops only in edit form (not onboarding)
- Auto-reject pending leave when departure date is set
- **Trainer archiving**: blocked if trainer has active or pending PT packages — must reassign all packages first via PT Package Sales

### Leave Management
- **Cross-year leave block**: end date capped at Dec 31 of start year. Staff shown prompt to note intended return date in Reason field and apply for new year leave separately
- **New year leave block**: leave starting in year > `leave_reset_year` blocked until Biz Ops runs year-end reset
- **Year-end reset** (HR > Leave Management, Biz Ops only):
  - Available from 1 Jan only (button disabled outside January, disabled after run)
  - Auto-detects closing year as current year − 1
  - Checks for pending December leave first — blocks if unresolved
  - Calculates carry-forward: `min(total − taken, global_max)`
  - Updates `leave_reset_year` in `app_settings` to unblock new year leave for all staff
- **Year-end reset reminder**: shows on Biz Ops dashboard 28 Dec–1 Jan. 28–31 Dec: session-only dismiss. 1 Jan: permanent dismiss (stored in DB)
- Medical and Hospitalisation leave types: hidden from leave application form (not yet implemented)

### Notifications
All notifications are cross-device (stored in DB):

| # | Notification | Who sees it | How dismissed |
|---|---|---|---|
| 1 | New payslip | Manager, Staff, Trainer | User clicks Dismiss |
| 2 | New commission payout | Manager, Staff, Trainer | User clicks Dismiss (with #1 if both present) |
| 3 | Membership sale rejected | Manager, Staff, Trainer | User clicks Dismiss |
| 4 | Leave approved/rejected | Manager, Staff, Trainer | User clicks Dismiss |
| 5 | PT package rejected | Manager, Staff, Trainer | User clicks Dismiss |
| 6 | Membership cancellation rejected | Staff, Trainer | User clicks Dismiss |
| 7 | Membership cancellation approved | Biz Ops | User clicks Dismiss |
| 8 | Year-end reset reminder | Biz Ops | Session-only 28-31 Dec; permanent 1 Jan |
| 9 | Pending counts (sales, leave, sessions, cancellations) | Manager, Biz Ops | Auto — disappears when resolved |
| 10 | Staff birthday panel | Manager, Biz Ops only | Auto — disappears next day |
| 11 | Member birthday tile | Manager, Staff, Trainer | Auto — disappears next day |

### Dashboard
**Two-phase loading on Manager dashboard** — Phase 1 (critical: today's sessions, stats, pending counts, notifications) loads first and renders the dashboard. Phase 2 (schedule, package alerts, expiring memberships, at-risk members, leave) loads in background.

**All pages** use `dataLoading` state — no flash of empty state messages while data is fetching.

### Cron Jobs

| Cron | Schedule (SGT) | Purpose |
|---|---|---|
| `/api/cron/prepare-reminders` | 0600 daily | Populate `session_reminder_members_list` with tomorrow's PT sessions |
| `/api/cron/reminders` | 0800 daily | Send WhatsApp reminders from queue |
| `/api/cron/daily` | 0001 daily | Orchestrator — runs 9 nightly jobs sequentially |

**Daily orchestrator jobs (in order):**
1. `expire-memberships` — marks expired/cancelled memberships
2. `expire-pt-packages` — marks expired/completed packages
3. `escalate-leave` — flags overdue pending leave
4. `escalate-expiring-memberships` — surfaces expiring memberships on dashboard
5. `escalate-membership-sales` — flags overdue pending membership sales
6. `escalate-pt-packages-sales` — flags overdue pending PT package sales
7. `escalate-pt-session-notes` — flags overdue unsubmitted session notes
8. `check-staff-birthdays` — refreshes `staff_birthday_reminders` (next 7 days)
9. `check-member-birthdays` — refreshes `member_birthday_reminders` (today only)

All cron runs logged to `cron_logs` with `source` column (`daily` or `reminder`). Viewable by Admin at Admin > Cron Logs with All / Daily / Reminders filter tabs.

### Activity Logs (Admin only)
- Rolling 14-day window — auto-purged on each new entry
- Captures: logins, page views, create/update/delete/confirm/reject/approve/export actions
- Logs: staff name, role, action, page, description, browser, OS, device, IP — no content
- Auto-refreshes every 30 seconds; CSV export with custom date range

---

## Navigation Summary

| Portal | Key Nav Items |
|---|---|
| **Admin** | Dashboard, Business Ops Staff, Leave Approvals, Payslip Audit, Activity Logs, Cron Logs, App Settings |
| **Biz Ops** | Dashboard · HR & Payroll (Payroll, Commission Payouts, Annual Statements, CPF) · Gym Operations (Members, Staff, Leave Management, Membership Types, PT Templates, Public Holidays) · Configuration (Gyms, Commission Rates, Leave Policy, WhatsApp Notifications, WhatsApp Templates) · Reports |
| **Manager** | Dashboard, Members, Membership Sales, PT Schedule, PT Package Sales, My Gym, My Staff, Duty Roster, Leave Management, Trainer Capacity, Reports |
| **Trainer** | Dashboard, Members, PT Onboarding, My Sessions, My Account (Particulars, Leave, Payslips) |
| **Staff** | Dashboard, Members, Gym Schedule, My Account (Particulars, Leave, Payslips) |
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
| v58 | escalated_to_biz_ops + escalated_at on packages and sessions |
| v59–v68 | Leave enhancements, escalation config, Biz Ops dashboard, commission drill-down, WhatsApp system |
| v69 | staff_birthday_reminders table |
| v70 | member_birthday_reminders table |
| v71 | cron_logs table |
| v72 | membership_cancellation_requests, cancellation_rejection_notif, cancellation_approved_notif |
| v73 | nickname column on users and staff_birthday_reminders |
| v74 | leave_reset_year and leave_reset_reminder_seen_at on app_settings |
| v75 | session_reminder_members_list, cron_logs.source, pt_reminder_client_24h template |

---

## Key Architectural Decisions

- **No Promise.all() with Supabase** — sequential awaits only (except Biz Ops bulk gym reads)
- **RLS disabled on users table** — recursive policy issue; app-layer security instead
- **Lazy expiry** — packages and memberships expire on page load and via daily cron
- **Commission errors** — manual adjustments next month, not reversals
- **Membership rejection** — new member deleted; renewal soft-deleted; existing membership untouched
- **PT package rejection** — hard delete + cascade; trainer notified via dashboard
- **Payslip immutability** — paid payslips cannot be deleted; approved can be deleted with audit
- **Activity logging** — every page and action must use `useActivityLog` — see `ARCHITECTURE.md`
- **dataLoading pattern** — all pages use separate `dataLoading` state (starts `true`, set `false` via `.finally()`) to prevent flash of empty state messages
- **Two-phase dashboard loading** — Manager dashboard shows critical data first, non-critical data loads in background
- **Leave year boundary** — cross-year leave applications blocked; new year leave blocked until year-end reset runs in January

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
3. Run migrations v1 through v75 in order
4. Enable Google OAuth
5. Add Vercel URL to Supabase redirect URLs

### Create first Admin account

```sql
INSERT INTO users (id, full_name, nickname, email, role)
VALUES ('PASTE_USER_ID', 'Your Name', 'YourNickname', 'your@email.com', 'admin');
```

---

## Deployment

1. Push to GitHub → Vercel auto-deploys on push to `main`
2. Add environment variables in Vercel → Project Settings
3. Update Supabase redirect URL with production domain
4. Set `CRON_SECRET` in Vercel environment variables

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
4. Add `dataLoading` state — initialise `true`, set `false` via `.finally()` on load call
5. See `ARCHITECTURE.md` for full reference
