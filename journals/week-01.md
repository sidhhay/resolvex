# Week 1 Journal — ResolveX

## AI-Assisted Grievance and Escalation Management System

Week 1 focused on defining the problem domain, gathering requirements, and establishing the technical and documentation foundation for ResolveX.

---

## Problem & Requirement Analysis

Existing grievance handling systems suffer from poor tracking, delayed resolution, lack of structured escalation, and limited analytics. ResolveX addresses these challenges through AI-assisted classification, complaint routing, SLA monitoring, and escalation management.

- Actors identified:
  - **Complainant** — submits and tracks complaints
  - **Department Handler** — investigates and resolves complaints
  - **Escalation Admin** — manages SLA breaches, escalations, and analytics

- Complaint lifecycle defined:
Submitted → Assigned → Investigating → Escalated → Resolved → Closed

---

## System Design & Architecture

A modular architecture was planned to support scalability and maintainability.

The system consists of six core modules:

- Authentication
- Complaint Management
- AI Classification
- Escalation
- Notification
- Analytics

---

## Documentation & Repository

The following documentation activities were completed:

- Project proposal preparation
- Requirement analysis
- Initial system architecture planning
- Use Case Diagram creation defining:
  - Actors
  - System modules
  - External service interactions

An industry-style GitHub repository structure was created with separate directories for:

- Source code
- Documentation
- Assets
- Tests
- Journals
- Project reports

---

## Design Decisions

The following architectural and design decisions were finalized:

- **Role-Based Access Control** for managing different user permissions.
- **State Pattern** for complaint lifecycle management.
- **Chain of Responsibility Pattern** for escalation workflow.
- **Observer Pattern** for notification handling.
- **Strategy Pattern** for AI-based complaint classification.

---

## Challenges

The major challenges identified during the initial phase were:

- Defining clear system boundaries and module responsibilities.
- Mapping real-world grievance workflows into software components.
- Identifying required entities for future database design.

---

## Next Week Goals

The upcoming objectives are:

- Finalize database schema and ER diagram.
- Design API structure.
- Initialize frontend and backend applications.
- Configure database connectivity.

---

## Conclusion

Week 1 established the foundation of ResolveX through requirement analysis, system planning, UML design, and repository organization. The project is now ready to move towards database design, API planning, and implementation in the upcoming phase. 