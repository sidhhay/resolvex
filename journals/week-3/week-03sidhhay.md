# ResolveX Development Journal
# NAME-sidhhay abrol | Roll no-1024031157
## Date: 31 August 2026

### Goal
Set up the ResolveX backend and create the initial authentication structure.

### Work Completed

- Set up **PostgreSQL inside WSL**.
- Created the `resolvexx` PostgreSQL database.
- Configured **Prisma 7** with PostgreSQL.
- Created the initial `User` model and successfully ran the Prisma migration.
- Created the Prisma client connection.
- Set up the **Express.js backend** on port `5000`.
- Added **CORS** and JSON request-body middleware.
- Created the authentication module:
  - `auth.routes.js`
  - `auth.controller.js`
  - `auth.service.js`
- Created and tested the `/api/auth/login` endpoint using Postman.
- Debugged the `req.body` issue and understood the purpose of `express.json()`.
- Learned the difference between `async` and `await`.
- Configured `.gitignore` to exclude `.env`, `node_modules`, and unnecessary files.
- Created `.env.example` for safe sharing on GitHub.
- Staged the backend files for the first Git commit.

### Current Backend Flow

Request → Route → Controller → Service → Prisma → PostgreSQL

### Next Steps

- Implement user registration.
- Hash passwords using bcrypt.
- Implement actual login verification.
- Generate JWT tokens.
- Create authentication middleware.
- Connect the React login page to the backend.