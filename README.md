# Concurrency-Safe Inventory Reservation System

A production-ready, high-integrity inventory reservation platform built to manage multi-warehouse product distribution. This application ensures complete concurrency safety and prevents overselling under high concurrent traffic during delayed payment checkouts.

---

## 🔗 Live Demo
* **Production Deployed Application**: [https://inventory-reservation-system.vercel.app](https://allo-inv-lovat.vercel.app/products)
* **Database Infrastructure**: Managed via Neon PostgreSQL serverless instances.

---

## 🏗️ Architecture & Business Problem

### The Business Challenge
In modern e-commerce and retail systems, overselling inventory is a high-cost failure. When a customer adds an item to their cart and proceeds to checkout, there is a delay (often 5 to 15 minutes) while they enter shipping information, input payment details, and complete 3D Secure verification. 

If stock is only deducted *after* payment succeeds, two concurrent buyers could pay for the last remaining item, resulting in a severe overselling collision. Conversely, if stock is deducted *when* the user enters checkout without a reservation timeout, abandoned checkouts would lock inventory indefinitely, blocking other active buyers and reducing conversion rates.

### The Solution: Temporary Holds & Auto-Cleanup
This platform implements a high-integrity **Temporary Inventory Reservation** pattern:
1. **At Checkout**: When a customer clicks "Reserve", the system locks the requested quantity in a specific warehouse, setting a strict 10-minute expiration hold.
2. **Atomic Hold Allocation**: The hold checks stock availability and registers the reservation inside an atomic database transaction.
3. **During Checkout**: While the checkout countdown timer runs, the held inventory units are protected. No other concurrent buyer can claim these units.
4. **Resolution (Purchase)**: If the buyer completes the transaction, the reservation is transitioned to `confirmed`. The reserved units are permanently captured.
5. **Resolution (Abandonment)**: If the hold expires or the buyer cancels checkout, a cleanup daemon releases the hold, restoring `reservedUnits` to the warehouse's available stock pool immediately.

---

## 🚀 Key Features

* **Multi-Warehouse Support**: Dynamically tracks physical stock balances across multiple distribution hubs and fulfillment warehouses.
* **Concurrency-Safe Allocations**: Fully protects inventory records against write-skew and race conditions using advanced database row-level locking.
* **Deterministic Availability Calculations**: Evaluates actual inventory availability dynamically on every query, avoiding dangerous column sync-lag.
* **Transactional State Transitions**: Enforces a strict one-way state machine to secure reservation records from double-releases or invalid transitions.
* **Background Cleanup Architecture**: Secures an idempotent, transactional cleanup route to release expired holds and return stock safely.
* **Interactive Countdown Experience**: Provides a premium Tailwind CSS frontend with a precise real-time visual countdown timer and instant stock adjustment feedback.
* **Rigorous Integration Verification**: Embeds a dedicated integration test suite verifying pessimistic concurrency and state transitions under high load.

---

## ⚙️ Concurrency Strategy: Pessimistic Row-Level Locking

### The Race Condition Problem
Under high-demand scenarios (e.g., product drops), thousands of concurrent requests target the same database rows. In standard database isolation levels (such as Read Committed), standard `SELECT` followed by `UPDATE` queries are susceptible to **race conditions**:

```
Transaction A (User 1)                     Transaction B (User 2)
  |                                          |
  |-- SELECT reservedUnits (Returns 0)       |
  |                                          |-- SELECT reservedUnits (Returns 0)
  |-- Compute Stock Available: 1 >= 1        |
  |-- Create Reservation                     |-- Compute Stock Available: 1 >= 1
  |-- UPDATE reservedUnits to 1 (Commit)     |-- Create Reservation
  |                                          |-- UPDATE reservedUnits to 1 (Commit)
  v                                          v
                    *** OVERSELL DETECTED (Stock = 1, Reserved = 2) ***
```

Optimistic concurrency control (OCC) using versions or timestamps would reject one of the concurrent transactions, forcing the application to retry. Under extreme write contention, OCC results in massive transaction rollbacks, high latency, and a poor user experience as buyers repeatedly face errors.

### The Solution: Explicit Row Locking (`SELECT ... FOR UPDATE`)
This system implements **Pessimistic Row-Level Locking** within an atomic Prisma transaction context. 

When a reservation is created, the service locks the exact `Inventory` row matching the requested product and warehouse using a raw PostgreSQL query:
```sql
SELECT * FROM "Inventory" WHERE "id" = $1 FOR UPDATE;
```
This forces PostgreSQL to block any concurrent transactions attempting to read, update, or lock this specific row until the parent transaction commits or rolls back.

```mermaid
sequenceDiagram
    autonumber
    Client 1->>API: POST /api/reservations (5 units)
    Client 2->>API: POST /api/reservations (5 units)
    Note over API,Database: DB holds 8 total units, 0 reserved
    API->>Database: Tx 1: Lock Inventory Row (FOR UPDATE)
    Database-->>API: Tx 1: Lock Acquired exclusively
    API->>Database: Tx 2: Lock Inventory Row (FOR UPDATE)
    Note over Database: Tx 2 is queued & blocked
    API->>API: Tx 1: Calculate Available (8 - 0 = 8)
    API->>Database: Tx 1: Create Reservation & Increment reservedUnits to 5
    API->>Database: Tx 1: Commit Transaction
    Database-->>API: Tx 1: Committed & Lock Released
    API-->>Client 1: HTTP 201 Created (Success)
    Note over Database: Tx 2 lock is now acquired!
    API->>API: Tx 2: Calculate Available (8 - 5 = 3)
    Note over API: Tx 2: 3 available < 5 requested -> Insufficient Stock!
    API->>Database: Tx 2: Rollback Transaction & Release Lock
    API-->>Client 2: HTTP 409 Conflict (Insufficient Stock)
```

Under concurrent requests for the final remaining inventory unit:
* **Exactly one** transaction successfully acquires the lock, verifies stock, increments `reservedUnits`, and commits.
* **All other** queued transactions block, resume sequentially, find `availableUnits < requested`, roll back cleanly, and terminate safely with an `HTTP 409 Conflict` error.

---

## 🧹 Expiry Strategy & Background Cleanup

To keep inventory fluid, pending reservations expire automatically after 10 minutes. 

### Idempotent Expiry API
The service exposes a highly secure cleanup endpoint:
`GET /api/cron/cleanup`

#### Execution Security
* **Authentication**: Requires a bearer token in the `Authorization` header (`Authorization: Bearer <CRON_SECRET>`).
* **Environment Match**: The token must match the system's `CRON_SECRET` environment variable to block unauthorized executions.

#### Transactional Expiry Mechanics
When triggered, the background worker performs the following steps inside a database transaction:
1. Identifies all expired reservations: `status == pending` AND `expiresAt < now()`.
2. For each expired reservation:
   * Exclusively locks the corresponding `Inventory` row using `FOR UPDATE`.
   * Decrements the inventory's `reservedUnits` by the reservation's `quantity`.
   * Transitions the reservation's status to `released` and timestamps the `releasedAt` column.
3. Commits the transaction, ensuring atomic release and absolute database integrity.

> [!NOTE]
> **Vercel Deployment Cron Limitation**  
> Vercel's free-tier limits cron triggers to a daily interval and does not support minute-based intervals. For testing and demonstration purposes, we trigger the endpoint manually via Postman or direct curl requests. The cleanup architecture remains fully production-ready and can be plugged into a standard enterprise scheduler (like Vercel Pro crons or external cron triggers) instantly.

---

## 📊 Reservation State Machine

Reservations navigate a strict, one-way state progression. State transitions are protected by database constraints and service-layer validations:

```mermaid
stateDiagram-v2
    [*] --> pending : Create Reservation (validates stock & quantity > 0)
    pending --> confirmed : Confirm Purchase (sets confirmedAt, terminal state)
    pending --> released : Cancel / Expire (decrements reservedUnits, sets releasedAt, terminal state)
    confirmed --> [*]
    released --> [*]
    
    note right of confirmed
        Confirmed and Released are terminal states.
        Re-processing or releasing confirmed holds is rejected.
    end
```

---

## 🗄️ Database Schema & Models

```mermaid
erDiagram
    Product ||--o{ Inventory : "has inventory"
    Warehouse ||--o{ Inventory : "holds stock"
    Inventory ||--o{ Reservation : "has allocations"

    Product {
        string id PK
        string name
        string description
        datetime createdAt
        datetime updatedAt
    }

    Warehouse {
        string id PK
        string name
        string location
        datetime createdAt
        datetime updatedAt
    }

    Inventory {
        string id PK
        string productId FK
        string warehouseId FK
        int totalUnits
        int reservedUnits
        datetime createdAt
        datetime updatedAt
    }

    Reservation {
        string id PK
        string inventoryId FK
        int quantity
        enum status
        datetime expiresAt
        datetime confirmedAt
        datetime releasedAt
        datetime createdAt
        datetime updatedAt
    }
```

### Key Schema Design
* **Composite Constraints**: A unique composite index `@@unique([productId, warehouseId])` on `Inventory` prevents duplicate stock mappings.
* **Available Stock Formula**: Actual stock capacity is calculated on-demand to prevent data inconsistency:
  $$\text{Available Units} = \text{Total Units} - \text{Reserved Units}$$
* **Index Strategy**: High-performance indexes are placed on `Reservation.status` and `Reservation.expiresAt` columns to guarantee sub-millisecond cron filtering.

---

## 🔌 API Documentation

### 1. Products
* **`GET /api/products`**
  * **Purpose**: Retrieves all products alongside their warehouse stock levels.
  * **Success Response**: `200 OK`
    ```json
    [
      {
        "id": "e0bfa916-2d11-40be-bdcc-4623cb6028a3",
        "name": "MacBook Pro 16-inch",
        "description": "Apple M3 Max chip, 36GB RAM, 1TB SSD.",
        "inventories": [
          {
            "id": "d13e3dbd-0275-4078-a28a-82888d3d92fb",
            "warehouseName": "Seattle Logistics Hub",
            "totalUnits": 75,
            "reservedUnits": 0,
            "availableUnits": 75
          }
        ]
      }
    ]
    ```

### 2. Warehouses
* **`GET /api/warehouses`**
  * **Purpose**: Retrieves a list of all active warehouses.
  * **Success Response**: `200 OK`

### 3. Create Reservation
* **`POST /api/reservations`**
  * **Purpose**: Initiates a 10-minute temporary inventory hold.
  * **Request Body**:
    ```json
    {
      "inventoryId": "d13e3dbd-0275-4078-a28a-82888d3d92fb",
      "quantity": 3
    }
    ```
  * **Success Response**: `201 Created`
    ```json
    {
      "id": "89b706c8-525d-4560-bf6f-b2b918cc7b5d",
      "inventoryId": "d13e3dbd-0275-4078-a28a-82888d3d92fb",
      "quantity": 3,
      "status": "pending",
      "expiresAt": "2026-05-25T05:31:58.000Z"
    }
    ```
  * **Error Responses**:
    * `400 Bad Request` (Invalid input types, quantity $\le 0$).
    * `409 Conflict` (Insufficient available stock, concurrent race condition blocked).

### 4. Confirm Reservation
* **`POST /api/reservations/[id]/confirm`**
  * **Purpose**: Captures stock permanently upon payment success.
  * **Success Response**: `200 OK`
    ```json
    {
      "id": "89b706c8-525d-4560-bf6f-b2b918cc7b5d",
      "status": "confirmed",
      "confirmedAt": "2026-05-25T05:22:15.000Z"
    }
    ```
  * **Error Responses**:
    * `400 Bad Request` (Transition failed: hold already expired or released).

### 5. Release (Cancel) Reservation
* **`POST /api/reservations/[id]/release`**
  * **Purpose**: Manually cancels a reservation, returning stock to the warehouse immediately.
  * **Success Response**: `200 OK`
    ```json
    {
      "id": "89b706c8-525d-4560-bf6f-b2b918cc7b5d",
      "status": "released",
      "releasedAt": "2026-05-25T05:23:45.000Z"
    }
    ```

### 6. Background Expiry Cleanup
* **`GET /api/cron/cleanup`**
  * **Headers**: `Authorization: Bearer <CRON_SECRET>`
  * **Purpose**: Releases expired holds, decrementing parent reservation stocks.
  * **Success Response**: `200 OK`
    ```json
    {
      "cleaned": 1,
      "releasedReservationIds": ["89b706c8-525d-4560-bf6f-b2b918cc7b5d"]
    }
    ```
  * **Error Responses**:
    * `401 Unauthorized` (Invalid or missing Bearer token in headers).

---

## 💻 Frontend Client Flow

Built with a premium interface layout, the frontend guides users smoothly through checkout:
1. **Catalog View**: Displays all items alongside detailed warehouse stock indicators. If stock levels drop, the UI disables the selection automatically.
2. **Interactive Selection**: Allows users to select target warehouses and quantity levels.
3. **Cart Countdown & Visualizer**: Once reserved, the client transitions to a dedicated checkout card. It displays a real-time ticking 10-minute circular countdown visualizer.
4. **Action Confirm/Cancel**:
   * Clicking **Confirm Purchase** simulates successful payment and transitions the database reservation to the terminal `confirmed` state.
   * Clicking **Release Hold** cancels the checkout flow, instantly resetting the warehouse's available stock.
5. **Real-time Integrity Indicators**: Updates availability metrics on catalog screens whenever reservation state updates occur.

---

## 📁 Project Structure

```bash
Allo/
├── prisma/
│   ├── migrations/        # SQL migration files history
│   ├── schema.prisma      # Prisma schema modeling
│   └── seed.ts            # Seed script for initial DB populate
├── src/
│   ├── app/               # Next.js App Router Pages and Routes
│   │   ├── api/           # Back-end API endpoint controllers
│   │   ├── products/      # Product list view
│   │   └── reservation/   # Active hold checkouts
│   ├── components/        # UI components (Countdown, cards, forms)
│   ├── lib/
│   │   ├── prisma.ts      # Thread-safe database singleton
│   │   └── test-runner.ts # End-to-end concurrency test runner
│   └── server/
│       ├── services/      # Core transactional business logic
│       └── validators/    # Zod schemas for payload validation
├── docs/
│   └── screenshots/       # UI flow visualizations
├── postman/               # Postman collection for manual test runs
├── package.json           # Node configuration and dependencies
└── prisma.config.ts       # Database configuration environment mapping
```

---

## ⚙️ Local Development Setup

### Prerequisites
* **Node.js**: `v18.18.0` or higher
* **PostgreSQL**: Standard PostgreSQL instance or a serverless Neon DB cluster.

### 1. Clone & Install
```bash
git clone <repository-url>
cd Allo
npm install
```

### 2. Configure Environment variables
Create a `.env` file in the project's root folder:
```env
DATABASE_URL="postgresql://username:password@host:port/database?sslmode=require"
CRON_SECRET="8921052421"
```

### 3. Database Initialization
Verify database connectivity, trigger schema migrations, and seed initial values:
```bash
npx prisma generate
npx prisma db push
npx prisma db seed
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application interface.

---

## 🧪 Testing Protocol

The codebase includes an end-to-end integration and concurrency test runner utility that evaluates system boundaries and proves database thread safety.

### 1. Concurrency Testing
Our concurrency test suite executes the following protocol:
* Resets stock values on a target item to a controlled capacity (e.g., 12 units).
* Simultaneously triggers 5 concurrent HTTP POST requests to create reservations for 5 units each (demanding 25 units total).
* **Expected Result**: Exactly 2 requests succeed, acquiring locks sequentially. The remaining 3 requests are safely rejected with `HTTP 409 Conflict`.
* Run the automated verification script:
  ```bash
  npx tsx src/lib/test-runner.ts
  ```

### 2. Expiry Cleanup Testing
Our automated suite validates cleanup logic by backdating expiration timestamps:
* Creates a temporary hold reservation in the database.
* Accesses PostgreSQL directly to change `expiresAt` to 1 hour in the past.
* Hits the `/api/cron/cleanup` endpoint with the authorization token.
* **Expected Result**: The endpoint successfully identifies the expired reservation, updates its status to `released`, and restores the corresponding warehouse units.

### 3. Manual Testing via Postman
A pre-configured Postman collection is included under the `/postman` folder. Import the collection into your workspace, configure your environment variables, and run sequential calls to verify state-transition validation.

---

## ⛵ Deployment

### Neon PostgreSQL Serverless Setup
1. Create a serverless database instance on Neon.
2. Retrieve the pooled connection URI string and assign it to `DATABASE_URL` in the environment properties.

### Vercel Deployment Flow
1. Connect your GitHub repository to Vercel.
2. In the Vercel dashboard, populate `DATABASE_URL` and `CRON_SECRET` inside the project's **Environment Variables** panel.
3. Set the build override command inside the project settings:
   * **Build Command**: `prisma generate && next build`
4. Deploy. Vercel automatically runs client generation before bundle optimization.

---

## ⚖️ Trade-offs & Decisions

* **Pessimistic vs. Optimistic Locking**: Pessimistic locking prioritizes data correctness over absolute transaction throughput. While optimistic locking performs better under low write contention, high contention on single products causes high transaction failures. Row-level locks queue concurrent buyers deterministically, which guarantees that stock levels remain perfectly accurate.
* **Manual Expiry Trigger on Free Tier**: Because Vercel's free-tier does not support sub-hourly crons, we opted for a secure, manual-trigger approach using bearer tokens. This keeps the cleanup endpoint production-ready, allowing instant compatibility with production schedulers later.
* **Monolithic App Router Architecture**: Choosing a single modular Next.js application minimizes infrastructure overhead. We bypassed complex elements like Kafka or Redis queues, proving that robust database-level transactions can solve high-concurrency reservation scenarios cleanly and reliably.

---

## 🚀 Future Enhancements

* **Redis-Backed Idempotency Keys**: Introduce an `Idempotency-Key` header on all mutation endpoints (`POST /api/reservations`) backed by Redis to handle client retries safely without duplicate reservations.
* **Real-time WebSockets Stock Streams**: Stream stock levels to all active clients using WebSockets or Server-Sent Events (SSE) to update stock indicators instantly without requiring catalog page refreshes.
* **Observability Dashboards**: Instrument critical transaction stages with Prometheus/Grafana or Datadog metrics to log lock wait times, conflict rates, and cron durations.
* **Payment Gateways Integration**: Integrate Stripe Webhooks to bridge the reservation state machine with real-world credit card auth/capture lifecycles.
