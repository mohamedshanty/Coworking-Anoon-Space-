# ANoon — Coworking Space Management Dashboard

A full-stack management dashboard for coworking spaces, built for daily operations: visitor check-in/check-out, subscription management, café sales, room bookings, course enrollment, expense and debt tracking, and real-time live session monitoring.

Built with an Arabic-first UI (RTL layout) and designed for small-to-medium coworking space operators.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Database Backups](#database-backups)
- [Project Structure](#project-structure)

---

## Features

### Visitor & Session Management

- **Check-in / Check-out** — visitors (walk-in, subscriber, or trainee) are checked in and out with automatic time-based pricing
- **Live session tracking** — real-time dashboard of currently-checked-in visitors via Socket.io, with auto-refreshing pricing
- **Custom per-session hourly rate** — staff can override the default hourly rate at check-in time
- **Full-day pricing cap** — automatic cap at the configured full-day price once a visitor exceeds the threshold hours
- **Subscription-aware pricing** — active subscribers and trainees pay zero for time; only snack/drink orders are charged
- **Unpaid checkout** — allows debt-generating checkouts when a visitor cannot pay immediately
- **Session history** — paginated, filterable history with summary statistics (revenue, expenses, net profit, subscriber ratio)

### Subscription Management

- **Package types** — monthly, half-month, and weekly subscription packages
- **Daily quota tracking** — per-subscription daily hour quota with days-used counter
- **Subscription lifecycle** — active, expired, paused, and renewing states
- **Renewal and pause** — renew existing subscriptions or pause them with date tracking

### Café & Inventory

- **Inventory management** — stock tracking with sell price, cost price, alert thresholds, and restock date
- **Snack orders** — order snacks and hot drinks directly onto an active session
- **Standalone sales** — snack and hot-drink sales not linked to a session
- **Low-stock alerts** — real-time notifications when inventory falls below the configured threshold

### Rooms & Bookings

- **Room management** — create and manage bookable rooms
- **Booking system** — time-slot bookings with status tracking (confirmed, pending, cancelled)
- **Conflict checking** — API endpoint validates no overlapping bookings for the same room

### Courses & Trainees

- **Course management** — create training courses with trainer, schedule, room, price per trainee, and max seats
- **Trainee enrollment** — register trainees per course with payment status (full or installment) and attendance tracking
- **Trainee check-in** — trainees checked in as "trainee" type pay zero for time (course fee covers space)

### Financial Tracking

- **Expense tracking** — categorized expenses (electricity, rent, salaries, maintenance, marketing, other)
- **Debt management** — track unpaid debts from sessions or manual entries, with collection status
- **Cash-basis accounting reports** — date-range financial reports with hours revenue, snack revenue, expenses, and net profit

### Contact Management

- **Contact directory** — store contact information (name, phone, notes)
- **Excel import** — bulk import contacts from `.xlsx` files

### Follow-Up

- **Disengaged visitor follow-up** — flag visitors who need follow-up, track contact status (needs, contacted, opt-out)

### Staff & Permissions

- **Role-based access** — admin, manager, and staff roles
- **Granular page-level permissions** — per-page view/edit/delete permissions assigned per staff member
- **Admin bypass** — admin role has unrestricted access to all pages
- **Login audit trail** — all login attempts (success/fail) are logged with IP, user agent, and timestamp
- **Account lockout** — failed login attempt tracking with temporary lockout

### Real-Time Updates

- **Socket.io events** — `session:checked_in`, `session:checked_out`, `session:order_added` broadcast to all connected clients for instant UI updates

### Dashboard

- **Configurable settings** — hourly rate, full-day price, full-day threshold, hot drinks monthly cost, company info
- **Role-based dashboard widgets** — live sessions, alerts, notifications

---

## Tech Stack

### Backend

| Technology        | Version | Purpose               |
| ----------------- | ------- | --------------------- |
| Node.js           | —       | Runtime               |
| Express           | ^5.2.1  | HTTP framework        |
| TypeScript        | ^6.0.3  | Type safety           |
| Prisma            | ^7.8.0  | ORM & migrations      |
| PostgreSQL (Neon) | —       | Database (serverless) |
| Socket.io         | ^4.8.3  | Real-time events      |
| bcrypt            | ^6.0.0  | Password hashing      |
| jsonwebtoken      | ^9.0.3  | JWT authentication    |
| Zod               | ^4.4.3  | Request validation    |
| ExcelJS           | ^4.4.0  | Excel import/export   |

### Frontend

| Technology       | Version   | Purpose                              |
| ---------------- | --------- | ------------------------------------ |
| React            | ^19.2.0   | UI framework                         |
| Vite             | ^8.0.16   | Build tool & dev server              |
| TanStack Router  | ^1.168.25 | File-based routing                   |
| TanStack Query   | ^5.83.0   | Server state management              |
| Tailwind CSS     | ^4.2.1    | Utility-first styling                |
| shadcn/ui        | —         | UI component library (46 components) |
| Recharts         | ^2.15.4   | Charts & data visualization          |
| Socket.io Client | ^4.8.3    | Real-time event listener             |
| Zod              | ^3.24.2   | Schema validation                    |
| date-fns         | ^4.1.0    | Date utilities                       |

### Infrastructure

| Service        | Purpose                          |
| -------------- | -------------------------------- |
| Render         | Backend hosting                  |
| Vercel         | Frontend hosting                 |
| Neon           | Serverless PostgreSQL database   |
| GitHub Actions | Automated daily database backups |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                    │
│  TanStack Router (file-based) + TanStack Query              │
│  shadcn/ui components · Tailwind CSS · RTL layout           │
│  Socket.io client (real-time live sessions)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │  REST API (JSON) + Socket.io
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Express + TypeScript)                             │
│  JWT auth (access + refresh tokens)                         │
│  authenticate middleware → authorize middleware              │
│  16 route modules under /api/v1                             │
│  Socket.io server (broadcasts session events)               │
└──────────────────────┬──────────────────────────────────────┘
                       │  Prisma Client (connection pool: 5)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL (Neon serverless)                               │
│  16 models · Prisma migrations                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

- **Cash-basis accounting** — revenue is recorded at checkout time, not at check-in. The pricing engine calculates time-based cost using elapsed hours and the configured hourly rate, capped at the full-day price.
- **Permission-gated actions** — every API route is protected by `authenticate` (JWT verification) and `authorize` (page-level permission check). Admin role bypasses all permission checks. Non-admin users require an explicit `Permission` record with `canView: true` for the target page.
- **Prisma connection pooling** — uses `@prisma/adapter-pg` with a `pg.Pool` (max 5 connections) instead of Prisma's default connection management, optimized for Neon's serverless PostgreSQL.
- **Socket.io for real-time** — the `io` instance is attached to the Express `app` object via `app.set("io", io)`, allowing any route handler to broadcast events (e.g., `io.emit("session:checked_in", session)`).
- **JWT access + refresh flow** — access tokens are short-lived; refresh tokens are stored in `localStorage` on the client. On 401, the frontend automatically attempts a silent refresh before failing.

---

## Database Schema

### Core Entities

| Model             | Description                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Visitor**       | A person who uses the space — can be a walk-in visitor, subscriber, or trainee. Stores name, phone, type, source, follow-up status.     |
| **Session**       | A check-in/check-out visit. Linked to a visitor. Tracks check-in/out times, amount, payment status/method, optional custom hourly rate. |
| **Subscription**  | A time-bound subscription for a visitor. Package type (monthly/weekly/half-month), daily quota, start/end dates, status.                |
| **SnackOrder**    | An order placed during a session — links to an inventory item (snack) or stores a hot-drink name.                                       |
| **InventoryItem** | A café product with quantity, sell price, cost price, alert threshold, and last restock date.                                           |
| **Sale**          | A recorded sale — can be linked to a session or standalone. Tracks item name, quantity, total, payment method.                          |

### Rooms & Courses

| Model       | Description                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| **Room**    | A bookable room in the coworking space.                                                                           |
| **Booking** | A time-slot reservation for a room with booker info, purpose, price, and status (confirmed/pending/cancelled).    |
| **Course**  | A training course — has a trainer, date range, session count, price per trainee, max seats, and assigned room.    |
| **Trainee** | A person enrolled in a course — tracks name, phone, payment status (full/installment), and attendance percentage. |

### Financial

| Model       | Description                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| **Expense** | A business expense with category (electricity, rent, salaries, maintenance, marketing, other), amount, and date. |
| **Debt**    | An unpaid amount — can be session-generated or manual. Tracks collection status.                                 |

### System

| Model          | Description                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Staff**      | A user account with name, username, role (admin/manager/staff), password hash, and failed login tracking.                            |
| **Permission** | Per-page access control for non-admin staff — view/edit/delete booleans per `pageKey`. Unique on `(staffId, pageKey)`.               |
| **LoginLog**   | Audit record for login attempts — username, timestamp, success/fail status, IP, user agent.                                          |
| **Settings**   | Singleton row storing global config — hourly rate, full-day price, full-day threshold, hot drinks monthly cost, company info (JSON). |
| **Contact**    | A contact directory entry — full name, phone (unique), notes, timestamps.                                                            |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **npm** or **pnpm**
- A **PostgreSQL** database (Neon recommended for production, or local for development)

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd coworking-backend
```

### 2. Install backend dependencies

```bash
npm install
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 4. Set up environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
JWT_ACCESS_SECRET="your_access_secret_here"
JWT_REFRESH_SECRET="your_refresh_secret_here"
PORT=5000
```

See [Environment Variables](#environment-variables) for the full list.

### 5. Run database migrations

```bash
npx prisma migrate dev
```

### 6. Seed the database (optional)

```bash
npm run seed
```

### 7. Start the backend dev server

```bash
npm run dev
```

Backend runs on `http://localhost:5000` by default.

### 8. Start the frontend dev server

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:3000` by default.

---

## Environment Variables

### Backend

| Variable             | Required | Description                                                              |
| -------------------- | -------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`       | Yes      | PostgreSQL connection string (Neon format with `sslmode=require`)        |
| `JWT_ACCESS_SECRET`  | Yes      | Secret key for signing JWT access tokens                                 |
| `JWT_REFRESH_SECRET` | Yes      | Secret key for signing JWT refresh tokens                                |
| `PORT`               | No       | Server port (default: `5000`)                                            |
| `NODE_ENV`           | No       | `production` or `development` — affects Prisma client singleton behavior |

### Frontend

| Variable            | Required | Description                                                    |
| ------------------- | -------- | -------------------------------------------------------------- |
| `VITE_API_BASE_URL` | No       | Backend API base URL (default: `http://localhost:5000/api/v1`) |

---

## Deployment

### Backend (Render)

- Connected to the `main` branch for automatic deployments
- Build command: `npm install && npx prisma migrate deploy && npm run build`
- Start command: `npm start`
- Environment: Node.js, with `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` configured as Render environment variables

### Frontend (Vercel)

- Connected to the frontend directory or repository
- Build command: `npm run build`
- Output: Static files served by Vercel's CDN
- Environment variable: `VITE_API_BASE_URL` pointing to the deployed backend URL

### Database Migrations

Migrations are applied as part of the backend deploy process via `npx prisma migrate deploy`. This runs all pending migrations in production without interactive prompts.

---

## Database Backups

Automated daily backups are managed via GitHub Actions.

### Schedule

- **Daily at 02:00 UTC** via cron (`0 2 * * *`)
- Manual trigger available via `workflow_dispatch`

### Process

1. Installs PostgreSQL 18 client on the runner
2. Runs `pg_dump` against the Neon database with retry logic (3 attempts, exponential backoff)
3. Compresses the dump with `gzip`
4. Pushes to a private backup repository via SSH
5. Prunes backups older than 30 days (configurable via `MAX_BACKUPS`)
6. Cleans up SSH keys after completion

### Backup Script

The backup script (`scripts/backup.sh`) handles:

- SSL enforcement for Neon connections
- Dump validation (size check > 1KB)
- Retry logic for both `pg_dump` and `git push`
- Automatic pruning of old backups
- Cleanup trap for temporary files

### Restore Script

To restore from a backup:

```bash
DATABASE_URL="postgresql://user:password@host:5432/dbname" \
  ./scripts/restore.sh path/to/neon_backup_TIMESTAMP.sql.gz
```

The restore script (`scripts/restore.sh`):

- Creates a pre-restore safety dump by default (`SAFETY_DUMP=yes`)
- Runs the restore inside a single transaction (`--single-transaction`)
- Performs a sanity check (counts public tables) after restore
- Supports non-interactive mode for CI (`CONFIRM=yes`)

---

## Project Structure

```
coworking-backend/
├── .github/
│   └── workflows/
│       └── db_backup.yml          # Automated daily backup workflow
├── prisma/
│   ├── schema.prisma              # Database schema (16 models)
│   └── seed.ts                    # Database seeder (admin user + defaults)
├── scripts/
│   ├── backup.sh                  # Backup script (pg_dump + git push)
│   └── restore.sh                 # Restore script (gunzip + psql)
├── src/
│   ├── server.ts                  # Entry point — HTTP server + Socket.io setup
│   ├── app.ts                     # Express app — middleware + route registration
│   ├── lib/
│   │   ├── prisma.ts              # Prisma client with pg connection pool
│   │   ├── ApiError.ts            # Custom error class
│   │   └── getParam.ts            # Query param helper
│   ├── middleware/
│   │   ├── authenticate.ts        # JWT verification middleware
│   │   ├── authorize.ts           # Page-level permission check middleware
│   │   └── errorHandler.ts        # Global error handler
│   └── modules/                   # Feature modules (one per domain)
│       ├── auth/                  # Login, logout, token refresh
│       ├── sessions/              # Check-in, checkout, pricing engine, live sessions
│       ├── subscribers/           # Subscription CRUD + renewal/pause
│       ├── inventory/             # Inventory item management + restock
│       ├── sales/                 # Snack sales + hot drinks
│       ├── expenses/              # Expense tracking by category
│       ├── debts/                 # Debt management (session + manual)
│       ├── rooms/                 # Room + booking management
│       ├── courses/               # Course + trainee management
│       ├── followUp/              # Disengaged visitor follow-up
│       ├── contacts/              # Contact directory + Excel import
│       ├── dashboard/             # Dashboard summary data
│       ├── reports/               # Financial reports (cash-basis)
│       ├── settings/              # Global settings
│       ├── staff/                 # Staff management + permissions
│       └── loginLogs/             # Login audit trail
├── frontend/
│   └── src/
│       ├── routes/                # TanStack Router file-based routes
│       │   ├── __root.tsx         # Root layout (AppShell)
│       │   ├── index.tsx          # Dashboard (/)
│       │   ├── live.tsx           # Live sessions (/live)
│       │   ├── history.tsx        # Session history (/history)
│       │   ├── subscribers.tsx    # Subscriptions (/subscribers)
│       │   ├── contacts.tsx       # Contacts (/contacts)
│       │   ├── snacks.tsx         # Snack sales (/snacks)
│       │   ├── hot-drinks.tsx     # Hot drink sales (/hot-drinks)
│       │   ├── inventory.tsx      # Inventory (/inventory)
│       │   ├── expenses.tsx       # Expenses (/expenses)
│       │   ├── debts.tsx          # Debts (/debts)
│       │   ├── rooms.tsx          # Rooms & bookings (/rooms)
│       │   ├── courses.tsx        # Courses & trainees (/courses)
│       │   ├── follow-up.tsx      # Follow-up (/follow-up)
│       │   ├── reports.tsx        # Reports (/reports)
│       │   ├── settings.tsx       # Settings (/settings)
│       │   └── login.tsx          # Login page (/login)
│       ├── components/
│       │   ├── layout/            # AppShell, Header, Sidebar
│       │   ├── shared/            # Reusable widgets (StatCard, StatusBadge, etc.)
│       │   └── ui/                # shadcn/ui components (46 components)
│       ├── contexts/
│       │   ├── auth-context.tsx   # Auth provider (JWT, permissions)
│       │   ├── use-auth.ts        # Auth hook
│       │   └── use-permissions.ts # Page-level permission hook
│       ├── services/              # API client + typed service modules
│       ├── hooks/                 # Custom React hooks
│       ├── data/                  # Client-side state (store)
│       └── lib/                   # Utilities (cn helper, etc.)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Scripts Reference

### Backend

| Script  | Command         | Description                                    |
| ------- | --------------- | ---------------------------------------------- |
| `dev`   | `npm run dev`   | Start dev server with hot-reload (`tsx watch`) |
| `build` | `npm run build` | Compile TypeScript to `dist/`                  |
| `start` | `npm start`     | Run compiled production server                 |
| `seed`  | `npm run seed`  | Seed database with admin user and defaults     |

### Frontend

| Script   | Command          | Description           |
| -------- | ---------------- | --------------------- |
| `dev`    | `npm run dev`    | Start Vite dev server |
| `build`  | `npm run build`  | Production build      |
| `lint`   | `npm run lint`   | Run ESLint            |
| `format` | `npm run format` | Format with Prettier  |
