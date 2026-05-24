# Concurrency-Safe Inventory Reservation System

This is a production-ready Next.js App Router application built with TypeScript, Tailwind CSS, ESLint, Prisma, and `@prisma/client`. It is designed as a high-integrity take-home project focusing on **concurrency-safe inventory reservations** backed by PostgreSQL.

---

## 🏗️ Monolithic Architecture & Simplicity

To ensure operational reliability, clear reasoning, and developer velocity, this system implements a clean **monolithic App Router architecture**. 

We deliberately avoid introducing unnecessary infrastructure components such as Kafka, external message queues, WebSockets, or distributed event buses. Concurrency safety and database integrity are handled directly at the database engine level inside standard atomic transactions.

---

## ⚡ Concurrency Strategy: Pessimistic Row-Level Locking

In an inventory system, preventing overselling under high concurrent demand is correctness-critical. This project implements a **pessimistic row-level locking strategy** within a database transaction pool to guarantee double-reservation safety.

### Lock Execution Flow
Because Prisma does not expose a high-level row-locking API directly, the system uses raw query transaction capabilities:

```mermaid
sequenceDiagram
    autonumber
    Client->>API: POST /api/reservations (Create Request)
    API->>Database: Start Transaction (prisma.$transaction)
    API->>Database: Lock Inventory Row (tx.$queryRaw with FOR UPDATE)
    Database-->>API: Inventory Row Locked exclusively
    API->>API: Compute Available = totalUnits - reservedUnits
    alt Available >= Requested Units
        API->>Database: Create Reservation (Status: pending, expiresAt: now + limit)
        API->>Database: Increment reservedUnits (reservedUnits + requested)
        API->>Database: Commit Transaction
        Database-->>API: Transaction Committed & Lock Released
        API-->>Client: 201 Created (Success)
    else Insufficient Stock
        API->>Database: Rollback Transaction & Lock Released
        API-->>Client: 409 Conflict (Insufficient Stock)
    end
```

1. **Transaction Hook**: We initialize a transaction context via `prisma.$transaction()`.
2. **Exclusive Row Lock**: We execute `SELECT * FROM "Inventory" WHERE id = $1 FOR UPDATE` using Prisma's `tx.$queryRaw`. This blocks any concurrent transaction trying to read or acquire a lock on this specific inventory row until this transaction commits or rolls back.
3. **Atomic Stock Check**: Available stock is computed dynamically as:
   $$\text{Available} = \text{totalUnits} - \text{reservedUnits}$$
   *Note: We never cache available stock in a separate column to avoid race conditions or out-of-sync states.*
4. **State Persistence**: If stock is available, a `Reservation` is created with state `pending`, and the inventory's `reservedUnits` count is incremented atomically.
5. **Auto-Rollback**: If units are unavailable, the transaction rolls back, releasing locks and returning an `HTTP 409 Conflict` status.

---

## 🔄 Reservation State Machine

```mermaid
stateDiagram-v2
    [*] --> pending : Create Reservation (validates units > 0, exists)
    pending --> confirmed : Confirm (sets confirmedAt)
    pending --> released : Expire / Cancel (sets releasedAt)
    confirmed --> [*]
    released --> [*]
    
    note right of confirmed
        Confirmed reservations can never transition back to released.
    end
```

### State Validation Rules:
- **Quantity Validation**: Reservation units must be a positive integer strictly $> 0$.
- **Inventory Existence**: Target inventory (linked to valid Product and Warehouse models) must exist in the database.
- **Terminal State Lock**: Once a reservation is `confirmed` or `released`, any subsequent state transitions are rejected with an `INVALID_STATE_TRANSITION` error.

---

## 🧹 Expiry Strategy & Background Cleanup

To prevent pending reservations from blocking stock indefinitely, we implement an automatic release strategy:

1. **Vercel Cron Trigger**: A background cron job pings our cleanup endpoint (e.g. `/api/cron/cleanup`) every minute.
2. **Secured Endpoint**: In production, the API is protected using a `CRON_SECRET` header token matching Vercel's environment variables.
3. **Execution**:
   - The handler queries all `pending` reservations where `expiresAt < now()`.
   - Each expired reservation is processed inside a database transaction:
     - The corresponding `Inventory` row is locked (`FOR UPDATE`).
     - `reservedUnits` is decremented by the reservation units.
     - `status` is updated to `released`, and `releasedAt` is timestamped.

---

## 🛠️ Folder Structure

The project features a clean separation of concerns:
```bash
src/
├── app/                  # Next.js App Router (Pages, layouts, API routes)
├── components/           # Reusable UI elements (Simple, clean, focus on error handling)
├── lib/                  # Shared core utilities (e.g. prisma singleton)
│   ├── prisma.ts         # Global database client singleton
│   └── utils.ts          # CN styling merger helper
├── server/               # Core backend services
│   ├── db/               # DB connectivity layers
│   ├── services/         # Business logic layer
│   │   ├── inventory.service.ts
│   │   └── reservation.service.ts
│   └── validators/       # Request validation layer using Zod
│       └── reservation.validator.ts
└── types/                # Global TypeScript declarations and interfaces
prisma/                   # Prisma schema, migrations, and seeds
```

---

## ⚖️ Architectural Trade-Offs

- **Pessimistic vs. Optimistic Locking**:
  > *"Pessimistic locking was chosen over optimistic locking because inventory reservation systems are correctness-critical and contention-sensitive. Preventing overselling was prioritized over maximizing write throughput."*
  Under high demand on a single product, optimistic locking creates massive write-contention, forcing concurrent users to retry repeatedly. Pessimistic locking queues these requests safely at the database engine level, resulting in deterministic behavior.

---

## 🚀 Future Improvement: API Idempotency

- **Idempotency Keys**:
  > *Implement Redis-backed idempotency keys for reservation creation and confirmation APIs to safely handle retried payment requests or network hiccups without duplicating side effects.*
  By sending an `Idempotency-Key` header, clients can safely retry failed POST requests. The server stores transaction responses in a high-speed Redis cache, returning the original response immediately on subsequent retries.

---

## ⚙️ Getting Started & Local Setup

### 1. Clone the project and install packages:
```bash
npm install
```

### 2. Configure Environment:
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://username:password@hostname:port/database?sslmode=require"
CRON_SECRET="your-secure-cron-token"
```

### 3. Run Migrations:
Verify the schema and run migrations to your PostgreSQL instance:
```bash
npx prisma db push
```

### 4. Run Development Server:
```bash
npm run dev
```

### 5. Type-Check and Build:
To verify compilation before shipping:
```bash
npx tsc --noEmit
npm run build
```
