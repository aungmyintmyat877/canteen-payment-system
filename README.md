# Canteen Payment & Student ID System

Cashless canteen payments and printable digital student ID cards for a
university. Built with **Next.js (App Router, TypeScript)** and **MySQL**
(mysql2, connection pooling), with role-based access for **Students**,
**Canteen Cashiers**, and **Admins**.

All monetary amounts are stored as **BIGINT minor units (cents)** — no floats
anywhere. Every balance mutation runs inside a **MySQL transaction with a
`FOR UPDATE` row lock**, and every top-up/payment carries an
**idempotency key** so double-clicks or network retries can never double-charge.

---

## Quick start

```bash
npm install

# Option A — zero-config: disposable local MySQL on port 3307
#            (uses the installed MySQL Server 8.0 binaries, data in .local-mysql/)
npm run db:start
npm run seed          # creates schema + demo data (idempotent)

# Option B — your own MySQL: edit .env.local, then
#   mysql -u root -p < schema.sql
#   npm run seed

npm run dev           # http://localhost:3000
```

Demo accounts (all PINs **123456**):

| Role    | ID           | Lands on  |
| ------- | ------------ | --------- |
| Student | S001 – S005  | `/student` |
| Cashier | C001         | `/cashier` |
| Admin   | A001         | `/admin`   |

Other scripts:

```bash
npm run smoke         # end-to-end API test incl. concurrency & idempotency (mutates data)
npm run page-check    # renders every authenticated page with a real session
npm run db:stop       # stop the disposable MySQL
npm run build && npm start   # production
```

> `.env.local` ships pointing at the disposable instance (port 3307, empty root
> password). To use your own server, change `MYSQL_PORT` / `MYSQL_USER` /
> `MYSQL_PASSWORD` there. **Never** commit real credentials.

---

## How it works

```
Student phone ── signed QR ──▶ Cashier terminal (camera scan)
                                   │  POST /api/cashier/scan → verify HMAC → show photo
                                   ▼
        ┌────────────── MySQL transaction ──────────────┐
        │ SELECT … FROM students WHERE id=? FOR UPDATE  │ ← row lock: concurrent
        │ re-check idempotency key under the lock       │   cashiers serialize here
        │ UPDATE students SET balance = balance ± ?     │
        │ INSERT INTO transactions (…, balance_after)   │ ← ledger row written
        │ INSERT INTO audit_logs (…)                    │   atomically with update
        └───────────────────────────────────────────────┘
```

**QR anti-forgery.** The pass encodes `<student_id>.<sig>` where
`sig = HMAC_SHA256(key: SERVER_SECRET, msg: student_id + qr_secret)` truncated
to 128 bits. Students never see `SERVER_SECRET` or their `qr_secret` (only the
finished payload), so passes cannot be minted or modified client-side.
Rotating a student's `qr_secret` invalidates all copies of their pass.
Verification is timing-safe, and the signature is re-checked inside the
locking transaction against the locked row.

**Idempotency.** The client generates a UUID per transaction *intent* and
reuses it across retries of that intent. The server checks the key before the
transaction (fast path), re-checks it under the row lock, and relies on
`UNIQUE(idempotency_key)` as the final backstop — a duplicate insert becomes a
replay response (`duplicate: true`) with the original transaction, never a
second charge. Refunds derive a deterministic key (`refund:<tx_id>`) when the
client doesn't send one.

**Money.** BIGINT minor units everywhere; `lib/money.ts` formats and parses.
A `CHECK` constraint pins the sign convention (`payment < 0`,
`topup/refund > 0`) and another pins `balance >= 0`.

**Refunds** never modify the original payment. An admin refund creates a new
positive `refund` ledger row linked via `refund_of`, guarded by
`UNIQUE(refund_of)` → a payment can be refunded at most once.

**Role separation** (enforced server-side in every route, and by layouts in
the UI): students read only their own data; only cashiers scan / top-up /
take payments; only admins see summaries, the audit trail, and refunds.

**PIN handling.** Student payment PINs and staff login PINs are bcrypt hashes
(cost 10), never stored or logged in plaintext. In the payment flow the PIN is
verified *before* the transaction opens so the bcrypt cost never holds the row
lock; the authoritative balance check happens under the lock.

---

## Implementation plan (as built)

1. **Schema** — `schema.sql`: `students`, `staff`, `transactions` (ledger),
   `audit_logs`; BIGINT money, CHECK constraints, unique idempotency and
   refund keys, FK + covering indexes.
2. **Data layer** — `src/lib/db.ts`: pooled mysql2 client
   (`bigNumberStrings` so BIGINT never loses precision), `withTransaction()`
   helper that owns BEGIN/COMMIT/ROLLBACK/release.
3. **Auth** — `src/lib/auth.ts`: JWT (jose, HS256) in an httpOnly cookie,
   `requireRole(...)` guards, `requireActiveStudent()` re-reads the student so
   blocked/deleted accounts lose access instantly.
4. **QR** — `src/lib/qr.ts`: sign / verify payload, timing-safe compare,
   manual-entry path gated by `ALLOW_MANUAL_ENTRY`.
5. **Ledger core** — `src/lib/ledger.ts`: `processTopup`, `processPayment`
   (PIN + sufficiency under lock), `issueRefund`; audit rows written inside
   the same transaction.
6. **API routes** — `src/app/api/**`: auth (login/logout/me), student
   (qr, transactions, id-card), cashier (scan, topup, payment),
   admin (summary, transactions, refund, audit).
7. **UI** — landing, login, student portal (balance, dynamic QR, history,
   ID card), cashier terminal (html5-qrcode camera, PIN pad), admin dashboard
   (summaries, refunds, audit log).
8. **ID card** — `src/components/IdCard.tsx`: pure HTML/CSS card rendered from
   live records (front: photo/name/ID/STUDENT label; back: QR, phone, email,
   class/major, ID), COPY watermark, PNG + print-size CR80 PDF export via
   html2canvas + jsPDF.
9. **Verification** — `npm run build`, then `scripts/smoke.mjs`: 33 checks
   covering auth, role separation, forged QR, idempotent replay (serial +
   3-way concurrent), wrong PIN, insufficient funds, per-tx cap, 8-way
   parallel mixed traffic (no lost updates), refund + double-refund guard,
   audit coverage.

## Project layout

```
schema.sql                    MySQL schema (canonical)
scripts/seed.mjs              schema + demo data (npm run seed)
scripts/local-db.mjs          disposable dev MySQL manager (db:start/stop/status)
scripts/smoke.mjs             end-to-end API smoke test
scripts/page-check.mjs        authenticated page render check
src/lib/db.ts                 mysql2 pool + withTransaction
src/lib/ledger.ts             topup / payment / refund core (locks, idempotency, audit)
src/lib/qr.ts                 HMAC QR signing & verification
src/lib/auth.ts               JWT sessions & role guards
src/lib/money.ts              BIGINT money formatting/parsing
src/app/api/**                route handlers (see table below)
src/app/student/**            student portal pages
src/app/cashier/page.tsx      cashier terminal page
src/app/admin/page.tsx        admin dashboard page
src/components/IdCard.tsx     dynamic ID card + PNG/PDF export
src/components/CashierTerminal.tsx, QRScanner.tsx, PinPad.tsx, AdminDashboard.tsx, StudentQr.tsx
```

## API reference

| Method & path | Role | Body / query | Notes |
| --- | --- | --- | --- |
| POST `/api/auth/login` | — | `{ id, pin }` | role auto-detected (checks `students`, then `staff`); sets session cookie, returns `redirect` |
| POST `/api/auth/logout` | any | — | clears session |
| GET `/api/auth/me` | any | — | current session |
| GET `/api/student/qr` | student | — | signed QR payload (secret never exposed) |
| GET `/api/student/transactions` | student | `?page&pageSize` | paginated history |
| GET `/api/student/id-card` | student | — | card fields + QR payload |
| POST `/api/cashier/scan` | cashier | `{ payload }` or `{ studentId, manual: true }` | verify pass → student + photo |
| POST `/api/cashier/topup` | cashier | `{ payload?, amount, idempotency_key }` | `FOR UPDATE` + ledger insert |
| POST `/api/cashier/payment` | cashier | `{ payload?, amount, pin, idempotency_key }` | PIN + sufficiency under lock |
| GET `/api/admin/summary` | admin | — | today + 7-day series + liabilities |
| GET `/api/admin/transactions` | admin | `?type&page&pageSize` | ledger with refund status |
| POST `/api/admin/refund` | admin | `{ transaction_id, idempotency_key?, note? }` | new refund row, one per payment |
| GET `/api/admin/audit` | admin | `?page&pageSize` | who did what |

Errors are structured: `{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "…" } }`
with a meaningful HTTP status (400/401/403/404/409/500).

## Configuration

`.env.local` keys: `MYSQL_*`, `SERVER_SECRET` (QR HMAC), `SESSION_SECRET`
(JWT), `ALLOW_MANUAL_ENTRY` (dev-only manual student lookup — **set to
`false` in production**), `NEXT_PUBLIC_UNIVERSITY_NAME`. Currency lives in
`src/lib/money.ts` (`CURRENCY`).

## Production checklist

- [ ] Set long random `SERVER_SECRET` and `SESSION_SECRET` (rotation of
      `SERVER_SECRET` invalidates all passes; rotate `qr_secret` per student
      to re-issue cards).
- [ ] `ALLOW_MANUAL_ENTRY=false`.
- [ ] Serve over HTTPS (cookie is `secure` in production) behind the campus
      network or VPN.
- [ ] Give the app a dedicated MySQL user with least privileges and backups.
- [ ] Add rate limiting / lockout on login and PIN entry (currently logged in
      `audit_logs` as `login_failed` / `payment_pin_failed` for review).
- [ ] Add a PIN-change flow for students and staff management UI.
- [ ] Consider row-lock retry on `ER_LOCK_DEADLOCK` for extreme concurrency.
