# ResolveX — Startup Guide & Essential System Details

> **Current Status**: 🟢 Both **Frontend** and **Backend** servers are up and running!
> - **Frontend (Citizen & Staff Portal)**: [http://localhost:5173](http://localhost:5173)
> - **Backend API & Real-time Server**: [http://localhost:4000](http://localhost:4000)
> - **Healthcheck Endpoint**: [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## 1. Quick Access & Test Credentials

All demo accounts pre-seeded in the database share the password: **`Password@123`**

| Role | Email | Password | Access & Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin (Dean)** | `dean@resolvex.edu` | `Password@123` | Full administrative analytics, staff management, level-2 escalation target |
| **Admin (Registrar)** | `registrar@resolvex.edu` | `Password@123` | Administrative oversight, user accounts, system configuration |
| **Handler (Hostel)** | `handler.hostel@resolvex.edu` | `Password@123` | Manage hostel grievances, assign tasks, update investigation status |
| **Handler (IT Helpdesk)** | `handler.it@resolvex.edu` | `Password@123` | Manage IT & network issues, mark resolutions |
| **Handler (Academics)** | `handler.academics@resolvex.edu`| `Password@123` | Academic disputes, course registration & examination issues |
| **HOD (Hostel)** | `hod.hostel@resolvex.edu` | `Password@123` | Department head oversight, level-1 escalation recipient |
| **Student** | `aarav@student.resolvex.edu` | `Password@123` | File complaints, attach evidence, track real-time status |
| **Student** | `diya@student.resolvex.edu` | `Password@123` | Citizen portal, view history and notifications |

---

## 2. How to Start & Stop the Servers

### Starting the Backend
Open a terminal in the project root:
```bash
cd server
npm run dev
```
*Alternatively for production mode: `npm start`*
- The backend listens on `http://0.0.0.0:4000` (API & Socket.IO).
- It reads environment configuration from `server/.env`.
- Live reload is enabled via Node's `--watch` flag.

### Starting the Frontend
Open a second terminal in the project root:
```bash
cd client
npm run dev
```
- The Vite dev server runs at `http://localhost:5173`.
- In development, Vite automatically proxies `/api`, `/uploads`, and `/socket.io` to `http://localhost:4000`. No manual CORS configuration is required.

---

## 3. Key Features & How to Test

### 3.1 Authentication & New Features
1. **Password Login**:
   - Navigate to `http://localhost:5173/login`.
   - Enter any of the test credentials listed above (default password `Password@123`).
2. **Forgot Password / Password Reset**:
   - Go to `http://localhost:5173/forgot-password`.
   - Enter `aarav@student.resolvex.edu` and submit.
   - For security, no reset link is exposed on the webpage. The message reads: *"If that address is registered, a secure reset link has been sent."*
   - In development (`MAIL_ENABLED=false`), check the private backend terminal log for the reset link:
     `[email-dispatch] http://localhost:5173/reset-password?token=...`
   - Paste that link into your browser to set a new password.
3. **Email OTP Login (Passwordless)**:
   - Click **"Sign in with Email OTP"** on the login page or go to `http://localhost:5173/login/otp`.
   - Enter `aarav@student.resolvex.edu` and click **Send Code**.
   - Check the backend server terminal for the 6-digit code.
   - Enter the 6-digit code and click **Sign In** to log in securely.

### 3.2 Complaint Lifecycle & State Machine
The system implements a formal State Machine pattern:
```
Submitted ──▶ Assigned ──▶ Investigating ──▶ Escalated (optional) ──▶ Resolved ──▶ Closed
```
- Every transition is validated, authorized, and logged with actor timestamp in `complaint_status_history`.
- Handlers and Admins can update status, assign handlers, and record resolution notes.
- Students can track their complaints live.

### 3.3 AI Classification & Fallback Strategy
- When a student submits a grievance, the backend classifies it into one of 12 departmental categories (Academics, Hostel, IT, Infrastructure, etc.) and assigns an urgency level (`low`, `medium`, `high`, `urgent`).
- If an AI API key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) is provided in `server/.env`, ResolveX leverages LLM classification.
- If no key is set or the external service times out, ResolveX seamlessly falls back to its built-in rule-based keyword classification engine without failing the submission.

### 3.4 SLA & Automated Escalation Engine
- Automatic background worker runs hourly (configured via `ESCALATION_CRON=0 * * * *` in `server/.env`).
- **Level 1 Escalation**: Unresolved complaints inactive for 3 days escalate to the Head of Department (HOD).
- **Level 2 Escalation**: Inactive for 5 days escalate to the Dean/Director.
- To test the escalation sweep immediately on demand without waiting:
  ```bash
  cd server
  npm run escalate:once
  ```

### 3.5 Real-Time Notifications
- Built using Socket.IO.
- When complaint status updates or assignments change, events are broadcast directly to the affected user's room.
- Active sessions receive toast alerts and notification badge increments in real time without refreshing.

---

## 4. Environment Variables Reference

### Backend (`server/.env`)
| Variable | Default / Description |
| :--- | :--- |
| `PORT` | `4000` — Port on which the Express & Socket.IO server listens |
| `HOST` | `0.0.0.0` — Host interface binding |
| `CLIENT_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` — Allowed CORS origins |
| `DATABASE_URL` | `postgresql://postgres:NewPassword123@localhost:5432/resolvex` |
| `JWT_SECRET` | 32+ character random string for signing access tokens |
| `JWT_EXPIRES_IN` | `7d` |
| `MAIL_ENABLED` | `false` in development (logs emails/OTPs to console) |
| `AI_ENABLED` | `true` |
| `ANTHROPIC_API_KEY` | *(Optional)* Anthropic API key |
| `OPENAI_API_KEY` | *(Optional)* OpenAI API key fallback |
| `SLA_LEVEL1_DAYS` | `3` (Threshold for HOD escalation) |
| `SLA_LEVEL2_DAYS` | `5` (Threshold for Dean escalation) |
| `ESCALATION_IN_PROCESS` | `true` (Runs scheduler inside the API process) |

### Frontend (`client/.env`)
| Variable | Description |
| :--- | :--- |
| `VITE_API_URL` | Leave blank in dev (Vite proxies to `http://localhost:4000`) |
| `VITE_SOCKET_URL` | Leave blank in dev (proxied automatically) |
| `VITE_REALTIME` | `on` (Socket.IO enabled) |

---

## 5. Database Schema & Setup

The database schema is defined in `db/schema.sql` and seed data in `db/seed.sql`.

To initialize or reset the database:
```bash
# 1. Apply schema
psql "postgresql://postgres:password@localhost:5432/resolvex" -f db/schema.sql

# 2. Seed demo departments, users, and sample complaints
psql "postgresql://postgres:password@localhost:5432/resolvex" -f db/seed.sql
```

Key tables:
- `users`: Accounts with roles (`student`, `handler`, `admin`), password hashes, and reset tokens.
- `departments`: Campus departments with HOD assignments and category slugs.
- `complaints`: Grievance records, categories, priorities, statuses, and handler assignments.
- `complaint_status_history`: Audit trail tracking every lifecycle transition with actor and timestamp.
- `escalations`: Log of automated and manual SLA escalations.
- `auth_otps`: Secure 6-digit OTP codes (SHA-256 hashed) with expiration and replay protection.
- `notifications`: User notification queue with read/unread statuses.

---

## 6. Architecture & Tech Stack

```
ResolveX Grievance Management System
│
├── client/ (Vite + React 19 + Tailwind CSS 4)
│   ├── src/pages/           -> Citizen, Handler, and Admin dashboards
│   ├── src/context/         -> Auth, Socket.IO, Theme, and Toast state
│   ├── src/components/      -> Protected routes, status badges, navbar
│   └── src/api/             -> Axios HTTP client & endpoint bindings
│
├── server/ (Node.js 20+ / Express 5)
│   ├── src/controllers/     -> Auth, Complaints, Departments, Analytics
│   ├── src/domain/          -> State pattern, business errors, validation
│   ├── src/services/        -> AI classifier, escalation chain, mailer
│   ├── src/repositories/    -> PostgreSQL queries via node-postgres (pg)
│   ├── src/realtime/        -> Socket.IO authenticated rooms
│   └── src/events/          -> Observer pattern event bus
│
└── db/
    ├── schema.sql           -> PostgreSQL DDL definitions & constraints
    └── seed.sql             -> Demo accounts, departments, and seed data
```
