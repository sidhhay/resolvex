# ResolveX

## AI-Assisted Grievance and Escalation Management System

ResolveX is a centralized grievance management platform designed to make complaint handling transparent, trackable, and efficient.

The system enables users to submit complaints, automatically classify and route them, track their progress through a defined lifecycle, and escalate unresolved issues based on SLA violations.

---

# Problem Statement

Educational institutions and organizations often lack structured grievance management systems.

Common problems:

- Complaints get delayed or misplaced
- Users have no visibility into complaint progress
- No automated escalation mechanism exists
- Resolution accountability is unclear

ResolveX solves these problems by providing a complete complaint lifecycle management system.

---

# Key Features

## Complaint Management

- Submit complaints
- Track complaint status
- Add investigation details
- Maintain complaint history


## AI-Based Classification

- Automatically categorize complaints
- Route complaints to appropriate departments
- Improve assignment efficiency


## Escalation Management

- Monitor SLA deadlines
- Automatically escalate unresolved complaints
- Support hierarchical escalation


## Notifications

- Status change notifications
- Escalation alerts
- Resolution updates


## Analytics

- Complaint statistics
- Resolution time analysis
- Department performance tracking

---

# User Roles

## Complainant

Can:

- Register and login
- Submit complaints
- Track complaint progress
- Receive notifications


## Department Handler

Can:

- View assigned complaints
- Investigate issues
- Update complaint status
- Resolve complaints


## Escalation Admin

Can:

- Monitor SLA breaches
- Escalate complaints
- Reassign complaints
- View analytics

---

# Complaint Lifecycle

```
Submitted
    |
Assigned
    |
Investigating
    |
+-----------+
|           |
Resolved  Escalated
             |
             |
          Resolved
             |
             |
           Closed
```

---

# System Architecture

ResolveX follows a modular backend architecture.

Components:

- Frontend Application
- Authentication Module
- Complaint Management Module
- Notification Module
- AI Classification Module
- Escalation Engine
- Database Layer


---

# Design Patterns Used

## State Pattern

Used for complaint lifecycle management.

Example:

```
SubmittedState
AssignedState
InvestigatingState
ResolvedState
ClosedState
```


## Chain of Responsibility

Used for escalation flow.

Example:

```
Department Handler
        |
Department Head
        |
     Admin
```


## Observer Pattern

Used for notifications.

Example:

```
Complaint Updated
        |
 ----------------
 |      |        |
Email  SMS   Dashboard
```


## Strategy Pattern

Used for complaint classification.

Example:

```
Classification Strategy

        |
 -----------------
 |               |
Rule Based     AI Model
```

---

# Tech Stack

## Frontend

- React
- Tailwind CSS
- Axios


## Backend

- Node.js
- Express.js
- TypeScript


## Database

- PostgreSQL
- Prisma ORM


## Authentication

- JWT
- Role Based Access Control


## AI

- NLP based complaint classification

---

# Project Structure

```
ResolveX/

├── assets/
├── code/
│   ├── frontend/
│   └── backend/
│
├── docs/
├── tests/
├── docker/
└── README.md
```

---

# Development Setup

Coming soon:

1. Clone repository

```bash
git clone https://github.com/sidhhay/resolvex.git
```

2. Install dependencies

```bash
npm install
```

3. Configure environment variables

```bash
.env
```

4. Run application

```bash
npm run dev
```

---

# Future Improvements

- Advanced AI classification models
- Mobile application
- Multi-organization support
- Real-time chat between complainant and handler
- Advanced analytics dashboard

---

# Contributors

- Sidhhay Abrol

---

# License

This project is licensed under the MIT License.
