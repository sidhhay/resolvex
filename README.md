# ResolveX

An AI-assisted grievance and escalation management system for institutional
accountability. Students file complaints in plain language; the system routes
them to the right department automatically, tracks every state change in an
append-only audit trail, and escalates anything that goes unanswered up the
hierarchy without anyone having to remember to chase it.

The point of the design is that **a complaint cannot quietly go nowhere**. Its
status is a state machine that only moves through legal transitions; its SLA
clock is watched by a scheduled job; every change fans out to the people
affected; and the resolution is not final until the complainant says so.

---

## Contents

- [Architecture](#architecture)
- [The four design patterns](#the-four-design-patterns)
- [Project Documentation & Diagrams](#project-documentation--diagrams)
- [Running it](#running-it)
- [Deploying](#deploying)
- [Database](#database)
- [API reference](#api-reference)
- [Configuration](#configuration)
- [Testing](#testing)
- [Design decisions worth knowing about](#design-decisions-worth-knowing-about)
- [Contributors & License](#contributors--license)

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  client/  React 19 · Vite · Tailwind 4 · Axios · Socket.IO-client       │
│                                                                        │
│   Citizen portal        Handler dashboard        Admin analytics        │
│   submit + timeline     queue + transitions      SLA · escalations      │
│                                                                        │
│   AuthContext ── SocketContext ── ProtectedRoute                        │
└───────────────┬──────────────────────────────────┬─────────────────────┘
                │ REST (JWT bearer)                │ WebSocket (same JWT)
┌───────────────▼──────────────────────────────────▼─────────────────────┐
│  server/  Node · Express 5 · Socket.IO · PostgreSQL                     │
│                                                                        │
│   routes ─▶ middleware (auth · RBAC · validate · upload · rate limit)   │
│           ─▶ controllers ─▶ services ─▶ repositories ─▶ pg Pool         │
│                                │                                       │
│                                ├── domain/complaintState.js   [STATE]  │
│                                ├── services/ai/               [STRATEGY]│
│                                ├── services/escalation/       [CHAIN]  │
│                                └── events/                    [OBSERVER]│
│                                          │                             │
│                          ┌───────────────┼───────────────┐             │
│                    Socket.IO        Nodemailer     notifications table │
└────────────────────────────────────────────────────────────────────────┘
                                       │
                        ┌──────────────┴──────────────┐
                   Anthropic / OpenAI            Cloudinary
                   (keyword fallback)         (local disk fallback)
```

Every external dependency has a fallback. No API key, no SMTP server and no
Cloudinary account are needed to run the whole system end to end.

### Layout

```
db/
  schema.sql              DDL — tables, constraints, indexes, triggers
  seed.sql                12 departments, 22 demo users, 5 sample complaints
server/
  src/
    domain/               complaintState.js (STATE), errors.js
    services/
      ai/                 classifyTicket + strategies (STRATEGY)
      escalation/         chain.js (CHAIN OF RESPONSIBILITY) + runner
      complaintService.js the transactional core; where the patterns meet
      mailer.js  uploadService.js
    events/               eventBus.js (OBSERVER) + three observers
    repositories/         SQL, one module per aggregate
    controllers/ routes/ middleware/
    realtime/socket.js    Socket.IO gateway and room scheme
    jobs/escalationCron.js standalone SLA worker
  tests/                  45 unit tests (node:test)
client/
  src/
    context/              Auth · Socket · Toast · Theme providers
    components/           ProtectedRoute, timeline, transition dialog, charts
    pages/                student/ handler/ admin/
docs/                     Architecture, requirements, and design specifications
assets/                   System diagrams (DFD Level 0-2, ER, Gantt, Use Case)
```

---

## Project Documentation & Diagrams

Complementary project artifacts are available in the repository:

- 📊 **Architecture & Diagrams**: [`assets/diagrams/`](assets/diagrams/) and [`assets/screenshots/`](assets/screenshots/) (DFD Level 0/1/2, ER diagram, Component diagram, Use Case)
- 📑 **Technical Documentation**: [`docs/`](docs/) — start with the [documentation index](docs/README.md) for architecture, requirements, database design, design patterns and the REST API reference.
- 📝 **Proposal & Weekly Journals**: [`project-proposal/`](project-proposal/) and [`journals/`](journals/)

---

## The four design patterns

Each is a load-bearing part of the system, not a label on an ordinary class.

### 1. State — `server/src/domain/complaintState.js`

```
Submitted ──▶ Assigned ──▶ Investigating ──▶ Resolved ──▶ Closed
    │            │  ▲            │              │
    │            ▼  │            │              └──▶ Investigating (reopen)
    └────────▶ Escalated ◀───────┘
```

Every status is a class that owns its outgoing edges, who may take them, and
what each one demands. Nothing else in the codebase branches on
`complaint.status`; controllers ask the state object and act on the answer.

What that buys, concretely:

- **A handler cannot close their own resolution.** `Resolved → Closed` is
  reachable only by the complainant or an administrator. This is the
  accountability guarantee the whole system exists for.
- **The complainant can reject a resolution.** `Resolved → Investigating`
  requires a reason and clears `resolved_at`, so a rejected fix stops counting
  towards SLA compliance.
- **Escalation levels can only rise.** That single guard is what makes the
  hourly sweep idempotent.
- **The UI is generated from the rules.** `availableTransitions(complaint,
  actor)` is what the dashboard's one-click buttons are built from, so the
  client can never offer a move the domain would refuse.

Enforced again at the database level: `status` is a PostgreSQL enum and CHECK
constraints assert the structural invariants (`Assigned` implies an assignee,
`Resolved` implies a resolution note).

### 2. Strategy — `server/src/services/ai/`

```
anthropic ──fails──▶ openai ──fails──▶ keyword (always succeeds)
```

`classifyTicket()` holds an ordered list of interchangeable strategies and walks
it until one succeeds. Each attempt is bounded by `AI_TIMEOUT_MS` via an
`AbortController`.

An LLM answer is *rejected* — and the chain continues — when it returns a
category outside the taxonomy, malformed JSON, a confidence below
`AI_MIN_CONFIDENCE`, or `stop_reason: "refusal"`. That last case matters here:
harassment and safety reports are exactly the content a classifier may decline,
and the keyword engine has explicit, deterministic rules for them, so the
fallback handles the hard case better than a second model would.

`classifyTicket()` **never throws**. Losing a grievance is a far worse failure
than misrouting one, so the chain terminates in a rule engine that always
answers. When it does answer after an LLM failure the result is flagged
`degraded`, which surfaces in the citizen's confirmation screen and as a
"routing engine" panel on the admin dashboard — a silent AI outage becomes
visible rather than merely showing up as worse routing.

### 3. Chain of Responsibility — `server/src/services/escalation/chain.js`

```
TerminalState ─▶ MaxLevel ─▶ RecentActivity ─▶ Level2Dean ─▶ Level1Hod ─▶ NoAction
   "closed"      "already      "inside its       "≥5 days      "≥3 days      terminal
     work"        at top"        SLA window"       idle"         idle"       default
```

Each handler answers one question and either takes responsibility or passes the
complaint on. Level 2 is evaluated **before** level 1 on purpose: a complaint
that sat idle past the five-day mark without ever being escalated (because the
job was down, say) goes straight to the Dean rather than crawling one rung per
sweep. The HOD is still notified.

The chain performs no writes — it returns a decision — which makes the policy
unit-testable with no database at all. `escalationService.js` executes the
decision inside one transaction.

Three properties make the sweep safe to run on a schedule:

| Property | How |
|---|---|
| Idempotent | `UNIQUE (complaint_id, level)` — a duplicate run rolls back |
| Bounded | `ESCALATION_BATCH_SIZE` rows per pass, served by a partial index |
| Isolated | One complaint failing does not abort the sweep |

### 4. Observer — `server/src/events/`

```
domain event ──▶ notificationObserver (blocking) ──▶ notification.created
             ├─▶ socketObserver      (async)     ◀──┘
             └─▶ emailObserver       (async)
```

The domain publishes; observers deliver. Two properties matter more than the
pattern:

- **An observer can never break a transition.** Every handler runs in its own
  try/catch. If SMTP is down the ticket still moves and the failure is logged.
- **Blocking vs non-blocking is explicit.** Writing the notification row is
  blocking, so the HTTP response cannot overtake the row it announced. Sending
  e-mail is not — nobody should wait on an SMTP handshake to see a status change.

Events are published **after** the transaction commits, so an observer can only
ever read data that actually landed.

---

## Running it

**Requirements:** Node ≥ 20.11, PostgreSQL ≥ 14.

```bash
# 1. Database
createdb resolvex
psql "postgres://localhost/resolvex" -f db/schema.sql
psql "postgres://localhost/resolvex" -f db/seed.sql

# 2. API
cd server
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm install
npm run dev                   # http://localhost:4000

# 3. Client (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

`JWT_SECRET` is required and must be at least 32 characters; generate one with
`openssl rand -hex 32`. Everything else has a working default. With no
`ANTHROPIC_API_KEY`, classification runs on the keyword engine; with
`MAIL_ENABLED=false`, e-mails are written to the log; with no Cloudinary
credentials, attachments are stored under `server/uploads/`.

### Demo accounts

Seeded by `db/seed.sql`, all with the password `Password@123`
(**development only** — never load `seed.sql` into a production database):

| Role | E-mail | Sees |
|---|---|---|
| Student | `aarav@student.resolvex.edu` | Only their own complaints |
| Student | `diya@student.resolvex.edu` | Only their own complaints |
| Handler | `handler.it@resolvex.edu` | The IT department queue |
| HOD | `hod.hostel@resolvex.edu` | Hostel queue; level-1 escalation target |
| Admin | `dean@resolvex.edu` | Everything; level-2 escalation target |

Two seeded complaints are backdated so the escalation flow is demonstrable
immediately: one 4 days idle (crosses the level-1 threshold) and one 7 days idle
(crosses level 2). Sign in as the Dean and press **Run sweep now** on the
analytics page, or:

```bash
cd server && npm run escalate:once
```

### The escalation worker in production

The API runs the sweep in-process by default, which is fine for a single
instance. Behind more than one replica, set `ESCALATION_IN_PROCESS=false` and
run the worker separately:

```bash
npm run escalate:cron     # long-running, uses ESCALATION_CRON
npm run escalate:once     # single pass — for a Kubernetes CronJob or system cron
```

---

## Deploying

**[DEPLOYMENT.md](DEPLOYMENT.md)** covers Vercel, Render, and Railway end to end.

The one thing to know before you start: **Socket.IO cannot run on Vercel.** A
Function is request-scoped, so nothing holds a websocket open. The client
handles this — set `VITE_REALTIME=off` and it refreshes on a timer instead of
live — but if instant updates matter, put `client/` on Vercel and `server/` on a
host that runs a persistent process (Render, Railway, Fly). That path needs no
code changes at all.

---

## Database

`db/schema.sql` is idempotent and can be re-applied safely.

| Table | Purpose |
|---|---|
| `departments` | Routing targets; `hod_id` is the level-1 escalation target |
| `users` | `student` / `handler` / `admin`, bcrypt hashes, department membership |
| `complaints` | The aggregate root, with the SLA clock and analytics timestamps |
| `complaint_status_history` | Append-only audit trail behind the citizen timeline |
| `escalations` | One row per level per complaint — the idempotency guard |
| `notifications` | Durable in-app notifications |

**Indexes.** `status`, `department_id` and `created_at` as specified, plus
composites for the two hot access paths (a department's queue by status; a
user's own complaints) and a **partial** index for the SLA sweep:

```sql
CREATE INDEX idx_complaints_sla_sweep ON complaints (last_activity_at)
  WHERE status NOT IN ('Resolved', 'Closed');
```

---

## API reference

All routes are under `/api`. Everything except `/auth/register` and
`/auth/login` requires `Authorization: Bearer <jwt>`.

| Method | Route | Role | Notes |
|---|---|---|---|
| `POST` | `/auth/register` | — | Students only; the role field is ignored |
| `POST` | `/auth/login` | — | Rate limited |
| `GET` | `/auth/me` | any | Rehydrates the session |
| `POST` | `/auth/users` | admin | Provisions handler/admin accounts |
| `GET` | `/complaints` | any | Scoped by role; filter, search, sort, paginate |
| `POST` | `/complaints` | any | `multipart/form-data`, optional attachment |
| `GET` | `/complaints/:id` | scoped | Complaint + timeline + escalations + available actions |
| `GET` | `/complaints/:id/timeline` | scoped | Audit trail only |
| `POST` | `/complaints/:id/transitions` | scoped | **The one lifecycle write** |
| `GET` | `/complaints/meta` | any | Statuses and the transition graph |
| `GET` | `/departments` | any | |
| `GET` | `/departments/:id/handlers` | staff | Assignment dropdown |
| `GET` | `/notifications` | any | Own only |
| `PATCH` | `/notifications/:id/read` | any | Own only |
| `POST` | `/notifications/read-all` | any | |
| `GET` | `/analytics/overview` | admin | Every chart in one round trip |
| `GET` | `/analytics/escalations` | admin | The escalation log |
| `POST` | `/analytics/escalations/run` | admin | Triggers the sweep on demand |

---

## Configuration

Full list with comments in `server/.env.example`. The ones that change behaviour
most:

| Variable | Default | Effect |
|---|---|---|
| `SLA_LEVEL1_DAYS` | `3` | Idle days before escalating to the HOD |
| `SLA_LEVEL2_DAYS` | `5` | Idle days before escalating to the Dean |
| `SLA_RESOLUTION_TARGET_DAYS` | `7` | Target behind the SLA-compliance metric |
| `ESCALATION_CRON` | `0 * * * *` | Sweep schedule |
| `AI_ENABLED` | `true` | `false` pins routing to deterministic keyword rules |
| `AI_MIN_CONFIDENCE` | `0.35` | Below this an LLM verdict is discarded |
| `AI_TIMEOUT_MS` | `8000` | Per-attempt ceiling before falling through |
| `MAIL_ENABLED` | `false` | `false` logs e-mails instead of sending them |

---

## Testing

```bash
cd server
npm test          # 45 unit tests, no database required
npm run typecheck # tsc --checkJs over the whole source tree
```

| Suite | Covers |
|---|---|
| `complaintState.test.js` | Every guard: role checks, required notes, terminal state, reopen clearing `resolved_at`, first-assignment timing, graph closure |
| `escalationChain.test.js` | Each link's decision, the level-2-before-level-1 ordering, extending the chain with a new handler |
| `classifier.test.js` | Routing accuracy, and the fallback chain under provider failure, timeout and unavailability |
| `eventBus.test.js` | Fan-out, failure isolation, blocking vs non-blocking semantics |
| `security.test.js` | Magic-byte upload sniffing, validation coercion and rejection |

---

## Contributors & License

- **Lead Developer**: Sidhhay Abrol
- **License**: MIT
