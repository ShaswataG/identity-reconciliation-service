# Identity Reconciliation Service — Architecture & Design Documentation
 
> **Stack:** Node.js · TypeScript · Express 5 · Prisma 7 · PostgreSQL · Pino

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [High-Level Design (HLD)](#2-high-level-design-hld)
3. [Low-Level Design (LLD)](#3-low-level-design-lld)
4. [Project Structure](#4-project-structure)
5. [Database Schema & Design](#5-database-schema--design)
6. [API Reference & Endpoint Rationale](#6-api-reference--endpoint-rationale)
7. [Identity Reconciliation Algorithm](#7-identity-reconciliation-algorithm)
8. [Layered Architecture & Separation of Concerns](#8-layered-architecture--separation-of-concerns)
9. [Middleware Pipeline](#9-middleware-pipeline)
10. [Logging Strategy](#10-logging-strategy)
11. [Error Handling](#11-error-handling)
12. [Prisma 7 & Database Layer Decisions](#12-prisma-7--database-layer-decisions)
13. [TypeScript Configuration](#13-typescript-configuration)
14. [Dependency Map](#14-dependency-map)
15. [Extensibility & Future-Proofing](#15-extensibility--future-proofing)

---

## 1. Problem Statement

FluxKart.com integrates Bitespeed to give customers a personalised experience. A customer like Dr. Emmett Brown might place orders using different emails and phone numbers across sessions. The service must **link these fragmented contact records** into a unified identity cluster — with a single `primary` contact and any number of `secondary` contacts pointing back to it.

Core challenges:

- A new request may match **one or more existing contact clusters** — potentially merging them.
- The oldest contact (by `createdAt`) in any merged group must always be `primary`.
- A previously `primary` contact may be **demoted to secondary** when clusters are joined.
- All database operations affecting a cluster must be **atomic**.

---

## 2. High-Level Design (HLD)

```
┌─────────────────────────────────────────────────────────┐
│                     Client / Evaluator                  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP POST
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Express 5 Application                  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Middleware Pipeline                │    │
│  │  requestLogger → requestId → JSON parser →      │    │
│  │  responseFormatter → [route handler]            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Route Layer                         │   │
│  │   /identify          (task spec compatibility)   │   │
│  │   /api/contact/identify  (production structure)  │   │
│  │   /api/health            (health check)          │   │
│  │   /api-docs              (Swagger UI)            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Contact Module                      │   │
│  │  Controller → Service → Repository               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │   Global Error Handler (errorHandler middleware) │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │ Prisma 7 (driver adapter: pg)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    PostgreSQL                            │
│  (Supabase / Neon / Aiven / any managed provider)       │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Properties

| Property | Decision |
|---|---|
| Framework | Express 5 — stable async error propagation, no `next(err)` wrappers needed |
| ORM | Prisma 7 with `prisma-client` generator, custom output to `src/generated/prisma` |
| DB driver | `@prisma/adapter-pg` — native `pg` pool, no Prisma binary engine overhead |
| Logging | Pino (structured JSON) — multistream to stdout + rolling file |
| Validation | `express-validator` chains, centralised `validateRequest` middleware |
| API docs | `swagger-jsdoc` + `swagger-ui-express` — JSDoc-driven, zero schema drift |
| TypeScript | Strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Module type | ESM (`"type": "module"`) with `nodenext` resolution |

---

## 3. Low-Level Design (LLD)

### Request Lifecycle

```
POST /identify  (or /api/contact/identify)
        │
        ├─► requestLogger          — logs method + URL; attaches finish listener for duration/status
        ├─► requestId              — injects/propagates x-request-id header (UUID v4)
        ├─► express.json()         — parses JSON body
        ├─► responseFormatter      — attaches res.success() and res.error() helpers
        ├─► contactIdentifyValidator[] — express-validator chain
        ├─► validateRequest        — aggregates validation errors; short-circuits with 400 if invalid
        ├─► identifyContactController
        │       └─► ContactService.identifyContact()
        │               └─► prisma.$transaction(async (tx) => {
        │                       repo = new ContactRepository(tx)
        │                       ... reconciliation algorithm ...
        │                   })
        └─► res.status(200).json(result)
```

### Component Interaction Diagram

```
┌───────────────────┐
│  contact.routes   │  Defines Express routes, attaches validator + validateRequest
└────────┬──────────┘
         │ calls
         ▼
┌───────────────────┐
│contact.controller │  Thin HTTP adapter — instantiates service, calls identifyContact, returns JSON
└────────┬──────────┘
         │ delegates
         ▼
┌───────────────────┐
│ contact.service   │  Owns all business logic. Runs entirely inside a Prisma transaction.
└────────┬──────────┘
         │ uses
         ▼
┌───────────────────┐
│contact.repository │  Pure data access. Accepts any Prisma transaction client (typed as `any`
│                   │  to support both PrismaClient and Prisma.TransactionClient interchangeably).
└────────┬──────────┘
         │ queries
         ▼
┌───────────────────┐
│   PostgreSQL DB   │
└───────────────────┘
```

---

## 4. Project Structure

```
identity-reconciliation-service/
│
├── prisma/
│   ├── schema.prisma              # Prisma 7 schema — no url in datasource (handled by config)
│   └── migrations/                # Migration history
│
├── prisma.config.ts               # Prisma 7 config file — injects DATABASE_URL for CLI ops
│
├── src/
│   ├── app.ts                     # Express app factory — middleware, routes, swagger, error handler
│   ├── server.ts                  # Entry point — binds to PORT
│   │
│   ├── config/
│   │   └── swagger.ts             # swagger-jsdoc options + setupSwagger() helper
│   │
│   ├── core/
│   │   ├── logger/
│   │   │   └── logger.ts          # Pino instance — multistream: stdout + logs/app.log
│   │   └── middleware/
│   │       ├── errorHandler.ts    # Global Express error handler (4-arg)
│   │       ├── requestId.ts       # x-request-id injection/propagation
│   │       ├── requestLogger.ts   # Structured request/response logging
│   │       ├── responseFormatter.ts # Attaches res.success() / res.error() to Response
│   │       └── validateRequest.ts # express-validator result checker
│   │
│   ├── docs/
│   │   └── components.ts          # OpenAPI component schemas (JSDoc only)
│   │
│   ├── generated/
│   │   └── prisma/                # Auto-generated Prisma client (gitignored)
│   │       └── client.js          # Main Prisma client entrypoint
│   │
│   ├── lib/
│   │   └── prisma.ts              # Singleton PrismaClient using PrismaPg adapter
│   │
│   ├── modules/
│   │   └── contact/
│   │       ├── contact.controller.ts
│   │       ├── contact.repository.ts
│   │       ├── contact.routes.ts
│   │       ├── contact.service.ts
│   │       ├── contact.validator.ts
│   │       └── dtos/
│   │           ├── contact-cluster.dto.ts
│   │           └── identify-contact-response.dto.ts
│   │
│   └── routes/
│       └── index.ts               # /api sub-router — mounts /contact => contact.routes
│
├── logs/                          # Runtime log files (gitignored)
├── package.json                   # ESM package, tsx dev runner, tsc build
└── tsconfig.json                  # Strict TypeScript, nodenext resolution
```

### Design Decision: Why `src/generated/prisma` (not default)?

Prisma 7's generator block explicitly sets `output = "../src/generated/prisma"`. This keeps generated client code:

- **co-located with source** — visible in the IDE, importable with relative paths
- **gitignored** — regenerated on `prisma generate`, no stale artifacts committed
- **decoupled from node_modules** — avoids Prisma 7's breaking change that removed the auto-export from `@prisma/client`

---

## 5. Database Schema & Design

### Prisma Schema

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  // No `url` field — Prisma 7 requirement.
  // URL is supplied exclusively via prisma.config.ts at CLI time
  // and via PrismaPg adapter at runtime.
}

model Contact {
  id             Int       @id @default(autoincrement())
  email          String?
  phoneNumber    String?
  linkedId       Int?
  linkPrecedence String    // "primary" | "secondary"
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?
}
```

### Why `deletedAt` instead of hard deletes?

Soft-delete (`deletedAt`) allows historical data preservation for audit, debugging, and future analytics. All repository queries filter `deletedAt: null`, ensuring soft-deleted records are invisible to business logic while remaining recoverable.

### Field Design Rationale

| Field | Type | Notes |
|---|---|---|
| `id` | `Int` (autoincrement) | Simpler than UUID for a contact graph; join-friendly |
| `email` / `phoneNumber` | `String?` | Both optional — at least one required at application level |
| `linkedId` | `Int?` | Self-referencing FK: secondary contacts point to their primary |
| `linkPrecedence` | `String` | Enum-like: `"primary"` or `"secondary"`. String chosen for simplicity over a DB enum |
| `createdAt` | `DateTime @default(now())` | Timestamp used as tiebreaker when resolving which contact becomes primary |
| `updatedAt` | `DateTime @updatedAt` | Auto-managed by Prisma — records when a secondary demotion occurred |
| `deletedAt` | `DateTime?` | Soft delete — null means active |

### Recommended Indexes (for production scale)

```sql
CREATE INDEX idx_contact_email ON "Contact"(email) WHERE "deletedAt" IS NULL;
CREATE INDEX idx_contact_phone ON "Contact"("phoneNumber") WHERE "deletedAt" IS NULL;
CREATE INDEX idx_contact_linked_id ON "Contact"("linkedId") WHERE "deletedAt" IS NULL;
```

These are partial indexes — they skip soft-deleted rows at the index level, making lookup queries significantly faster at scale.

---

## 6. API Reference & Endpoint Rationale

### ⚠️ Why Two `/identify` Endpoints Exist

This is an intentional dual-route configuration, not a bug or oversight.

**The Bitespeed task specification** mandates that the endpoint lives at exactly:

```
POST /identify
```

To satisfy evaluator requirements, this route is mounted directly via `contactRouter` on the root `"/"` in `app.ts`:

```typescript
app.use("/", contactRouter);  // makes POST /identify reachable
```

**In a real production system**, this flat structure is undesirable. RESTful conventions, API versioning, and operational clarity call for namespaced routes. The preferred production path is:

```
POST /api/contact/identify
```

This is available via the standard `apiRouter` mounted at `/api`, which itself mounts `contactRouter` at `/contact`. Both routes are backed by the **identical controller, service, and validation logic** — there is zero duplication of business logic.

```
/identify              ← spec-compliant (evaluator-facing)
/api/contact/identify  ← production-preferred (namespaced, versioning-ready)
```

**Recommendation for production:** Remove the `app.use("/", contactRouter)` line and rely solely on `/api/contact/identify`. The `/identify` alias exists only for task submission compatibility.

---

### Endpoints

#### `POST /identify`

> Alias for `/api/contact/identify`. Exists for Bitespeed evaluator compatibility.

#### `POST /api/contact/identify`

Identify or reconcile a contact cluster based on email and/or phone number.

**Request Body**

```json
{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "123456"
}
```

- At least one of `email` or `phoneNumber` must be present (enforced by validator)
- Both are optional individually but mutually at-least-one-required
- `null` values are accepted (treated as absent)

**Response — 200 OK**

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

> Note: `primaryContatctId` preserves the typo from the original Bitespeed spec intentionally — the DTO field name matches the spec exactly to ensure evaluator compatibility.

**Response — 400 Bad Request**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "location": "body"
    }
  ]
}
```

---

#### `GET /api/health`

Lightweight liveness probe. Returns immediately without any DB query — suitable for load balancer health checks.

**Response — 200 OK**

```json
{
  "success": true,
  "message": "OK"
}
```

**Design note:** This endpoint intentionally bypasses the response formatter — it uses a raw `res.json()` call. This makes it maximally fast and immune to any middleware failures that might otherwise block health reporting.

---

#### `GET /api-docs`

Swagger UI. Serves interactive OpenAPI 3.0 documentation auto-generated from JSDoc annotations in `src/modules/contact/contact.routes.ts` and `src/docs/components.ts`.

---

## 7. Identity Reconciliation Algorithm

This is the core of the service. The algorithm runs entirely within a **single Prisma transaction** (`prisma.$transaction`) to guarantee atomicity.

### Step-by-Step

```
INPUT: { email?, phoneNumber? }

STEP 1 — Find matches
  repo.findByEmailOrPhone(email, phoneNumber)
  → Returns all non-deleted contacts where email OR phoneNumber matches input.

STEP 2 — Handle zero matches
  → Create a new primary contact.
  → Return immediately.

STEP 3 — Resolve primary IDs from matches
  For each match:
    if secondary → collect its linkedId (the primary it points to)
    if primary   → collect its own id
  This gives us a set of "cluster root" IDs.

STEP 4 — Hydrate missing primaries
  Some primary contacts may not have appeared in the initial OR query
  (they share no email/phone with the request, but are linked to a match).
  Fetch them separately by ID and merge into the working set.

STEP 5 — Sort by createdAt ASC, elect winner
  sorted = all_contacts.sort(by createdAt ASC)
  primary = sorted[0]  ← oldest contact across all matched clusters

STEP 6 — Demote losers
  For each contact in sorted[1..N]:
    if linkPrecedence === "primary":
      update → { linkedId: primary.id, linkPrecedence: "secondary" }
      also re-parent all secondaries that previously pointed to this demoted primary
      → their linkedId is updated to primary.id

STEP 7 — Create new secondaries for novel data
  Fetch the full cluster under primary.id.
  If incoming email is not in any cluster member → create secondary with that email.
  If incoming phoneNumber is not in any cluster member → create secondary with that phone.
  This ensures new information is always captured.

STEP 8 — Build response
  Re-fetch full cluster under primary.id.
  Collect unique emails (primary's email first), unique phoneNumbers (primary's first),
  and all secondary IDs.
  Return IdentifyContactResponseDto.
```

### Edge Cases Handled

| Scenario | Behaviour |
|---|---|
| Both email and phone are brand new | Creates single primary contact |
| Email matches existing, phone is new | Creates secondary with new phone |
| Phone matches existing, email is new | Creates secondary with new email |
| Both match the same contact | No-op — returns existing cluster |
| Request links two previously unrelated primaries | Older primary wins; newer demoted to secondary; its former secondaries re-parented |
| Orphaned secondaries (linkedId points to demoted primary) | Re-parented to new primary in Step 6 |
| Exact duplicate request (all info already exists) | Idempotent — cluster refetched, response returned, nothing written |

### Transaction Boundary

The entire algorithm (Steps 1–8) runs in a single `prisma.$transaction`. This means:

- **No partial writes** — a failure at any step rolls back all changes
- The `ContactRepository` constructor accepts any client (`any` typed internally) — it works equally with `PrismaClient` and `Prisma.TransactionClient`
- Race conditions between concurrent requests on overlapping contacts are serialised by PostgreSQL's row-level locking within the transaction

---

## 8. Layered Architecture & Separation of Concerns

### Layer Responsibilities

```
┌──────────────────────────────────────────────────────────┐
│  Routes (contact.routes.ts)                              │
│  • Declares HTTP method + path                           │
│  • Attaches validation chain + validateRequest           │
│  • Calls controller function                             │
│  • Hosts OpenAPI JSDoc annotations                       │
└──────────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────────┐
│  Controller (contact.controller.ts)                      │
│  • Thin HTTP adapter — no business logic                 │
│  • Instantiates ContactService with prisma singleton     │
│  • Returns res.status(200).json(result) directly         │
│  • Note: bypasses res.success() wrapper to match spec    │
│    (spec expects raw { contact: {...} }, not enveloped)  │
└──────────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────────┐
│  Service (contact.service.ts)                            │
│  • All business logic lives here                         │
│  • Opens transaction via prisma.$transaction()           │
│  • Delegates data access to ContactRepository            │
│  • Returns typed IdentifyContactResponseDto              │
└──────────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────────┐
│  Repository (contact.repository.ts)                      │
│  • Pure data access layer — zero business logic          │
│  • Methods: findByEmailOrPhone, create, update,          │
│    findById, findByIds, findClusterByPrimary,            │
│    findSecondariesByLinkedId                             │
│  • All queries filter deletedAt: null                    │
└──────────────────────────────────────────────────────────┘
```

### Why the Controller Doesn't Use `res.success()`

The `responseFormatter` middleware adds `res.success()` which wraps responses in:

```json
{ "success": true, "message": "OK", "data": { ... } }
```

The Bitespeed evaluator expects the raw format:

```json
{ "contact": { "primaryContatctId": ..., ... } }
```

The controller explicitly uses `res.status(200).json(result)` to emit the spec-compliant payload. The `res.success()` helper remains available for any future non-spec endpoints where the envelope is appropriate.

---

## 9. Middleware Pipeline

Middleware is registered in `app.ts` in explicit order. Order matters.

```typescript
app.use(requestLogger);     // 1. Log incoming request immediately
app.use(requestId);         // 2. Inject/propagate x-request-id
app.use(express.json());    // 3. Parse JSON body
app.use(responseFormatter); // 4. Attach res.success / res.error helpers
setupSwagger(app);          // 5. Mount /api-docs before routes
app.use("/", contactRouter);           // 6. Root-mounted routes (spec compat)
app.use("/api/health", healthHandler); // 7. Health check
app.use("/api", apiRouter);            // 8. Production-structured routes
app.use(errorHandler);      // 9. MUST be last — catches errors from all above
```

### `requestLogger`

Logs `{ method, url }` on arrival. Attaches a `finish` listener on the response to log `{ method, url, statusCode, duration }` when the response is sent. Avoids double-logging — request in, response out.

### `requestId`

Reads `x-request-id` from incoming headers (for upstream propagation) or generates a `randomUUID()`. Sets it on both `req.headers` and the response header. This correlates all log entries for a single request.

### `responseFormatter`

Augments the `Response` object with two typed helpers:

```typescript
res.success(data, message?)  → 200 { success: true, message, data }
res.error(message, status?, errors?) → { success: false, message, errors }
```

Declared via module augmentation (`declare global { namespace Express { interface Response {...} } }`).

### `validateRequest`

Runs after `express-validator` chains. If `validationResult(req)` is non-empty, calls `res.error("Validation failed", 400, formatted)` and short-circuits. Only field-type errors are returned — body-level custom errors are included.

### `errorHandler`

Standard Express 4-argument error handler `(err, req, res, next)`. Catches unhandled errors from any route/middleware. Logs the full error with `requestId` context. Maps `err.status` to HTTP status (defaults 500). Exposes clean `{ success: false, error: { message, code } }` to clients — never leaks stack traces.

---

## 10. Logging Strategy

### Implementation

```
Pino logger (pino@10)
  ├── stdout stream       ← structured JSON, consumed by process supervisor / container runtime
  └── file stream         ← logs/app.log (local disk, rotating manually or via logrotate)
```

### Log Format

Every log line is a JSON object:

```json
{
  "level": 30,
  "time": "2024-01-15T10:23:45.123Z",
  "method": "POST",
  "url": "/identify",
  "statusCode": 200,
  "duration": 42
}
```

`pid` and `hostname` are suppressed (`base: { pid: false, hostname: false }`) — these are injected by the container orchestrator (Kubernetes, Render, etc.) at a higher level.

### Log Directory Bootstrap

The logger checks for the `logs/` directory at startup and creates it if absent (`fs.mkdirSync`). This prevents silent failures in fresh environments.

### Log Level

Controlled by `LOG_LEVEL` environment variable. Defaults to `"info"`. Set to `"debug"` for verbose query/middleware tracing during development.

### Future: Centralised Log Shipping

Because logs are emitted as structured JSON, shipping to Grafana Loki, Datadog, or CloudWatch requires only adding a transport to the Pino multistream — **zero changes to any log call sites**.

---

## 11. Error Handling

### Two-Tier Strategy

**Tier 1 — Validation errors (400)**

Handled synchronously by `validateRequest` middleware before the controller is reached. Returns field-level details to the client.

**Tier 2 — Runtime errors (4xx/5xx)**

Any exception thrown inside a controller, service, or repository propagates up to Express's error handling pipeline. Express 5's native async support means `async` route handlers automatically forward thrown errors — no `try/catch → next(err)` boilerplate needed.

The `errorHandler` middleware intercepts all of these.

### Custom Error Convention

Errors thrown from service/repository layers can carry a `status` property:

```typescript
const err = new Error("Contact not found");
(err as any).status = 404;
throw err;
```

The `errorHandler` reads `err.status` and uses it as the HTTP response code.

### Error Response Shape

```json
{
  "success": false,
  "error": {
    "message": "Human-readable description",
    "code": "INTERNAL_SERVER_ERROR"
  }
}
```

Stack traces are logged server-side but never included in the response body.

---

## 12. Prisma 7 & Database Layer Decisions

### Prisma 7 Breaking Changes Accommodated

**1. Datasource URL removed from schema**

Prisma 7 no longer accepts `url = env("DATABASE_URL")` directly in `schema.prisma`. The URL is now supplied via two separate mechanisms:

| Context | Mechanism |
|---|---|
| Prisma CLI (`migrate`, `generate`) | `prisma.config.ts` → `datasource.url` |
| Runtime (application) | `PrismaPg` adapter constructor receives `connectionString` |

**`prisma.config.ts`:**

```typescript
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: process.env["DATABASE_URL"]
    ? { url: process.env["DATABASE_URL"] }
    : {},
});
```

**2. Custom generator output**

```prisma
generator client {
  provider = "prisma-client"      // Prisma 7 — not "prisma-client-js"
  output   = "../src/generated/prisma"
}
```

The `prisma-client` provider is Prisma 7's new generator name. The old `prisma-client-js` is deprecated.

**3. Driver adapter: `@prisma/adapter-pg`**

Rather than Prisma's query engine binary, the service uses the driver adapter approach:

```typescript
import { PrismaPg } from "@prisma/adapter-pg";

new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
```

Benefits:
- No Prisma binary engine process — lighter memory footprint
- Uses the battle-tested `pg` library connection pool directly
- Faster cold start — important for serverless/edge deployments

### Singleton Pattern

```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

In development (tsx watch mode), module re-evaluation would create new `PrismaClient` instances on each file save, exhausting the database connection pool. The `globalThis` singleton pattern prevents this. In production, a new instance is fine since the module is only evaluated once.

### Database Provider Independence

Because Prisma uses the standard `pg` driver under the hood, the **only change** needed to switch database providers (Supabase → Neon → Aiven → self-hosted) is the `DATABASE_URL` environment variable. All application code, queries, and migrations remain unchanged.

---

## 13. TypeScript Configuration

The project uses a deliberately strict `tsconfig.json`. Key decisions:

| Option | Value | Reason |
|---|---|---|
| `module` | `nodenext` | Full ESM support with `import.meta`, correct `.js` extension resolution |
| `moduleResolution` | `nodenext` | Required companion to `nodenext` module |
| `target` | `esnext` | No downcompilation — Node.js 20+ runs ESNext natively |
| `strict` | `true` | Enables the full strict suite (`strictNullChecks`, `noImplicitAny`, etc.) |
| `noUncheckedIndexedAccess` | `true` | Array/object index access returns `T \| undefined` — forces null guards |
| `exactOptionalPropertyTypes` | `true` | `{ x?: string }` accepts `string` but not `undefined` explicitly |
| `verbatimModuleSyntax` | `true` | `import type` required for type-only imports — no dead imports in output |
| `isolatedModules` | `true` | Each file is independently compilable — required for tsx/esbuild |

### ESM + nodenext Impact on Imports

With `nodenext` module resolution, all relative imports **must include the `.js` extension** even for `.ts` source files:

```typescript
import { ContactRepository } from "./contact.repository.js";  // ✓
import { ContactRepository } from "./contact.repository";     // ✗ — fails at runtime
```

This is a source of confusion but is correct behaviour: the `.js` refers to the compiled output file.

---

## 14. Dependency Map

### Production Dependencies

| Package | Version | Role |
|---|---|---|
| `express` | `^5.2.1` | HTTP server framework (v5 — native async error handling) |
| `express-validator` | `^7.3.1` | Declarative input validation chains |
| `@prisma/client` | `^7.4.2` | Prisma generated client base |
| `@prisma/adapter-pg` | `^7.4.2` | PostgreSQL driver adapter for Prisma 7 |
| `pg` | `^8.19.0` | PostgreSQL client (peer dep for adapter) |
| `pino` | `^10.3.1` | High-performance structured JSON logger |
| `dotenv` | `^17.3.1` | `.env` file loading |
| `swagger-jsdoc` | `^6.2.8` | JSDoc → OpenAPI 3.0 spec generation |
| `swagger-ui-express` | `^5.0.1` | Serve Swagger UI from Express |

### Development Dependencies

| Package | Version | Role |
|---|---|---|
| `typescript` | `^5.9.3` | TypeScript compiler |
| `tsx` | `^4.21.0` | Fast TypeScript execution for dev (esbuild-backed) |
| `ts-node` | `^10.9.2` | Fallback TS execution |
| `@types/express` | `^5.0.6` | Express 5 type definitions |
| `@types/node` | `^25.3.2` | Node.js type definitions |

### npm Scripts

```json
{
  "dev":   "nodemon --watch src --exec \"tsx src/server.ts\"",
  "build": "tsc",
  "start": "node dist/server.js"
}
```

`tsx` is used in dev because it's an esbuild-backed TypeScript runner — significantly faster than `ts-node` for large projects. It handles ESM natively without requiring `--loader` flags.

---

## 15. Extensibility & Future-Proofing

### Adding a New Domain Module

The architecture makes it straightforward. For example, adding an `orders` module:

1. Create `src/modules/orders/` with `orders.controller.ts`, `orders.service.ts`, `orders.repository.ts`, `orders.routes.ts`, `orders.validator.ts`
2. Add the new router to `src/routes/index.ts`:
   ```typescript
   router.use("/orders", ordersRouter);
   ```
3. Add the Prisma model to `schema.prisma` and run `prisma migrate dev`

No changes to `app.ts`, middleware, or any other module required.

### Authentication

Add a JWT/API-key middleware to `app.ts` or `routes/index.ts`:

```typescript
app.use("/api", authMiddleware, apiRouter);
```

The root `/identify` route can remain unauthenticated for external evaluator access while `/api/contact/identify` sits behind auth.

### Caching

`ContactService` can be extended to check a Redis cache before hitting the database:

```typescript
const cached = await redisClient.get(`contact:${email}:${phoneNumber}`);
if (cached) return JSON.parse(cached);
```

The repository layer's clean interface means the service remains the only place this logic lives.

### Observability

- **Distributed tracing:** Add OpenTelemetry SDK — Pino's structured logs are already trace-friendly
- **Metrics:** Expose a Prometheus `/metrics` endpoint via `prom-client`
- **Centralised logging:** Change Pino transport to ship to Grafana Loki, Datadog, or ELK — zero log call site changes

### API Versioning

When breaking changes are needed:

```typescript
router.use("/v1/contact", contactV1Router);
router.use("/v2/contact", contactV2Router);
```

The existing route structure under `/api` is already compatible with this pattern.

---

## Appendix: Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g., `postgresql://user:pass@host/db`) |
| `PORT` | No | Server port (default: `5000`) |
| `LOG_LEVEL` | No | Pino log level: `trace`, `debug`, `info`, `warn`, `error` (default: `info`) |
| `NODE_ENV` | No | `production` suppresses Prisma singleton caching on `globalThis` |
