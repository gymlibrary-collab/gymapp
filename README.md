# GymApp — Multi-Gym Staff & Operations Management

A mobile-first web application for managing gym staff, PT sessions, payroll, CPF, commissions, leave, membership sales and WhatsApp reminders across multiple gym outlets.

---

## Role Hierarchy

| Role | Access |
|---|---|
| **Admin** | System-wide configuration, Biz Ops account management, app branding, auto-logout settings |
| **Business Operations** | Staff management, gym configuration, payroll generation, CPF, commission config, leave approvals, membership types, reports |
| **Manager** | Own gym staff and sessions, leave approvals, roster, commission payouts, gym profile |
| **Trainer** | Own PT sessions, clients, packages, commission statements, personal particulars |
| **Staff (full-time)** | Gym schedule, membership sales, personal particulars, payslips, leave |
| **Staff (part-time)** | Assigned gym rosters, personal particulars, payslips |

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

### Staff Management
- Role-based accounts: Manager, Trainer, full-time Staff, part-time Staff
- Personal particulars: NRIC/FIN/Passport, nationality, DOB, date of joining, address, phone
- Employment type: full-time (single gym) or part-time (multi-gym rostering)
- Trainers enforced to one gym assignment; part-time ops staff can be assigned to multiple gyms
- Leave entitlement and application workflow with manager/Biz Ops approval
- Part-timer duty roster with shift scheduling and hourly pay calculation

### PT Sessions
- Session scheduling with member, trainer, date/time and package assignment
- Performance notes and cancellation tracking
- My Sessions view (trainer's own sessions, all statuses)
- Full Gym Schedule on dashboard (manager, trainer, staff) — upcoming sessions across assigned gyms
- "Mine" badge highlights own sessions in gym schedule view

### Payroll & CPF
- Monthly payslip generation per gym per staff member
- Full-timers: one payslip from assigned gym
- Part-timers: separate payslips per gym based on completed roster shifts that month
- CPF calculation with age bracket rates (2026 rates), OW ceiling, AW ceiling, annual ceiling
- Year-end CPF re-calculation and adjustment amounts
- Payslip PDF includes gym logo (rectangular, auto aspect ratio), employee details, salary breakdown, YTD table (calendar year)
- CPF submission tracking

### Commission
- PT package sign-up commission (% of package price, per trainer)
- PT session commission (% per session, per trainer)
- Membership sale commission (fixed SGD per sale, global config)
- Commission payouts with manager approval and paid status

### Gym Configuration (Biz Ops)
- Multiple gym outlets with name, address, logo, size, date opened
- Financial year start month per gym (used for reporting)
- Gym logo supports rectangular images up to 2MB
- Membership types and pricing per gym
- Public holidays configuration
- WhatsApp message templates

### Security
- Google OAuth only — no password login
- Row Level Security on all 27 tables (users table protected at application layer)
- Auth callback uses service role for user verification
- Auto-logout with configurable inactivity timeout (Page Visibility API + timestamp-based)
- Role-enforced API routes — all writes validated server-side
- Biz Ops cannot see or edit Admin/Biz Ops accounts in staff management

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
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local
# Fill in your Supabase and Twilio credentials

# Run dev server
npm run dev
# Open http://localhost:3000
```

---

## Database Setup

1. Go to [Supabase](https://supabase.com) and create a new project (Singapore region recommended)
2. In SQL Editor, run `supabase/schema.sql`
3. Run migrations in order: `migration_v5.sql` through the latest migration
4. In Authentication → Providers, enable Google OAuth
5. Add your Vercel URL to Authentication → URL Configuration → Redirect URLs

### Create the first Admin account

```sql
-- After logging in with Google for the first time, run in SQL Editor:
INSERT INTO users (id, full_name, email, role)
VALUES (
  'PASTE_USER_ID_FROM_AUTH_USERS',
  'Your Name',
  'your@email.com',
  'admin'
);
```

---

## Deployment (Vercel)

1. Push code to GitHub
2. Import repository at [vercel.com](https://vercel.com)
3. Add all environment variables under Project Settings → Environment Variables (Production)
4. Deploy — Vercel builds and deploys automatically on every push to `main`
5. Update Supabase redirect URL with your production domain

### WhatsApp Reminder Cron Job

The `vercel.json` configures a daily cron at midnight UTC (8am SGT). Requires Vercel Pro ($20/mo). On the free plan, use [cron-job.org](https://cron-job.org) to call:

```
GET https://yourdomain.com/api/reminders
Authorization: Bearer YOUR_CRON_SECRET
```

---

## File Structure

```
gymapp/
├── supabase/
│   ├── schema.sql                  ← Base schema — run first
│   └── migration_v*.sql            ← Run in order after schema
├── src/
│   ├── app/
│   │   ├── page.tsx                ← Login page
│   │   ├── auth/callback/          ← Google OAuth callback
│   │   ├── api/
│   │   │   ├── trainers/           ← Staff create/update API
│   │   │   └── reminders/          ← WhatsApp cron job
│   │   └── dashboard/
│   │       ├── layout.tsx          ← Sidebar nav + auth guard + auto-logout
│   │       ├── page.tsx            ← Dashboard home (role-specific cards)
│   │       ├── admin/
│   │       │   ├── settings/       ← App branding, auto-logout (Admin)
│   │       │   └── staff/          ← Biz Ops account management (Admin)
│   │       ├── config/
│   │       │   ├── gyms/           ← Gym outlets + FY config (Biz Ops)
│   │       │   ├── commission/     ← Commission rates (Biz Ops)
│   │       │   ├── public-holidays/← Public holiday calendar (Biz Ops)
│   │       │   └── whatsapp-templates/ ← Message templates (Biz Ops)
│   │       ├── hr/
│   │       │   ├── staff/          ← Staff management (Biz Ops / Manager)
│   │       │   ├── roster/         ← Part-timer shift scheduling
│   │       │   ├── leave/          ← Leave applications + approvals
│   │       │   └── [id]/payroll/   ← Individual staff payroll detail
│   │       ├── members/            ← Gym member registry
│   │       ├── membership/
│   │       │   ├── sales/          ← Membership sale logging
│   │       │   └── types/          ← Membership product config
│   │       ├── my/
│   │       │   ├── particulars/    ← Self-service personal details
│   │       │   ├── payslips/       ← Own payslips + PDF download
│   │       │   ├── leave/          ← Own leave applications
│   │       │   ├── roster/         ← Own shift schedule (part-timers)
│   │       │   └── gym/            ← Own gym profile (managers)
│   │       ├── payroll/
│   │       │   ├── page.tsx        ← Monthly payroll generation
│   │       │   ├── commission/     ← Commission payout management
│   │       │   └── cpf/            ← CPF submission tracking
│   │       ├── pt/
│   │       │   ├── sessions/       ← PT session management
│   │       │   ├── packages/       ← PT package templates
│   │       │   └── capacity/       ← Trainer capacity planning
│   │       └── reports/            ← Analytics and reports
│   ├── lib/
│   │   ├── supabase-browser.ts     ← Browser Supabase client
│   │   ├── supabase-server.ts      ← Server Supabase client + admin client
│   │   └── utils.ts                ← formatSGD, formatDate, getRoleLabel, etc.
│   └── types/
│       └── index.ts                ← TypeScript types
├── .env.example
├── vercel.json                     ← Cron job config
└── README.md
```

---

## Estimated Monthly Costs

| Service | Free Tier | Paid |
|---|---|---|
| Vercel | Free (hobby) | $20/mo Pro — needed for cron jobs |
| Supabase | Free (500MB) | $25/mo Pro — daily backups, more storage |
| Twilio WhatsApp | Pay-per-message | ~$0.005–0.05 per message |
| Domain | — | ~$15/yr |

---

## Maintenance

### Everyday workflow
```bash
git add .
git commit -m "Description of change"
git push   # triggers automatic Vercel deployment
```

### Database backups
Supabase Pro includes daily backups. On the free plan, export manually via Supabase Dashboard → Settings → Database → Backups.

### Adding a new migration
1. Create `supabase/migration_vNN.sql` with your schema changes
2. Run it in Supabase SQL Editor
3. Commit the file to the repo for history tracking

### Checking for issues
- Vercel → Deployments → Functions tab for server-side errors
- Supabase → Database → Logs for query errors
- Browser DevTools → Network tab to inspect API calls
