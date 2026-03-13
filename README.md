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

## Bootstrap

This repository is bootstrapped as a `pnpm` workspace with a shared TypeScript base config.

Useful commands:

- `./scripts/bootstrap.sh`
- `./scripts/bootstrap-shp-standby.sh`
- `./scripts/install-release.sh`
- `./scripts/deploy-release.sh`
- `./scripts/configure-public-web.sh`
- `./scripts/build-release-bundle.sh`
- `./scripts/install-bundle.sh`
- `./scripts/rollback-release.sh`
- `pnpm version:set -- 2603.12.00`
- `pnpm version:today`
- `pnpm build`
- `SHP_DATABASE_URL=postgresql://... pnpm db:migrate`
- `pnpm typecheck`
- `pnpm start:api`
- `pnpm start:web`
- `pnpm start:worker`

Release version format:

- `YYMM.DD.NN`
- first stamped release: `2603.12.00`

`./scripts/configure-public-web.sh` defaults the certificate contact to `webmaster@<domain>`, for example `webmaster@pyrosa.com.do` when the host is `vps-prd.pyrosa.com.do`. It serves `SHP_DOCUMENT_ROOT` on `443`, proxies `SHP web` on `https://<host>:3200`, and proxies the local code-server on `https://<host>:8080`.

When `SHP_BOOTSTRAP_ADMIN_EMAIL` is left as `admin@example.com`, install/deploy will derive `webmaster@<domain>` from `SHP_DEFAULT_DOMAIN` or, if present, from `SHP_PUBLIC_HOSTNAME`.

Packaged runtime artifacts:

- `packaging/systemd/spanel-api.service`
- `packaging/systemd/spanel-web.service`
- `packaging/systemd/spanel-worker.service`
- `packaging/env/spanel-api.env.example`
- `packaging/env/spanel-web.env.example`
- `packaging/env/spanel-worker.env.example`
- `packaging/httpd/spanel-web-http.conf.template`
- `packaging/httpd/spanel-web-https.conf.template`
- `packaging/httpd/spanel-ssl-listen.conf`
- `packaging/postgresql/shp/conf/postgresql.shp.primary.conf`
- `packaging/postgresql/shp/conf/postgresql.shp.standby.conf`
- `packaging/postgresql/shp/conf/pg_hba.shp.conf`
- `packaging/postgresql/shp/sql/create-shp-database.sql.template`
- `packaging/rpm/simplehost-panel.spec`

Operational references:

- [`docs/FAILOVER.md`](/opt/simplehost/repos/simplehost-panel/docs/FAILOVER.md)

## Current bootstrap endpoints

The current API bootstrap now exposes a minimal control-plane loop for `SHM`:

- `GET /healthz`
- `GET /v1/meta`
- `POST /v1/auth/login`
- `GET /v1/auth/me`
- `POST /v1/auth/logout`
- `GET /v1/users`
- `POST /v1/users`
- `GET /v1/inventory/summary`
- `POST /v1/inventory/import`
- `GET /v1/inventory/export`
- `GET /v1/resources/spec`
- `PUT /v1/resources/spec`
- `GET /v1/resources/drift`
- `POST /v1/reconcile/run`
- `GET /v1/operations/overview`
- `GET /v1/nodes/health`
- `GET /v1/jobs/history`
- `GET /v1/backups/summary`
- `POST /v1/backups/runs`
- `GET /v1/control-plane/state`
- `POST /v1/zones/:zone/sync`
- `POST /v1/apps/:slug/render-proxy`
- `POST /v1/apps/:slug/reconcile`
- `POST /v1/databases/:slug/reconcile`
- `POST /v1/nodes/register`
- `POST /v1/jobs/claim`
- `POST /v1/jobs/report`

Current behavior:

- the API persists users, sessions, imported inventory, nodes, jobs, and reported results in PostgreSQL
- desired-state resources now live in PostgreSQL, including DNS records and backup policies
- the API runs versioned database migrations before serving traffic
- bootstrap admin creation can be driven by env through `SHP_BOOTSTRAP_ADMIN_*`
- operator auth uses hashed passwords plus bearer session tokens
- operator actions are role-gated through `platform_admin` and `platform_operator`
- inventory import reads `/etc/spanel/inventory.apps.yaml` by default, but runtime reconciliation now works from PostgreSQL
- bootstrap inventory can still be sourced from [`/opt/simplehost/repos/simplehost-platform-config/inventory/apps.yaml`](/opt/simplehost/repos/simplehost-platform-config/inventory/apps.yaml) and copied into `/etc/spanel/inventory.apps.yaml`
- imported inventory is normalized into tenants, nodes, zones, DNS records, apps, sites, and databases
- desired state can be exported back out as YAML for audit or recovery
- `proxy.render` for `active-passive` apps now dispatches to both `primary` and `secondary`
- API endpoints can now dispatch real `proxy.render`, `dns.sync`, `postgres.reconcile`, and `mariadb.reconcile` jobs
- the worker now performs automatic desired-state reconciliation and dispatches only when the target payload hash changes or the previous apply failed
- the web service now exposes a server-rendered operator UI with login, desired-state CRUD, drift visibility, job history, and backup visibility
- job payloads are encrypted at rest in `SHP` when `SHP_JOB_SECRET_KEY` is configured
- desired database passwords are stored encrypted at rest when supplied through `SHP`
- completed jobs are scrubbed so secret fields do not remain in `control_plane_jobs`
- node enrollment requires `SHP_BOOTSTRAP_ENROLLMENT_TOKEN`
- each enrolled node receives its own bearer token for subsequent control-plane calls
- pending and reported job state is visible through `/v1/control-plane/state`
- node registrations, job claims, and job reports are recorded in `shp_audit_events`
- operations visibility is now available for node health, job history, reconciliation runs, and backup summaries

## Source of truth

Recommended product database:

- `PostgreSQL`

Current control-plane cluster expectation:

- dedicated `postgresql-shp` cluster
- default local listener `127.0.0.1:5433`
- default database `simplehost_panel`

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

Current bootstrap implementation:

1. `SHM` registers itself through `/v1/nodes/register`.
2. `SHM` claims pending jobs through `/v1/jobs/claim`.
3. `SHM` executes allowlisted jobs locally.
4. `SHM` reports results through `/v1/jobs/report`.
5. `SHP` keeps node state, pending jobs, and reported results in PostgreSQL.

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

## Repository layout

Current scaffold:

- `apps/api`: public and internal HTTP API
- `apps/web`: operator and tenant web UI
- `apps/worker`: background jobs, planners, and async control-plane tasks
- `packaging/env`: environment file examples for packaged installs
- `packaging/systemd`: `systemd` units for packaged installs
- `packages/config`: runtime config loading and validation
- `packages/contracts`: shared schemas and API contracts
- `packages/database`: ORM, migrations, seed data, and persistence helpers
- `packages/testing`: test fixtures and shared test helpers
- `packages/ui`: shared UI components
- `docs`

Current packaged service artifacts:

- [`/opt/simplehost/repos/simplehost-panel/packaging/systemd/spanel-api.service`](/opt/simplehost/repos/simplehost-panel/packaging/systemd/spanel-api.service)
- [`/opt/simplehost/repos/simplehost-panel/packaging/env/spanel-api.env.example`](/opt/simplehost/repos/simplehost-panel/packaging/env/spanel-api.env.example)

## References

- [`/opt/simplehost/AGENTS.md`](/opt/simplehost/AGENTS.md)
- [`/opt/simplehost/repos/simplehost-manager/README.md`](/opt/simplehost/repos/simplehost-manager/README.md)
- [`/opt/simplehost/repos/simplehost-platform-config/docs/ARQUITECTURE.md`](/opt/simplehost/repos/simplehost-platform-config/docs/ARQUITECTURE.md)
- [`/opt/simplehost/repos/simplehost-platform-config/docs/MULTI_DOMAIN.md`](/opt/simplehost/repos/simplehost-platform-config/docs/MULTI_DOMAIN.md)
- [`/opt/simplehost/repos/simplehost-platform-config/docs/REPO_LAYOUT.md`](/opt/simplehost/repos/simplehost-platform-config/docs/REPO_LAYOUT.md)
