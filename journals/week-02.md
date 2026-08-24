# ResolveX — Use Case Diagram Report

## 1. Introduction

The Use Case Diagram represents the interaction between users, external systems, and the ResolveX grievance management platform. It defines the major functionalities involved in complaint submission, processing, escalation, and resolution.

---

## 2. Actors

### Complainant
Responsible for raising and tracking grievances.

Functions:
- Register/Login
- Submit complaints
- Add evidence/comments
- Track complaint status
- Review resolution
- Receive notifications

### Department Handler
Responsible for investigating and resolving assigned complaints.

Functions:
- View assigned complaints
- Investigate complaints
- Update status
- Resolve complaints

### Escalation Admin
Responsible for complaint monitoring and escalation management.

Functions:
- Monitor SLA deadlines
- Handle SLA breaches
- Escalate and reassign complaints
- Manage users/departments
- View analytics

### External Systems

**Authentication System**
- User verification and access control

**AI Classification System**
- Complaint classification
- Priority detection
- Department routing

**Notification Service**
- Sends status updates, alerts, and escalation notifications

---

## 3. Major Use Case Modules

### Authentication
Provides secure user access.
login includes authenticate user

---

### Complaint Submission
Handles complaint creation and validation.

Main functions:
- Submit Complaint
- Validate Complaint
- Add Comment/Evidence

---

### AI Classification
Automatically categorizes and routes complaints.

Flow:
Complaint
↓
AI Classification
↓
Department Assignment

---

### Tracking & Investigation

Allows users and handlers to monitor and process complaints.

Functions:
- Track complaint status
- View complaint details
- Investigate complaints
- Update status

---

### Resolution

Manages final complaint handling.

Functions:
- Resolve Complaint
- Review Resolution
- Confirm/Reject Resolution
- Send Resolution Notification

---

### SLA & Escalation

Ensures complaints are resolved within defined time limits.

Functions:
- Monitor SLA
- Detect SLA breach
- Send warnings
- Escalate complaints
- Reassign complaints

Workflow:
SLA Breach
↓
Escalation
↓
Admin Action

---

### Administration & Analytics

Provides system management.

Functions:
- Manage users and departments
- Configure SLA rules
- View reports and analytics

---

## 4. UML Relationships

### Include Relationship

Represents mandatory functionality.

Examples:
Login → Authenticate User

Submit Complaint → Validate Complaint

### Extend Relationship

Represents optional behaviour.

Example:
Resolve Complaint → Review Resolution

---

## 5. Conclusion

The Use Case Diagram provides a high-level view of ResolveX functionality and defines the interaction between users, AI services, and system modules. It serves as the foundation for designing the database schema, API structure, and further UML diagrams.