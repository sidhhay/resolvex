# ResolveX — REST API Reference

This reference summarizes the routes mounted by the Express application. The API is mounted under `/api`; examples below use that prefix.

## 1. Conventions

- **Base path:** `/api`
- **Payload format:** JSON, except complaint creation when an attachment is uploaded (multipart form data).
- **Authentication:** Protected routes require a valid authenticated session/token as configured by the client and server.
- **Authorization:** Some endpoints additionally require staff or administrator privileges.
- **Validation:** Request bodies, query parameters and path IDs are validated by route middleware.
- **Pagination:** List endpoints use `page` and `pageSize` where documented below.

The exact response fields and error envelope are implemented by the controllers and middleware. This document avoids promising response fields that are not part of the route contract.

## 2. Health

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Returns API health and process uptime |

## 3. Authentication — `/api/auth`

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/register` | Public, rate-limited | Request account registration |
| POST | `/register/verify` | Public, rate-limited | Verify registration email code |
| POST | `/login` | Public, rate-limited | Authenticate with email and password |
| GET | `/me` | Authenticated | Retrieve current user information |
| POST | `/forgot-password` | Public, rate-limited | Request password-reset flow |
| POST | `/forgot-password/verify` | Public, rate-limited | Verify reset code and set a new password |
| POST | `/reset-password` | Public | Reset password using a reset token |
| POST | `/otp/request` | Public, rate-limited | Request email OTP login |
| POST | `/otp/verify` | Public, rate-limited | Verify OTP and authenticate |
| POST | `/users` | Admin | Provision a staff account |

### Registration example

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "name": "Aarav Sharma",
  "email": "aarav@example.edu",
  "password": "ExamplePass123"
}
```

Registration requires a name, valid email and password of at least eight characters containing a letter and a digit. The registration flow includes email-code verification.

### Login example

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "aarav@example.edu",
  "password": "ExamplePass123"
}
```

Do not use demo credentials in production.

## 4. Complaints — `/api/complaints`

All complaint routes require authentication.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/` | Authenticated; results scoped by permissions | List/filter complaints |
| GET | `/meta` | Authenticated | Retrieve complaint metadata used by the client |
| POST | `/` | Authenticated, write-rate-limited | Create a complaint; supports attachment upload |
| GET | `/:id` | Authenticated; ownership/role rules apply | Retrieve complaint details |
| GET | `/:id/timeline` | Authenticated; ownership/role rules apply | Retrieve complaint status timeline |
| POST | `/:id/transitions` | Authenticated, write-rate-limited | Request a lifecycle transition |

### Complaint list query parameters

Supported filters include:

- `status` — one or more valid complaint statuses.
- `category`, `priority`, `search`.
- `departmentId`, `assignedTo`, `createdBy`.
- `mine`, `openOnly`, `unassignedOnly`, `escalatedOnly`.
- `from`, `to` date filters.
- `page`, `pageSize` (maximum page size: 100).
- `sort` — `created_at`, `updated_at`, `last_activity_at`, `priority` or `status`.
- `order` — `asc` or `desc`.

### Create complaint example

```http
POST /api/complaints
Content-Type: multipart/form-data
```

Fields:

- `title` — required, 5–200 characters.
- `description` — required, 20–5000 characters.
- Attachment — optional, processed by the upload middleware.

### Lifecycle transition example

```http
POST /api/complaints/123/transitions
Content-Type: application/json
```

```json
{
  "to": "Investigating",
  "reason": "Investigation started"
}
```

Optional transition fields include `assignedTo`, `departmentId`, `resolutionNote`, `closureNote` and `reason`. The domain state machine decides whether the requested transition is legal for the current actor and complaint state. A syntactically valid request can still be rejected when the transition is not permitted.

## 5. Departments — `/api/departments`

All routes require authentication.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/` | Authenticated | List departments |
| GET | `/:id/handlers` | Staff | List handlers for a department |

## 6. Notifications — `/api/notifications`

All routes require authentication.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/` | Authenticated | List current user's notifications |
| POST | `/read-all` | Authenticated | Mark all notifications as read |
| PATCH | `/:id/read` | Authenticated | Mark one notification as read |

Query parameters for listing:

- `limit` — 1–100, default 30.
- `unreadOnly` — boolean, default false.

## 7. Analytics — `/api/analytics`

All analytics routes require authentication and administrator authorization.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/overview` | Admin | Retrieve dashboard metrics |
| GET | `/escalations` | Admin | List escalation records |
| POST | `/escalations/run` | Admin, rate-limited | Trigger an escalation sweep manually |

Overview query parameters include `departmentId`, `from`, `to` and `days` (1–365; default 30).

Escalation list query parameters include `level` (1–2), `departmentId`, `page` and `pageSize` (maximum 100).

## 8. Error handling and security notes

- Use valid input types and respect the documented field constraints.
- Authentication and authorization are enforced server-side; hiding a UI control is not an authorization boundary.
- Auth, signup, OTP, password-reset and write operations have rate limits.
- Complaint transitions are validated by the domain state machine.
- Do not expose passwords, JWT secrets, OTPs, reset tokens, SMTP credentials or provider API keys in logs or client code.
- Use HTTPS in production.
- Treat the API implementation as the source of truth if this reference and the current route code differ.

## 9. Related source files

- `server/src/routes/index.js`
- `server/src/routes/authRoutes.js`
- `server/src/routes/complaintRoutes.js`
- `server/src/routes/departmentRoutes.js`
- `server/src/routes/notificationRoutes.js`
- `server/src/routes/analyticsRoutes.js`
