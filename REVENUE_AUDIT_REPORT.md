# Revenue Calculation Audit Report

**Date:** August 10, 2026
**Scope:** Full codebase — backend (Node/Express/Prisma) + frontend (React/TanStack)
**Purpose:** Identify every source of truth for revenue/income calculations, document inconsistencies, and flag double-counting risks before any fixes are applied.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Data Model Overview](#2-data-model-overview)
3. [Backend Calculation Points](#3-backend-calculation-points)
4. [Frontend Calculation Points](#4-frontend-calculation-points)
5. [Comparison Table](#5-comparison-table)
6. [Critical Inconsistencies](#6-critical-inconsistencies)
7. [Double-Counting Risks](#7-double-counting-risks)
8. [Hardcoded Values & Rounding Issues](#8-hardcoded-values--rounding-issues)
9. [Timezone Handling](#9-timezone-handling)
10. [Recommendations](#10-recommendations)

---

## 1. Executive Summary

The application has **6 distinct revenue calculation points** on the backend and **4 client-side revenue calculations** on the frontend. These use **different formulas, different inclusion/exclusion rules, and different data sources** — meaning the same underlying data produces different numbers depending on which page you view.

**The most critical issues are:**

1. **Dashboard vs Reports use different session filters** — Dashboard includes ALL sessions (paid + unpaid), Reports only counts paid sessions.
2. **Dashboard vs Reports treat course revenue differently** — Dashboard uses pro-rata (spread over time), Reports uses lump-sum (cash basis).
3. **History Summary is a completely different formula** — Excludes courses, bookings, and debts entirely.
4. **Three frontend pages compute revenue from paginated data** — Hot Drinks, Snacks, and Snack Wallet pages sum only the current page (25 items), producing wrong numbers.
5. **"Other Sales" (مصروفات أخرى) entries are counted as snack revenue** — They're stored in the `Sale` model with `isHotDrink: false`, so they inflate the snacks revenue line in reports.

---

## 2. Data Model Overview

Key Prisma models involved in revenue:

| Model | Revenue Role |
|-------|-------------|
| `Session` | `amount` = final paid amount (hours + snacks - discount). `paymentStatus` = paid/partial_debt/full_debt |
| `SnackOrder` | `total` = price of snacks ordered in a session. Linked to `Session` |
| `Sale` | Standalone sales: snack sales (`isHotDrink: false`), hot drink sales (`isHotDrink: true`), "other sales" (`isHotDrink: false`, `itemName: "مصروفات أخرى"`) |
| `Subscription` | `amountPaid` = subscription fee. NOT included in any revenue total (subscribers get free time) |
| `Course` + `Trainee` | `trainee.amountPaid` = course fee paid per trainee |
| `Booking` | `price` = room rental fee. Only `status: "confirmed"` counts |
| `Debt` | `amount` = owed amount. Only `status: "collected"` with `collectedAt` counts as revenue |
| `Expense` | `amount` = expense. Subtracted from revenue to get net profit |
| `SnackWallet` | `balance` = wallet balance. Topping up is NOT revenue; deductions pay for snacks |

**Critical distinction:** There are TWO separate snack/sale tracking systems:
- `SnackOrder` — orders linked to a specific session (appear in `session.amount`)
- `Sale` — standalone sales records (inventory snack sales, hot drinks, "other sales")

---

## 3. Backend Calculation Points

### 3A. Dashboard — `calcDayRevenue()` (Daily Revenue)

**File:** `src/modules/dashboard/service.ts:7-79`
**Function:** `calcDayRevenue(date)`
**Used by:** `getSummary()` (line 82) for today's revenue, `getRevenueTrend()` (line 250) for chart data

**Formula:**
```
total = sessionRev + saleRev + courseRev + bookingRev + debtRev
```

| Component | Query | Filter |
|-----------|-------|--------|
| `sessionRev` | `Session.findMany` → sum `amount` | `checkOut` falls on this day (Palestine timezone) |
| `saleRev` | `Sale.findMany` → sum `total` | `date` falls on this day |
| `courseRev` | `Course` + `Trainee` → `amountPaid / durationDays` | Course active on this day (pro-rata) |
| `bookingRev` | `Booking.findMany` → sum `price` | `status: "confirmed"` AND `startTime` on this day |
| `debtRev` | `Debt.findMany` → sum `amount` | `status: "collected"` AND `collectedAt` on this day |

**Includes:**
- ALL session amounts (regardless of payment status — unpaid sessions included)
- ALL sale records (snack sales + hot drinks + "other sales" all merged)
- Course revenue spread pro-rata across course duration
- Confirmed bookings
- Collected debts

**Excludes:**
- Subscription payments (only checked for expiring alerts)
- Expenses (not subtracted)
- Hot drinks cost (not subtracted)
- Discounts (not tracked separately)

**Calculation location:** Backend (Prisma queries + JS reduce)
**Timezone:** Palestine (`Asia/Hebron`) via `palestineStartOfDay`/`palestineEndOfDay`

**⚠️ ISSUES:**
1. **No `paymentStatus` filter on sessions** — includes unpaid/debt sessions in revenue
2. **Merges all Sale types** — hot drinks and "other sales" mixed with snack sales
3. **Course revenue is pro-rata** (accrual basis) — different from Reports which uses lump-sum

---

### 3B. Reports Preview — `getPreview()`

**File:** `src/modules/reports/controller.ts:18-128`
**Function:** `getPreview()`

**Formula:**
```
totalRevenue = hoursRevenue + snacksRevenue + hotDrinksRevenue + coursesRevenue + roomsRevenue + debtRevenue
netProfit = totalRevenue - expensesTotal - hotDrinksCost
```

| Component | Query | Filter |
|-----------|-------|--------|
| `hoursRevenue` | `Session` → sum `(amount - snackOrders.total)` | `paymentStatus === "paid"` only |
| `snacksRevenue` | `Sale` → sum `total` | `isHotDrink === false` |
| `hotDrinksRevenue` | `Sale` → sum `total` | `isHotDrink === true` |
| `coursesRevenue` | `Trainee` → sum `amountPaid` | Active courses in range (FULL amount, not pro-rata) |
| `roomsRevenue` | `Booking` → sum `price` | `status: "confirmed"` |
| `debtRevenue` | `Debt` → sum `amount` | `status: "collected"` + `collectedAt` in range |
| `expensesTotal` | `Expense` → sum `amount` | In date range |
| `hotDrinksCost` | `settings.hotDrinksMonthlyCost × (days/30)` | Prorated |

**Includes:**
- Only PAID sessions (cash-basis)
- Separates snack sales from hot drinks
- Full course revenue (cash-basis, not pro-rata)
- Expenses and prorated hot drinks cost (subtracted for net profit)

**Excludes:**
- Unpaid/debt sessions
- Subscriber sessions from hoursRevenue (they have `amount = snacks only`, so `amount - snacksTotal = 0`)
- Subscription payments themselves

**Calculation location:** Backend (Prisma queries + JS reduce)
**Timezone:** `from`/`to` params parsed as `new Date()`, `to` wrapped with `palestineEndOfDay()`

**⚠️ KEY DIFFERENCE FROM DASHBOARD:**
- Sessions filtered by `paymentStatus === "paid"` (Dashboard has NO filter)
- Course revenue is FULL `amountPaid` sum (Dashboard uses pro-rata)
- Snacks and hot drinks separated (Dashboard merges them)

---

### 3C. Reports Export (Excel) — `exportReport()`

**File:** `src/modules/reports/controller.ts:130-568`
**Function:** `exportReport()`

When `type=reports`, the Financial Summary sheet uses the same formula as 3B but with a subtle difference:

- **Visits Summary sheet** (lines 280-307): Calculates `totalRevenue` as `amount - snacksTotal` for paid sessions (same as hoursRevenue)
- **Financial Summary sheet** (lines 483-550): Uses `sessionRev + saleRev + courseRev + bookingRev + debtRev` where `sessionRev = amount - snacksTotal` for paid sessions

**Note:** The export also includes a "Visits Summary" sheet that shows average revenue per visit = `hoursRevenue / paidVisits.length`. This counts ALL paid visits including subscribers (whose hoursRevenue = 0), which dilutes the average.

When `type=history`, only the visits sheet is generated (no financial summary).

---

### 3D. History Summary — `getHistorySummary()`

**File:** `src/modules/sessions/service.ts:1475-1565`
**Function:** `getHistorySummary()`

**Formula:**
```
netProfit = hoursRevenue + snacksRevenue - expensesTotal
```

| Component | Query | Filter |
|-----------|-------|--------|
| `hoursRevenue` | `Session` → sum `(amount - snackOrders.total)` | `paymentStatus === "paid"` AND NOT subscriber session |
| `snacksRevenue` | `Sale` → sum `total` | ALL sales (no `isHotDrink` filter) |
| `expensesTotal` | `Expense` → sum `amount` | In date range |

**Includes:**
- Only paid, non-subscriber sessions (hours portion only)
- ALL sale records (snacks + hot drinks + "other sales" merged)

**Excludes:**
- Course revenue ❌
- Booking/room revenue ❌
- Debt revenue ❌
- Hot drinks cost ❌
- Subscriber sessions from hoursRevenue

**Calculation location:** Backend
**Timezone:** Palestine via `palestineStartOfDay`/`palestineEndOfDay`

**⚠️ CRITICAL: This is a fundamentally different formula than Reports.** It produces a much lower number because it only counts session hours + snack sales. A user looking at this page would see a completely different "revenue" than the Reports page for the same date range.

---

### 3E. Daily Report Email — `generateAndSendDailyReport()`

**File:** `src/lib/daily-report.ts:371-485`
**Function:** `generateAndSendDailyReport()`

**Formula (lines 420-444):**
```
totalRevenue = sessionRev + saleRev + courseRev + bookingRev + debtRev
netProfit = totalRevenue - totalExpenses - hotDrinksProrated
```

| Component | Filter |
|-----------|--------|
| `sessionRev` | `paymentStatus === "paid"`, `amount - snacksTotal` |
| `saleRev` | ALL sales (no `isHotDrink` filter — unlike Reports!) |
| `courseRev` | Full `amountPaid` sum |
| `bookingRev` | `status: "confirmed"` |
| `debtRev` | `status: "collected"` |
| `totalExpenses` | All expenses in range |
| `hotDrinksProrated` | `monthlyCost × (days/30)` |

**⚠️ SUBTLE DIFFERENCE FROM REPORTS:** The email uses `saleRev = ALL sales` (line 428), while the Reports preview splits into `snacksRevenue` (non-hot-drink) + `hotDrinksRevenue` (hot drink). The **total** is the same, but the line-item breakdown differs.

The Excel attachment (`generateReportBuffer`, line 11) uses the same formula as the Reports export.

---

### 3F. Session Checkout — `checkout()`

**File:** `src/modules/sessions/service.ts:447-527`
**Function:** `checkout()`

**Formula (lines 494-503):**
```
calculatedPrice = pricing.totalAmount  (= timeAmount + ordersAmount)
effectiveHourlyPrice = hourlyPriceOverride ?? pricing.timeAmount
safeDiscount = min(discountAmount, effectiveHourlyPrice)
finalAmount = (effectiveHourlyPrice - safeDiscount) + snacksTotal
```

This `finalAmount` is stored as `session.amount`. Key points:
- Discount only applies to the hourly portion, not snacks
- `hourlyPriceOverride` allows manual override of the hourly price
- For subscribers: `timeAmount = 0`, so `finalAmount = snacksTotal`

---

### 3G. Session Pricing Engine

**File:** `src/modules/sessions/pricing.ts:7-48`
**Function:** `calculateSessionPricing()`

```
isSub = (subscriber with active sub) OR trainee
timeAmount = isSub ? 0 : min(hours × hourlyRate, fullDayPrice)
ordersAmount = sum(snackOrder.total)
totalAmount = timeAmount + ordersAmount
```

Used by: live sessions, checkout, history display, reports export

---

## 4. Frontend Calculation Points

### 4A. Hot Drinks Page — Client-Side Revenue

**File:** `frontend/src/routes/hot-drinks.tsx:254-260`
**API:** `GET /hot-drinks?page=X&limit=25`

```typescript
todayRev = sales.filter(isSameDay).reduce(sum)        // Line 255
monthRev = sales.filter(last30Days).reduce(sum)        // Lines 256-258
cost = settings.hotDrinksMonthlyCost                   // Line 259
net = monthRev - cost                                  // Line 260
```

**⚠️ BUG:** `sales` is the **current page only** (25 items max). If there are 100 hot drink sales this month, only the first 25 are summed. The revenue figures are wrong.

**Also:** Uses `today.getTime() - new Date(s.date).getTime() < 30 * 86_400_000` which is a rough 30-day window, not calendar month. Does NOT use Palestine timezone for date comparison.

---

### 4B. Snacks Page — Client-Side Revenue

**File:** `frontend/src/routes/snacks.tsx:322-326`
**API:** `GET /sales?page=X&limit=25`

```typescript
todayRev = sales.filter(isSameDay).reduce(sum)        // Line 323
monthRev = sales.filter(last30Days).reduce(sum)        // Lines 324-326
```

**⚠️ BUG:** Same pagination issue as Hot Drinks. Only sums current page (25 items).

**Also:** This page includes "other sales" (مصروفات أخرى) in the revenue total, since they're stored as `Sale` records with `isHotDrink: false`. These are NOT snack revenue — they're miscellaneous income entries.

---

### 4C. Snack Wallet Page — Client-Side Total Balance

**File:** `frontend/src/routes/snack-wallet.tsx:96`
**API:** `GET /snack-wallet?page=X&limit=25`

```typescript
totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0)
```

**⚠️ BUG:** Only sums wallets on the current page (25 items). If there are 100 wallets, the total is wrong.

**Note:** Wallet balance is NOT revenue — it's prepaid credit. But displaying an incorrect total is still a bug.

---

### 4D. Debts Page — Client-Side Total

**File:** `frontend/src/routes/debts.tsx:158`
**API:** `GET /debts?limit=1000`

```typescript
total = debts.filter(d => d.status === "unpaid").reduce(sum)
```

**Minor issue:** Limited to 1000 debts. Safe for normal usage but technically incomplete.

---

## 5. Comparison Table

| Page/Component | Data Sources Included | Date Range Logic | Calculation Location | Known/Suspected Issues |
|---|---|---|---|---|
| **Dashboard (today)** | Sessions (ALL status), Sales (ALL), Courses (pro-rata), Bookings (confirmed), Debts (collected) | Palestine timezone, today only | Backend | Includes unpaid sessions; merges all Sale types |
| **Dashboard (trend)** | Same as above, per day | Palestine timezone, N days back | Backend | Same issues as daily |
| **Reports Preview** | Sessions (PAID only), Snack Sales (non-hot), Hot Drinks (separate), Courses (full amountPaid), Bookings (confirmed), Debts (collected), Expenses, Hot drinks cost | `from`/`to` params, `to` wrapped with `palestineEndOfDay` | Backend | Course revenue = lump sum (differs from dashboard pro-rata) |
| **Reports Export (Excel)** | Same as preview | Same | Backend | Visits summary sheet averages include subscriber visits (dilutes avg) |
| **Daily Report Email** | Sessions (PAID), ALL Sales (merged), Courses (full), Bookings, Debts, Expenses, Hot drinks cost | Palestine timezone, single day | Backend | Sale line items differ from Reports (merged vs split) |
| **History Summary** | Sessions (PAID, non-sub only), ALL Sales (merged), Expenses | Palestine timezone, `from`/`to` | Backend | **Missing:** courses, bookings, debts. Fundamentally different formula |
| **Hot Drinks Page** | Current page of Sales only (25 items) | Client-side `isSameDay` + 30-day window | **Frontend** | **BUG:** Paginated data = wrong totals |
| **Snacks Page** | Current page of Sales only (25 items) | Client-side `isSameDay` + 30-day window | **Frontend** | **BUG:** Paginated data = wrong totals; includes "other sales" |
| **Snack Wallet Page** | Current page of wallets only (25 items) | None | **Frontend** | **BUG:** Paginated data = wrong total balance |
| **Debts Page** | Up to 1000 debts | None | Frontend | Minor: capped at 1000 |

---

## 6. Critical Inconsistencies

### 6.1 Dashboard vs Reports: Session Payment Status Filter

| | Dashboard | Reports |
|---|---|---|
| Session filter | **NONE** (all sessions with `checkOut`) | `paymentStatus === "paid"` only |
| Impact | Unpaid/debt sessions inflate revenue | Only cash-basis revenue counted |

**Example:** A session with `amount: 50` and `paymentStatus: "full_debt"` would appear in Dashboard revenue but NOT in Reports revenue.

### 6.2 Dashboard vs Reports: Course Revenue Treatment

| | Dashboard | Reports |
|---|---|---|
| Course revenue | Pro-rata: `amountPaid / durationDays` per day | Full: `sum(all trainee.amountPaid)` |
| Accounting basis | Accrual (spread over time) | Cash (lump sum when active) |

**Example:** A 30-day course with 10 trainees paying 300 ₪ each:
- Dashboard: counts 100 ₪/day (3000 ÷ 30)
- Reports: counts 3000 ₪ total (for any overlapping date range)

### 6.3 History Summary vs Reports: Scope

| | Reports | History Summary |
|---|---|---|
| Session hours | ✅ (paid only) | ✅ (paid, non-sub only) |
| Snack sales | ✅ (separate hot/non-hot) | ✅ (all merged) |
| Course revenue | ✅ | ❌ **Missing** |
| Booking revenue | ✅ | ❌ **Missing** |
| Debt revenue | ✅ | ❌ **Missing** |
| Expenses | ✅ (subtracted) | ✅ (subtracted) |
| Hot drinks cost | ✅ (subtracted) | ❌ **Missing** |

**Impact:** History Summary `netProfit` is always lower than Reports `netProfit` for the same date range, because it excludes 3 revenue streams and 1 cost.

### 6.4 Reports vs Daily Report Email: Sale Line Items

| | Reports Preview | Daily Report Email |
|---|---|---|
| Snacks revenue | `Sale` where `isHotDrink: false` | ALL `Sale` records |
| Hot drinks revenue | `Sale` where `isHotDrink: true` (separate line) | Merged into `saleRev` |

**Impact:** The total is the same, but the Excel breakdown differs. The email's "إيراد المبيعات" includes hot drinks, while Reports separates them.

### 6.5 Hot Drinks Page vs Reports: Hot Drinks Revenue

| | Hot Drinks Page | Reports |
|---|---|---|
| Data source | Client-side sum of paginated Sales | Backend query of ALL Sales |
| Cost treatment | `monthRev - hotDrinksMonthlyCost` | `hotDrinksRevenue` separate; cost subtracted in net profit |
| Scope | Only hot drink page's data | All revenue streams |

---

## 7. Double-Counting Risks

### 7.1 Snack Orders vs Sale Records — NO DOUBLE COUNTING ✅

When a snack is ordered during a session:
1. A `SnackOrder` is created (linked to session)
2. A `Sale` record is ALSO created (standalone)

**However,** the revenue calculations handle this correctly:
- `hoursRevenue` = `session.amount - snackOrders.total` (subtracts snacks from session total)
- `snacksRevenue` = `Sale.total` (counts the standalone sale)

So the snack is counted ONCE — either as part of session amount (then subtracted) or as a standalone Sale. **No double-counting.**

### 7.2 Wallet Top-Up vs Snack Purchase — POTENTIAL DOUBLE COUNTING ⚠️

When a user pays for snacks via wallet:
1. Wallet is topped up (creates `SnackWalletTransaction` type: "topup")
2. Snack order is placed → wallet is deducted (type: "deduction")
3. A `Sale` record is created for the snack

**Revenue impact:**
- The wallet top-up is NOT counted as revenue anywhere (good)
- The snack purchase IS counted as revenue via the `Sale` record (good)
- The session's `amount` includes the snack total (which is then subtracted in `hoursRevenue` calculation)

**Potential issue:** If someone tops up a wallet AND pays for the same snack via a different method, the snack could appear twice. But the current flow doesn't support this — wallet deduction happens automatically when an order is placed.

### 7.3 "Other Sales" (مصروفات أخرى) Counted as Snack Revenue ⚠️

"Other sales" are stored as `Sale` records with:
- `isHotDrink: false`
- `itemName: "مصروفات أخرى"`
- `itemId: null`

**Impact:**
- Reports: counted in `snacksRevenue` (wrong category)
- History Summary: counted in `snacksRevenue` (wrong category)
- Daily Report Email: counted in `saleRev` (correct in total, wrong category)
- Dashboard: counted in `saleRev` (correct in total, wrong category)

These are miscellaneous income entries, not snack sales. They inflate the "snacks revenue" line.

### 7.4 Debt Revenue and Session Revenue — POTENTIAL DOUBLE COUNTING ⚠️

When a session is checked out as unpaid:
1. `session.amount` is set to the total
2. A `Debt` record is created with the same amount
3. `paymentStatus` = "full_debt" or "partial_debt"

When the debt is later collected:
4. `Debt.status` changes to "collected" with `collectedAt`

**Dashboard:** Counts the session (via `session.amount`) AND the debt (via `debt.amount`) on different days. This is correct — the session revenue is counted on checkout day, debt collection on collection day. They're different events.

**Reports:** Only counts the debt collection (session is filtered out by `paymentStatus !== "paid"`). This is also correct for cash-basis accounting.

**No double-counting** as long as the session has `paymentStatus !== "paid"` when the debt is created.

---

## 8. Hardcoded Values & Rounding Issues

### 8.1 Rounding

All backend calculations use the same rounding function:
```typescript
const r = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
```

This is consistent across all backend files. No inconsistency found.

### 8.2 Hardcoded Values

| Location | Value | Issue |
|----------|-------|-------|
| `hot-drinks.tsx:257` | `30 * 86_400_000` (30 days in ms) | Not a calendar month — always 30 days regardless of actual month length |
| `snacks.tsx:325` | `30 * 86_400_000` | Same issue |
| `reports/controller.ts:85` | `daysInRange / 30` | Prorates monthly cost assuming 30-day months |
| `daily-report.ts:421,264` | `daysInRange / 30` | Same |
| `reports/controller.ts:532` | `daysInRange / 30` | Same |
| `debts.tsx:160` | `14 * 86_400_000` (14 days) | Overdue threshold — hardcoded |

### 8.3 Currency Handling

All amounts are stored as `Decimal(10, 2)` in PostgreSQL. The frontend uses `fmtCurrency()` for display. No currency conversion issues found — the system operates in a single currency (₪ / ILS).

### 8.4 Inconsistent Rounding in Reports Export

**File:** `src/modules/reports/controller.ts:196`
```typescript
const rn = (v: number) => Math.round(v);  // Rounds to INTEGER
```

This is used for the visits sheet export, while the financial summary uses `r()` (2 decimal places). The visits sheet shows rounded integers for `ordersAmount`, `hoursAmount`, `totalAmount`, and `discount`. This means the Excel export shows different precision than the preview API.

---

## 9. Timezone Handling

### Backend

All backend date filtering uses Palestine timezone helpers from `src/lib/timezone.ts`:
- `palestineStartOfDay(d)` — midnight Palestine time as UTC
- `palestineEndOfDay(d)` — 23:59:59.999 Palestine time as UTC
- `isSamePalestineDay(a, b)` — compares calendar dates in Palestine timezone

**Dashboard:** Uses `palestineStartOfDay`/`palestineEndOfDay` ✅
**Reports:** Uses `palestineEndOfDay` for `to` param, but `from` is parsed as raw `new Date()` ⚠️ — the `from` date might not align to Palestine midnight
**History Summary:** Uses `palestineStartOfDay`/`palestineEndOfDay` ✅
**Daily Report Email:** Uses `palestineStartOfDay`/`palestineEndOfDay` ✅

### Frontend

The Hot Drinks and Snacks pages use:
```typescript
isSameDay(s.date, today)  // Uses Intl.DateTimeFormat with "Asia/Hebron"
```

**However,** the 30-day window uses raw JavaScript date math:
```typescript
today.getTime() - new Date(s.date).getTime() < 30 * 86_400_000
```

This compares UTC timestamps, NOT Palestine local dates. If a sale happened at 23:30 Palestine time (20:30 UTC), the 30-day window could include/exclude it incorrectly around month boundaries.

---

## 10. Recommendations

### Immediate Fixes (Bugs)

1. **Hot Drinks, Snacks, Snack Wallet pages:** Replace client-side paginated sums with dedicated backend API endpoints that return pre-computed totals (similar to how Dashboard and History Summary work).

2. **"Other Sales" categorization:** Either:
   - Create a separate `SaleType` enum and exclude "other sales" from snack revenue totals, OR
   - Add a `type` field to the `Sale` model to distinguish snack sales from other income

3. **Reports `from` date:** Wrap with `palestineStartOfDay()` to ensure consistent date boundaries.

### Design Decisions Needed

4. **Define "Revenue" consistently:** Decide whether:
   - Revenue = cash-basis (only paid sessions) or accrual (all sessions)
   - Course revenue = pro-rata or lump-sum
   - "Other sales" = revenue or separate category
   - Wallet top-ups = revenue or not (currently: not)

5. **Unify Dashboard and Reports:** Either:
   - Make Dashboard use the same formula as Reports (cash-basis, separated categories), OR
   - Make Reports use the same formula as Dashboard (include all sessions)

6. **History Summary scope:** Decide whether it should match Reports (include courses, bookings, debts) or remain a simpler "session-focused" view.

7. **Daily Report Email alignment:** Align the email's sale breakdown with the Reports page (separate hot drinks from snacks).

---

*End of Audit Report*
