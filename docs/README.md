# ResolveX Documentation

This folder contains the technical documentation for the ResolveX application.

## Documentation map

| Document | What it covers |
|---|---|
| [Architecture](architecture.md) | System context, frontend/backend boundaries, request flow, core components and deployment considerations |
| [Requirements](requirements.md) | Actors, functional requirements, quality attributes, business rules and acceptance scenarios |
| [Database Design](database-design.md) | PostgreSQL entities, relationships, integrity constraints, audit history and setup |
| [Design Patterns](design-patterns.md) | State, Strategy, Chain of Responsibility and Observer patterns as implemented in the codebase |
| [API Reference](api-documentation.md) | HTTP routes, access requirements, request examples, filters and validation notes |

## Related project resources

- [Main README](../README.md) — project overview and local quick start
- [Deployment Guide](../DEPLOYMENT.md) — deployment options and hosting constraints
- [Startup and System Details](../STARTUP_AND_SYSTEM_DETAILS.md) — local run instructions and demo walkthrough
- [Database schema](../db/schema.sql) — authoritative DDL, constraints and indexes
- [Seed data](../db/seed.sql) — development-only sample data; do not load into production
- [Assets](../assets/) — diagrams and screenshots, where present

## Source of truth

Documentation describes the current repository implementation. When implementation details change, update the corresponding document and verify route definitions, schema constraints and configuration against the code before publishing. The source files remain authoritative for exact behaviour.

## Security

Never commit real `.env` files, API keys, JWT secrets, SMTP passwords, production database URLs, private user data or production credentials. Seed accounts and shared passwords are for development only.
