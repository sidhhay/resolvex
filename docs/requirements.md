# ResolveX — Requirements Specification

## 1. Purpose and scope

ResolveX is an institutional grievance-management system for submitting, assigning, investigating, tracking and escalating complaints. It provides role-specific workflows for students, department handlers and administrators.

This document summarizes requirements reflected in the current repository. It is not a claim that every possible institutional workflow is implemented.

## 2. Actors and responsibilities

| Actor | Responsibilities |
|---|---|
| Student | Register, authenticate, submit complaints, attach evidence, view own complaints and timeline, receive notifications, respond to requests and request reopening where permitted |
| Handler | View assigned/departments' work, acknowledge and investigate complaints, request information, record resolution and perform permitted transitions |
| Admin | Oversee complaints, manage staff accounts, review analytics and escalations, perform permitted assignment and escalation actions |

Actual authorization is enforced by backend middleware and domain transition rules, not only by frontend navigation.

## 3. Functional requirements

### FR-01 — Account registration and verification
The system shall support account registration with email verification.

### FR-02 — Authentication
The system shall support password login, current-user lookup and email OTP authentication.

### FR-03 — Password recovery
The system shall provide password-reset flows using verification codes or reset tokens.

### FR-04 — Role-based authorization
The system shall restrict protected operations according to authenticated user role and ownership/assignment rules.

### FR-05 — Complaint submission
Authenticated students shall be able to submit a complaint with a title and description and optionally attach supporting evidence.

### FR-06 — Complaint validation
The system shall validate required fields, input lengths, identifiers and supported values before processing requests.

### FR-07 — Complaint classification
The system shall classify complaint text into a supported category and priority using the configured AI strategy chain and fallback behaviour.

### FR-08 — Complaint routing and assignment
The system shall route complaints to an appropriate department and support assignment to a handler under the domain's authorization rules.

### FR-09 — Complaint tracking
The system shall allow authorized users to retrieve complaint details and a status timeline.

### FR-10 — Lifecycle management
The system shall enforce permitted complaint-state transitions and record status history.

### FR-11 — SLA monitoring and escalation
The system shall evaluate eligible complaints for escalation using the scheduled escalation process and configured policy.

### FR-12 — Reassignment and escalation review
Authorized staff shall be able to perform permitted assignment and escalation actions, with changes recorded.

### FR-13 — Notifications
The system shall create notification records and support configured in-app/realtime and email delivery channels.

### FR-14 — Analytics
The system shall provide administrator-only overview and escalation reporting endpoints.

### FR-15 — Department information
The system shall expose department information and staff handler listings to authorized users.

## 4. Non-functional requirements

| Quality attribute | Requirement |
|---|---|
| Security | Authenticate protected requests, enforce server-side authorization, validate inputs and rate-limit sensitive operations |
| Integrity | Use database constraints and transactions to protect important records and lifecycle invariants |
| Auditability | Preserve complaint status history and escalation records |
| Maintainability | Keep routes, controllers, services, domain rules and repositories separated |
| Extensibility | Allow classification strategies and notification observers to evolve independently |
| Reliability | Isolate optional provider and notification failures from core complaint persistence where designed |
| Performance | Use indexed relational queries, pagination and bounded escalation batches |
| Usability | Provide role-specific interfaces, status timelines and actionable notifications |
| Deployability | Support local development and documented deployment configurations |

## 5. Business rules

1. A complaint must satisfy validation before it is created.
2. Only authenticated and authorized actors can access protected complaint operations.
3. A requested status transition must be permitted by the domain state machine.
4. A complaint cannot be marked resolved without the required resolution note and timestamp.
5. A complaint cannot be closed without the required closure timestamp.
6. Assignment and escalation operations must preserve the audit trail.
7. AI classification assists triage; it does not replace human investigation or resolution.
8. Escalation processing must avoid duplicate events for the same complaint and escalation level.

## 6. Acceptance scenarios

| Scenario | Expected behaviour |
|---|---|
| Valid user login | User is authenticated and can access permitted resources |
| Invalid credentials | Request is rejected without exposing sensitive account information |
| Student submits valid complaint | Complaint is created and can be retrieved by its owner |
| User requests another user's restricted complaint | Access is denied unless the user's role permits it |
| Handler requests an illegal transition | Domain rules reject the transition |
| Complaint is resolved without required note | Validation/domain/database constraints reject the operation |
| Escalation sweep encounters eligible complaint | Escalation decision is persisted and relevant observers are triggered |
| Notification provider fails | Core committed complaint transition remains intact; delivery failure is logged |
| Admin requests analytics | Authorized administrator receives overview/escalation data |

## 7. Scope boundaries

- AI classification is a triage aid, not an autonomous complaint-resolution authority.
- External AI, SMTP and attachment-storage integrations depend on their configuration and availability.
- Realtime delivery depends on a hosting environment capable of supporting the configured Socket.IO connection model.
- Production readiness requires environment-specific security review, monitoring, backups, load testing and operational configuration.
