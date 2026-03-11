# simplehost-panel

`simplehost-panel` is the repository for `SHP` (`SimpleHostPanel`), the central control plane for the SimpleHost platform.

This is not a generic hosting panel clone. `SHP` is a focused multi-tenant control plane for the current stack:

- PowerDNS Authoritative
- Apache
- Podman + Quadlet
- PostgreSQL
- MariaDB
- backups
- future mail-domain and mailbox management

## Core role

`SHP` owns the platform's operator and tenant-facing control-plane behavior:

- authentication and session management
- tenant and user management
- desired-state storage
- job planning and scheduling
- audit trail
- operator UI and API
- tenant self-service UI and API

`SHP` is the authoritative source of truth for platform desired state.

## Source of truth

Recommended product database:

- `PostgreSQL`

Use the `SHP` database for:

- tenants, users, roles, and memberships
- nodes and node capabilities
- DNS zones and records
- sites, applications, deployments, and certificates
- databases and database users
- backup policies and backup runs
- jobs and audit events
- mail-domain and mailbox model objects when mail is added

Bootstrap and recovery:

- import bootstrap inventory from [`/opt/simplehost/repos/simplehost-platform-config/inventory/apps.yaml`](/opt/simplehost/repos/simplehost-platform-config/inventory/apps.yaml)
- keep YAML export or import support for audit and disaster recovery

## Phase 1 scope

The preferred first useful release of `SHP` should focus on:

- authentication
- tenants and users
- nodes
- DNS zones and records
- sites and vhosts
- certificates
- apps and deployments
- databases and database users
- jobs and audit trail
- backup visibility and controlled triggers

Mail remains part of the long-term model, but should not expand phase 1 beyond a practical MVP.

Phase 1 exclusions:

- billing
- reseller model
- file manager
- arbitrary shell console
- phpMyAdmin or pgAdmin embedding
- automatic cross-node failover orchestration

## Delivery stages

Recommended delivery sequence:

1. Stage 0: document the platform, keep YAML inventory and templates, define the resource model
2. Stage 1: deliver the minimum useful control plane for DNS, sites, certificates, apps, databases, backups, jobs, and audit
3. Stage 2: improve tenant self-service, secret rotation, restart and redeploy workflows, and richer health views
4. Stage 3: add mail execution once a backend driver decision is ready
5. Stage 4: improve `SHP` resilience, export and restore workflows, and disaster-recovery automation

## Multi-tenant model

Recommended initial roles:

- `platform_admin`
- `platform_operator`
- `tenant_owner`
- `tenant_admin`
- `tenant_readonly`

Tenant users must not be able to:

- access other tenants
- execute arbitrary host commands
- view raw platform secrets or other-tenant secrets
- alter host firewall, WireGuard, or system-wide OS settings

## Resource model

Recommended first-class objects in `SHP`:

- `Node`
- `Tenant`
- `User`
- `Membership`
- `DnsZone`
- `DnsRecord`
- `Certificate`
- `Site`
- `App`
- `Deployment`
- `DatabaseCluster`
- `Database`
- `DatabaseUser`
- `BackupPolicy`
- `BackupRun`
- `MailDomain`
- `Mailbox`
- `MailAlias`
- `Job`
- `AuditEvent`
- `SecretRef`

Key relationships:

- a `Tenant` owns one or more `DnsZone` objects
- a `Site` binds one or more hostnames to one `App`
- an `App` can reference either PostgreSQL or MariaDB
- `Jobs` are generated from desired-state changes and assigned to one or more nodes

## Control-plane flow

Recommended lifecycle:

1. Import or create resources in `SHP`.
2. Validate and normalize them in the `SHP` database.
3. Compute node-specific operations.
4. Send signed jobs to `SHM`.
5. Persist job results and audit events in `SHP`.

`SHP` plans and authorizes work. `SHM` performs local execution.

## API surface

Recommended first API groups:

- `/auth`
- `/users`
- `/tenants`
- `/nodes`
- `/zones`
- `/records`
- `/sites`
- `/certificates`
- `/apps`
- `/deployments`
- `/database-clusters`
- `/databases`
- `/backup-policies`
- `/backup-runs`
- `/mail-domains`
- `/mailboxes`
- `/jobs`
- `/audit-events`

## Mail roadmap

Mail belongs in the long-term `SHP` model, but should not block the first useful release.

Minimum mail objects:

- `MailDomain`
- `Mailbox`
- `MailAlias`
- `MailboxQuota`
- `MailboxPasswordReset`

Recommended phases:

- phase A: model and API only
- phase B: basic mailbox management
- phase C: DKIM, SPF, DMARC, quota, suspend or unsuspend domain, and usage visibility

## Security boundaries

- `SHP` handles user authentication
- support `TOTP` in the first production-ready release
- store passwords with a strong password hash
- store secrets as references in the data model and materialize them only when needed
- every meaningful control-plane action should generate an audit event

## Planned repository layout

Planned structure:

- `apps/api`: public and internal HTTP API
- `apps/web`: operator and tenant web UI
- `apps/worker`: background jobs, planners, and async control-plane tasks
- `packages/config`: runtime config loading and validation
- `packages/contracts`: shared schemas and API contracts
- `packages/database`: ORM, migrations, seed data, and persistence helpers
- `packages/testing`: test fixtures and shared test helpers
- `packages/ui`: shared UI components
- `docs`

## References

- [`/opt/simplehost/AGENTS.md`](/opt/simplehost/AGENTS.md)
- [`/opt/simplehost/repos/simplehost-manager/README.md`](/opt/simplehost/repos/simplehost-manager/README.md)
- [`/opt/simplehost/repos/simplehost-platform-config/runbooks/ARQUITECTURE.md`](/opt/simplehost/repos/simplehost-platform-config/runbooks/ARQUITECTURE.md)
- [`/opt/simplehost/repos/simplehost-platform-config/runbooks/MULTI_DOMAIN.md`](/opt/simplehost/repos/simplehost-platform-config/runbooks/MULTI_DOMAIN.md)
- [`/opt/simplehost/repos/simplehost-platform-config/runbooks/REPO_LAYOUT.md`](/opt/simplehost/repos/simplehost-platform-config/runbooks/REPO_LAYOUT.md)
