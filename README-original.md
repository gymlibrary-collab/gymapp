# GymApp — Personal Trainer Management Platform

A mobile-first web application for managing gym trainers, clients, packages, sessions, commissions and WhatsApp reminders.

---

## User Roles

| Role | What they can do |
|---|---|
| **Admin** | Create package templates, manage trainer/manager accounts, configure gym settings |
| **Manager** | View all trainer data, mark sessions complete, approve and pay commission payouts, access all reports |
| **Trainer** | Add own clients, assign packages, schedule sessions, enter performance notes, view own reports |

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database + Auth**: Supabase (PostgreSQL + Google OAuth)
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **PDF Export**: jsPDF + jsPDF-AutoTable
- **WhatsApp**: Twilio WhatsApp API
- **Hosting**: Vercel

---

## Part 1 — Local Development Setup

### Step 1: Install Node.js
Download and install Node.js 18+ from https://nodejs.org

### Step 2: Clone or extract the project
```bash
cd ~/Desktop
# If using Git (recommended):
git clone https://github.com/YOUR_USERNAME/gymapp.git
cd gymapp

# Or if you have the zip:
unzip gymapp.zip
cd gymapp
```

### Step 3: Install dependencies
```bash
npm install
```

### Step 4: Set up environment variables
```bash
cp .env.example .env.local
```
Open `.env.local` and fill in your values (see Part 2 and Part 3 below).

### Step 5: Run the development server
```bash
npm run dev
```
Open http://localhost:3000 in your browser.

---

## Part 2 — Supabase Setup (Database + Auth)

### Step 1: Create a Supabase account
Go to https://supabase.com and sign up for free.

### Step 2: Create a new project
- Click "New Project"
- Name it `gymapp`
- Choose a strong database password (save it somewhere safe)
- Select region: **Southeast Asia (Singapore)** — closest to your users

### Step 3: Run the database schema
- In your Supabase dashboard, go to **SQL Editor**
- Click **New Query**
- Open the file `supabase/schema.sql` from this project
- Paste the entire contents into the SQL Editor
- Click **Run**

### Step 4: Configure Google OAuth
- In Supabase dashboard, go to **Authentication → Providers**
- Enable **Google**
- Go to https://console.cloud.google.com
- Create a new project → APIs & Services → Credentials → Create OAuth 2.0 Client ID
- Application type: **Web application**
- Authorised redirect URIs: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
- Copy the Client ID and Client Secret back into Supabase

### Step 5: Get your Supabase keys
- Go to **Settings → API** in your Supabase dashboard
- Copy:
  - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`

Paste these into your `.env.local` file.

### Step 6: Create your first Admin account
- Go to **Authentication → Users** in Supabase
- Click **Add User** → Enter your email (use the same Google account you'll log in with)
- Then go to **SQL Editor** and run:
```sql
INSERT INTO users (id, full_name, email, role)
VALUES (
  'PASTE_THE_USER_ID_FROM_AUTH_USERS_TABLE',
  'Your Name',
  'your@email.com',
  'admin'
);
```

---

## Part 3 — Twilio WhatsApp Setup

### Step 1: Create a Twilio account
Go to https://www.twilio.com and sign up.

### Step 2: Get WhatsApp sandbox (for testing)
- In Twilio Console, go to **Messaging → Try it out → Send a WhatsApp message**
- Follow instructions to join the sandbox (send a WhatsApp message to their number)
- This is free for testing

### Step 3: For production (real WhatsApp)
- Apply for a WhatsApp Business Account through Twilio
- This requires business verification (takes 1–5 days)
- Cost: ~USD 0.005–0.05 per message

### Step 4: Get your credentials
- **Account SID** and **Auth Token** from https://console.twilio.com
- **WhatsApp From Number**: `whatsapp:+14155238886` (sandbox) or your approved number

Paste into `.env.local`:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

---

## Part 4 — Vercel Hosting (Go Live)

### Step 1: Create a Vercel account
Go to https://vercel.com and sign up (free).

### Step 2: Push your code to GitHub (see Part 5 first)

### Step 3: Import project to Vercel
- Click **Add New → Project**
- Connect your GitHub account
- Select the `gymapp` repository
- Click **Import**

### Step 4: Add environment variables
In the Vercel project settings, go to **Environment Variables** and add ALL variables from your `.env.local` file:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `CRON_SECRET` (generate a random string, e.g. run `openssl rand -hex 32` in terminal)
- `NEXT_PUBLIC_APP_URL` (your Vercel URL, e.g. `https://gymapp.vercel.app`)

### Step 5: Deploy
- Click **Deploy**
- Vercel will build and deploy automatically
- You'll get a URL like `https://gymapp.vercel.app`

### Step 6: Update Supabase redirect URL
- Go to Supabase → **Authentication → URL Configuration**
- Add your Vercel URL to **Redirect URLs**: `https://gymapp.vercel.app/auth/callback`
- Also update Google OAuth console with the same redirect URI

### Step 7: Custom domain (optional)
- In Vercel, go to **Settings → Domains**
- Add your domain (e.g. `gym.yourdomain.com`)
- Update DNS records at your domain registrar as instructed

### WhatsApp Reminder Cron Job
The `vercel.json` file already configures a daily cron job at midnight UTC (8am SGT) to send 24h reminders. This runs automatically on Vercel Pro plan ($20/mo). On the free plan, use an external scheduler like https://cron-job.org to call:
```
GET https://gymapp.vercel.app/api/reminders
Authorization: Bearer YOUR_CRON_SECRET
```

---

## Part 5 — Git Version Control

Git lets you save versions of your code, roll back mistakes, and deploy updates safely.

### Initial Setup (do this once)

```bash
# Install Git from https://git-scm.com if not installed
git --version

# Configure your identity
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

### Create your GitHub repository
- Go to https://github.com and sign up
- Click **New Repository**
- Name it `gymapp`
- Set to **Private**
- Do NOT initialise with README (we already have one)

### Push your code to GitHub

```bash
cd ~/Desktop/gymapp

# Initialise Git
git init

# Create .gitignore to protect secrets
echo ".env.local
node_modules/
.next/
*.log" > .gitignore

# Stage all files
git add .

# First commit
git commit -m "Initial commit — GymApp MVP"

# Connect to GitHub
git remote add origin https://github.com/YOUR_USERNAME/gymapp.git

# Push to GitHub
git push -u origin main
```

### Everyday Workflow

```bash
# Check what files have changed
git status

# Stage your changes
git add .

# Save a version with a description
git commit -m "Add client health notes field"

# Push to GitHub (this auto-deploys to Vercel!)
git push
```

### Making Changes Safely (Branches)

```bash
# Create a new branch for a feature
git checkout -b feature/performance-reports

# Make your changes, then commit
git add .
git commit -m "Add 3-year performance chart"

# When ready, merge back to main
git checkout main
git merge feature/performance-reports
git push
```

### Rolling Back a Mistake

```bash
# See history of commits
git log --oneline

# Undo the last commit (keeps your changes)
git reset --soft HEAD~1

# Or revert to a specific version
git checkout abc1234 -- src/app/dashboard/reports/page.tsx
```

---

## Maintenance Guide

### Monthly tasks
- Check Supabase dashboard for database size (free tier: 500MB)
- Review WhatsApp message logs for failed deliveries
- Generate and approve monthly payout reports in the app

### When you need to update the app

1. Make code changes locally
2. Test with `npm run dev`
3. Run `git add . && git commit -m "Description of change" && git push`
4. Vercel automatically deploys in ~2 minutes
5. No downtime — Vercel does zero-downtime deployments

### Database backups
Supabase Pro ($25/mo) includes daily backups with point-in-time recovery. On the free plan, manually export weekly via:
- Supabase Dashboard → **Settings → Database → Backups**

### Upgrading packages
```bash
# Check for outdated packages
npm outdated

# Update all packages
npm update

# Test locally, then push
npm run dev
git add . && git commit -m "Update dependencies" && git push
```

---

## File Structure

```
gymapp/
├── supabase/
│   └── schema.sql              ← Run this in Supabase SQL Editor
├── src/
│   ├── app/
│   │   ├── page.tsx            ← Login page
│   │   ├── auth/callback/      ← Google OAuth callback
│   │   ├── dashboard/
│   │   │   ├── layout.tsx      ← Sidebar navigation
│   │   │   ├── page.tsx        ← Dashboard home
│   │   │   ├── clients/        ← Client management (trainer)
│   │   │   ├── sessions/       ← Session scheduling & completion
│   │   │   ├── packages/       ← Package templates (admin)
│   │   │   ├── trainers/       ← Trainer management (admin)
│   │   │   ├── payouts/        ← Commission payouts (manager)
│   │   │   └── reports/        ← Reports & analytics
│   │   └── api/
│   │       ├── trainers/       ← Create trainer accounts
│   │       └── reminders/      ← WhatsApp cron job
│   ├── lib/
│   │   ├── supabase.ts         ← Database client
│   │   └── utils.ts            ← Helper functions
│   └── types/
│       └── index.ts            ← TypeScript types
├── .env.example                ← Copy to .env.local
├── vercel.json                 ← Cron job config
└── README.md                   ← This file
```

---

## Estimated Costs (Monthly)

| Service | Free Tier | When to Upgrade |
|---|---|---|
| Vercel | Free (hobby) | $20/mo Pro — needed for cron jobs |
| Supabase | Free (500MB, 2 projects) | $25/mo Pro — for daily backups + more storage |
| Twilio WhatsApp | Pay-per-message | ~$0.005–0.05 per message |
| Domain | — | ~$15/yr via Cloudflare |

**Starting cost: $0–30/month** (free tiers cover you for initial launch)
