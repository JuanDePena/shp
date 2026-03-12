import { createHash, randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import {
  createDispatchedJobEnvelope,
  panelGlobalRoles,
  type AppReconcileRequest,
  type AuthLoginRequest,
  type AuthLoginResponse,
  type AuthLogoutResponse,
  type AuthenticatedUserSummary,
  type ControlPlaneStateSnapshot,
  type CreateUserRequest,
  type CreateUserResponse,
  type DnsRecordPayload,
  type DnsSyncPayload,
  type DispatchedJobEnvelope,
  type InventoryImportRequest,
  type InventoryImportSummary,
  type InventoryStateSnapshot,
  type InventoryAppSummary,
  type InventoryDatabaseSummary,
  type InventoryNodeSummary,
  type InventoryZoneSummary,
  type JobClaimRequest,
  type JobClaimResponse,
  type JobDispatchResponse,
  type JobReportRequest,
  type NodeRegistrationRequest,
  type NodeRegistrationResponse,
  type PanelGlobalRole,
  type ProxyRenderPayload,
  type RegisteredNodeState,
  type ReportedJobResult,
  type DatabaseReconcileRequest,
  type TenantMembershipRole,
  type TenantMembershipSummary
} from "@simplehost/panel-contracts";

import {
  createOpaqueSessionToken,
  createPasswordHash,
  normalizeEmail,
  verifyPasswordHash,
  type StoredPasswordHash
} from "./auth.js";
import { readPlatformInventory } from "./inventory.js";
import { runPanelDatabaseMigrations } from "./migrations.js";

interface NodeRow {
  node_id: string;
  hostname: string;
  version: string;
  supported_job_kinds: unknown;
  accepted_at: Date | string;
  last_seen_at: Date | string;
}

interface JobRow {
  id: string;
  desired_state_version: string;
  kind: string;
  node_id: string;
  created_at: Date | string;
  payload: Record<string, unknown>;
}

interface ResultRow {
  job_id: string;
  kind: string;
  node_id: string;
  status: string;
  summary: string;
  details: Record<string, unknown> | null;
  completed_at: Date | string;
}

interface NodeCredentialRow {
  node_id: string;
  token_hash: string;
}

interface UserRow {
  user_id: string;
  email: string;
  display_name: string;
  status: string;
}

interface UserCredentialRow {
  user_id: string;
  password_hash: string;
  password_salt: string;
  password_params: StoredPasswordHash["params"];
}

interface SessionRow {
  session_id: string;
  user_id: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}

interface UserGlobalRoleRow {
  role: string;
}

interface UserMembershipRow {
  tenant_id: string;
  tenant_slug: string;
  tenant_display_name: string;
  role: string;
}

interface InventoryImportRow {
  import_id: string;
  source_path: string;
  summary: Record<string, unknown>;
  imported_at: Date | string;
}

interface InventoryNodeRow {
  node_id: string;
  hostname: string;
  public_ipv4: string;
  wireguard_address: string;
}

interface InventoryZoneRow {
  zone_name: string;
  tenant_slug: string;
  primary_node_id: string;
}

interface InventoryAppRow {
  slug: string;
  tenant_slug: string;
  zone_name: string;
  primary_node_id: string;
  canonical_domain: string;
  aliases: string[];
  backend_port: number;
  runtime_image: string;
  storage_root: string;
  mode: string;
}

interface InventoryDatabaseRow {
  app_slug: string;
  engine: "postgresql" | "mariadb";
  database_name: string;
  database_user: string;
  primary_node_id: string;
  pending_migration_to: "postgresql" | "mariadb" | null;
}

interface ZoneDispatchRow {
  zone_name: string;
  primary_node_id: string;
  public_ipv4: string;
}

interface AppDispatchRow {
  app_id: string;
  slug: string;
  primary_node_id: string;
  zone_name: string;
  canonical_domain: string;
  aliases: string[];
  storage_root: string;
}

interface DatabaseDispatchRow {
  slug: string;
  engine: "postgresql" | "mariadb";
  database_name: string;
  database_user: string;
  primary_node_id: string;
}

interface AuditEventInput {
  actorType: string;
  actorId?: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export interface PanelControlPlaneStoreOptions {
  pollIntervalMs?: number;
  bootstrapEnrollmentToken: string | null;
  sessionTtlSeconds: number;
  bootstrapAdminEmail: string | null;
  bootstrapAdminPassword: string | null;
  bootstrapAdminName: string | null;
  defaultInventoryImportPath: string;
}

export interface PanelControlPlaneStore {
  registerNode(
    request: NodeRegistrationRequest,
    presentedToken: string | null
  ): Promise<NodeRegistrationResponse>;
  claimJobs(
    request: JobClaimRequest,
    presentedToken: string | null
  ): Promise<JobClaimResponse>;
  reportJob(
    request: JobReportRequest,
    presentedToken: string | null
  ): Promise<{ accepted: true }>;
  loginUser(request: AuthLoginRequest): Promise<AuthLoginResponse>;
  getCurrentUser(presentedToken: string | null): Promise<AuthenticatedUserSummary>;
  logoutUser(presentedToken: string | null): Promise<AuthLogoutResponse>;
  createUser(
    request: CreateUserRequest,
    presentedToken: string | null
  ): Promise<CreateUserResponse>;
  listUsers(presentedToken: string | null): Promise<AuthenticatedUserSummary[]>;
  importInventory(
    request: InventoryImportRequest,
    presentedToken: string | null
  ): Promise<InventoryImportSummary>;
  getInventorySnapshot(presentedToken: string | null): Promise<InventoryStateSnapshot>;
  dispatchZoneSync(
    zoneName: string,
    presentedToken: string | null
  ): Promise<JobDispatchResponse>;
  dispatchAppReconcile(
    appSlug: string,
    request: AppReconcileRequest,
    presentedToken: string | null
  ): Promise<JobDispatchResponse>;
  dispatchDatabaseReconcile(
    appSlug: string,
    request: DatabaseReconcileRequest,
    presentedToken: string | null
  ): Promise<JobDispatchResponse>;
  getStateSnapshot(): Promise<ControlPlaneStateSnapshot>;
  close(): Promise<void>;
}

export class NodeAuthorizationError extends Error {
  constructor(message = "Node authorization failed.") {
    super(message);
    this.name = "NodeAuthorizationError";
  }
}

export class UserAuthorizationError extends Error {
  constructor(message = "User authorization failed.") {
    super(message);
    this.name = "UserAuthorizationError";
  }
}

function normalizeTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePayload(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    sanitized[key] =
      key.toLowerCase().includes("password") || key.toLowerCase().includes("secret")
        ? "[redacted]"
        : sanitizePayload(entry);
  }

  return sanitized;
}

function toDispatchedJob(row: JobRow): DispatchedJobEnvelope {
  return {
    id: row.id,
    desiredStateVersion: row.desired_state_version,
    kind: row.kind as DispatchedJobEnvelope["kind"],
    nodeId: row.node_id,
    createdAt: normalizeTimestamp(row.created_at),
    payload: sanitizePayload(row.payload) as Record<string, unknown>
  };
}

function toRegisteredNodeState(row: NodeRow): RegisteredNodeState {
  return {
    nodeId: row.node_id,
    hostname: row.hostname,
    version: row.version,
    supportedJobKinds: row.supported_job_kinds as RegisteredNodeState["supportedJobKinds"],
    acceptedAt: normalizeTimestamp(row.accepted_at),
    lastSeenAt: normalizeTimestamp(row.last_seen_at)
  };
}

function toReportedJobResult(row: ResultRow): ReportedJobResult {
  return {
    jobId: row.job_id,
    kind: row.kind as ReportedJobResult["kind"],
    nodeId: row.node_id,
    status: row.status as ReportedJobResult["status"],
    summary: row.summary,
    details: row.details ?? undefined,
    completedAt: normalizeTimestamp(row.completed_at)
  };
}

function toInventoryImportSummary(row: InventoryImportRow): InventoryImportSummary {
  return {
    importId: row.import_id,
    sourcePath: row.source_path,
    importedAt: normalizeTimestamp(row.imported_at),
    tenantCount: Number(row.summary.tenantCount ?? 0),
    nodeCount: Number(row.summary.nodeCount ?? 0),
    zoneCount: Number(row.summary.zoneCount ?? 0),
    appCount: Number(row.summary.appCount ?? 0),
    siteCount: Number(row.summary.siteCount ?? 0),
    databaseCount: Number(row.summary.databaseCount ?? 0)
  };
}

function toInventoryNodeSummary(row: InventoryNodeRow): InventoryNodeSummary {
  return {
    nodeId: row.node_id,
    hostname: row.hostname,
    publicIpv4: row.public_ipv4,
    wireguardAddress: row.wireguard_address
  };
}

function toInventoryZoneSummary(row: InventoryZoneRow): InventoryZoneSummary {
  return {
    zoneName: row.zone_name,
    tenantSlug: row.tenant_slug,
    primaryNodeId: row.primary_node_id
  };
}

function toInventoryAppSummary(row: InventoryAppRow): InventoryAppSummary {
  return {
    slug: row.slug,
    tenantSlug: row.tenant_slug,
    zoneName: row.zone_name,
    primaryNodeId: row.primary_node_id,
    canonicalDomain: row.canonical_domain,
    aliases: row.aliases,
    backendPort: row.backend_port,
    runtimeImage: row.runtime_image,
    storageRoot: row.storage_root,
    mode: row.mode
  };
}

function toInventoryDatabaseSummary(row: InventoryDatabaseRow): InventoryDatabaseSummary {
  return {
    appSlug: row.app_slug,
    engine: row.engine,
    databaseName: row.database_name,
    databaseUser: row.database_user,
    primaryNodeId: row.primary_node_id,
    pendingMigrationTo: row.pending_migration_to ?? undefined
  };
}

function titleizeSlug(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function createDesiredStateVersion(): string {
  return `dispatch-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function createDnsSerial(): number {
  return Math.floor(Date.now() / 1000);
}

function relativeRecordNameForZone(hostname: string, zoneName: string): string {
  const normalizedHost = hostname.replace(/\.$/, "").toLowerCase();
  const normalizedZone = zoneName.replace(/\.$/, "").toLowerCase();

  if (normalizedHost === normalizedZone) {
    return "@";
  }

  const suffix = `.${normalizedZone}`;

  if (!normalizedHost.endsWith(suffix)) {
    throw new Error(`${hostname} does not belong to zone ${zoneName}.`);
  }

  return normalizedHost.slice(0, -suffix.length);
}

async function withTransaction<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertAuditEvent(
  client: PoolClient,
  input: AuditEventInput
): Promise<void> {
  await client.query(
    `INSERT INTO shp_audit_events (
       event_id,
       actor_type,
       actor_id,
       event_type,
       entity_type,
       entity_id,
       payload,
       occurred_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      randomUUID(),
      input.actorType,
      input.actorId ?? null,
      input.eventType,
      input.entityType ?? null,
      input.entityId ?? null,
      JSON.stringify(input.payload ?? {}),
      input.occurredAt ?? new Date().toISOString()
    ]
  );
}

async function getNodeCredential(
  client: PoolClient,
  nodeId: string
): Promise<NodeCredentialRow | null> {
  const result = await client.query<NodeCredentialRow>(
    `SELECT node_id, token_hash
     FROM control_plane_node_credentials
     WHERE node_id = $1`,
    [nodeId]
  );

  return result.rows[0] ?? null;
}

async function touchNodeCredential(
  client: PoolClient,
  nodeId: string,
  tokenHash: string,
  timestamp: string
): Promise<void> {
  await client.query(
    `UPDATE control_plane_node_credentials
     SET last_used_at = $3
     WHERE node_id = $1
       AND token_hash = $2`,
    [nodeId, tokenHash, timestamp]
  );
}

async function upsertNodeCredential(
  client: PoolClient,
  nodeId: string,
  rawToken: string,
  timestamp: string
): Promise<void> {
  await client.query(
    `INSERT INTO control_plane_node_credentials (
       node_id,
       token_hash,
       issued_at,
       last_used_at
     )
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (node_id)
     DO UPDATE SET
       token_hash = EXCLUDED.token_hash,
       issued_at = EXCLUDED.issued_at,
       last_used_at = EXCLUDED.last_used_at`,
    [nodeId, hashToken(rawToken), timestamp]
  );
}

async function authenticateNode(
  client: PoolClient,
  nodeId: string,
  presentedToken: string | null,
  timestamp: string
): Promise<void> {
  if (!presentedToken) {
    throw new NodeAuthorizationError("Missing bearer token.");
  }

  const credential = await getNodeCredential(client, nodeId);

  if (!credential) {
    throw new NodeAuthorizationError(`Node ${nodeId} is not enrolled.`);
  }

  const presentedTokenHash = hashToken(presentedToken);

  if (presentedTokenHash !== credential.token_hash) {
    throw new NodeAuthorizationError(`Bearer token rejected for node ${nodeId}.`);
  }

  await touchNodeCredential(client, nodeId, presentedTokenHash, timestamp);
}

async function getUserByEmail(
  client: PoolClient,
  email: string
): Promise<UserRow | null> {
  const result = await client.query<UserRow>(
    `SELECT user_id, email, display_name, status
     FROM shp_users
     WHERE email = $1`,
    [normalizeEmail(email)]
  );

  return result.rows[0] ?? null;
}

async function getUserById(client: PoolClient, userId: string): Promise<UserRow | null> {
  const result = await client.query<UserRow>(
    `SELECT user_id, email, display_name, status
     FROM shp_users
     WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function getUserCredential(
  client: PoolClient,
  userId: string
): Promise<UserCredentialRow | null> {
  const result = await client.query<UserCredentialRow>(
    `SELECT user_id, password_hash, password_salt, password_params
     FROM shp_user_credentials
     WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function upsertUserCredential(
  client: PoolClient,
  userId: string,
  password: string
): Promise<void> {
  const hashed = await createPasswordHash(password);

  await client.query(
    `INSERT INTO shp_user_credentials (
       user_id,
       password_hash,
       password_salt,
       password_params,
       updated_at
     )
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       password_salt = EXCLUDED.password_salt,
       password_params = EXCLUDED.password_params,
       updated_at = EXCLUDED.updated_at`,
    [
      userId,
      hashed.hash,
      hashed.salt,
      JSON.stringify(hashed.params)
    ]
  );
}

async function replaceUserGlobalRoles(
  client: PoolClient,
  userId: string,
  roles: PanelGlobalRole[]
): Promise<void> {
  await client.query(`DELETE FROM shp_user_global_roles WHERE user_id = $1`, [userId]);

  for (const role of roles) {
    await client.query(
      `INSERT INTO shp_user_global_roles (user_id, role)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId, role]
    );
  }
}

async function replaceUserTenantMemberships(
  client: PoolClient,
  userId: string,
  memberships: Array<{ tenantSlug: string; role: TenantMembershipRole }>
): Promise<void> {
  await client.query(`DELETE FROM shp_memberships WHERE user_id = $1`, [userId]);

  for (const membership of memberships) {
    const tenantResult = await client.query<{ tenant_id: string }>(
      `SELECT tenant_id
       FROM shp_tenants
       WHERE slug = $1`,
      [membership.tenantSlug]
    );
    const tenant = tenantResult.rows[0];

    if (!tenant) {
      throw new Error(`Tenant ${membership.tenantSlug} does not exist.`);
    }

    await client.query(
      `INSERT INTO shp_memberships (tenant_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [tenant.tenant_id, userId, membership.role]
    );
  }
}

async function getUserGlobalRoles(
  client: PoolClient,
  userId: string
): Promise<PanelGlobalRole[]> {
  const result = await client.query<UserGlobalRoleRow>(
    `SELECT role
     FROM shp_user_global_roles
     WHERE user_id = $1
     ORDER BY role ASC`,
    [userId]
  );

  return result.rows
    .map((row) => row.role)
    .filter((role): role is PanelGlobalRole =>
      panelGlobalRoles.includes(role as PanelGlobalRole)
    );
}

async function getUserMemberships(
  client: PoolClient,
  userId: string
): Promise<TenantMembershipSummary[]> {
  const result = await client.query<UserMembershipRow>(
    `SELECT
       memberships.tenant_id,
       tenants.slug AS tenant_slug,
       tenants.display_name AS tenant_display_name,
       memberships.role
     FROM shp_memberships memberships
     INNER JOIN shp_tenants tenants
       ON tenants.tenant_id = memberships.tenant_id
     WHERE memberships.user_id = $1
     ORDER BY tenants.slug ASC, memberships.role ASC`,
    [userId]
  );

  return result.rows.map((row) => ({
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    tenantDisplayName: row.tenant_display_name,
    role: row.role as TenantMembershipRole
  }));
}

async function buildAuthenticatedUserSummary(
  client: PoolClient,
  userId: string
): Promise<AuthenticatedUserSummary> {
  const user = await getUserById(client, userId);

  if (!user) {
    throw new UserAuthorizationError(`User ${userId} does not exist.`);
  }

  const [globalRoles, tenantMemberships] = await Promise.all([
    getUserGlobalRoles(client, userId),
    getUserMemberships(client, userId)
  ]);

  return {
    userId: user.user_id,
    email: user.email,
    displayName: user.display_name,
    status: user.status,
    globalRoles,
    tenantMemberships
  };
}

async function createSession(
  client: PoolClient,
  userId: string,
  sessionTtlSeconds: number
): Promise<{ sessionToken: string; expiresAt: string }> {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + sessionTtlSeconds * 1000);
  const sessionToken = createOpaqueSessionToken();

  await client.query(
    `INSERT INTO shp_sessions (
       session_id,
       user_id,
       session_token_hash,
       created_at,
       expires_at,
       last_used_at
     )
     VALUES ($1, $2, $3, $4, $5, $4)`,
    [
      randomUUID(),
      userId,
      hashToken(sessionToken),
      createdAt.toISOString(),
      expiresAt.toISOString()
    ]
  );

  return {
    sessionToken,
    expiresAt: expiresAt.toISOString()
  };
}

async function authenticateSession(
  client: PoolClient,
  presentedToken: string | null,
  nowIso = new Date().toISOString()
): Promise<AuthenticatedUserSummary> {
  if (!presentedToken) {
    throw new UserAuthorizationError("Missing session token.");
  }

  const result = await client.query<SessionRow>(
    `SELECT session_id, user_id, expires_at, revoked_at
     FROM shp_sessions
     WHERE session_token_hash = $1`,
    [hashToken(presentedToken)]
  );
  const session = result.rows[0];

  if (!session) {
    throw new UserAuthorizationError("Invalid session token.");
  }

  if (session.revoked_at) {
    throw new UserAuthorizationError("Session has been revoked.");
  }

  if (new Date(session.expires_at).getTime() <= new Date(nowIso).getTime()) {
    throw new UserAuthorizationError("Session has expired.");
  }

  await client.query(
    `UPDATE shp_sessions
     SET last_used_at = $2
     WHERE session_id = $1`,
    [session.session_id, nowIso]
  );

  return buildAuthenticatedUserSummary(client, session.user_id);
}

function ensureGlobalRole(
  user: AuthenticatedUserSummary,
  allowedRoles: PanelGlobalRole[]
): void {
  if (!allowedRoles.some((role) => user.globalRoles.includes(role))) {
    throw new UserAuthorizationError("User does not have the required role.");
  }
}

async function requireAuthorizedUser(
  client: PoolClient,
  presentedToken: string | null,
  allowedRoles: PanelGlobalRole[]
): Promise<AuthenticatedUserSummary> {
  const user = await authenticateSession(client, presentedToken);
  ensureGlobalRole(user, allowedRoles);
  return user;
}

async function ensureBootstrapAdmin(
  pool: Pool,
  options: PanelControlPlaneStoreOptions
): Promise<void> {
  if (!options.bootstrapAdminEmail || !options.bootstrapAdminPassword) {
    return;
  }

  await withTransaction(pool, async (client) => {
    const email = normalizeEmail(options.bootstrapAdminEmail!);
    const existing = await getUserByEmail(client, email);
    const userId = existing?.user_id ?? `user-${randomUUID()}`;

    if (!existing) {
      await client.query(
        `INSERT INTO shp_users (
           user_id,
           email,
           display_name,
           status
         )
         VALUES ($1, $2, $3, 'active')`,
        [userId, email, options.bootstrapAdminName ?? "Bootstrap Admin"]
      );
    } else {
      await client.query(
        `UPDATE shp_users
         SET display_name = $2,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, options.bootstrapAdminName ?? existing.display_name]
      );
    }

    await upsertUserCredential(client, userId, options.bootstrapAdminPassword!);
    await replaceUserGlobalRoles(client, userId, ["platform_admin"]);

    await insertAuditEvent(client, {
      actorType: "system",
      actorId: "bootstrap",
      eventType: "user.bootstrap_admin_ensured",
      entityType: "user",
      entityId: userId,
      payload: {
        email
      }
    });
  });
}

async function getLatestInventoryImport(
  client: PoolClient
): Promise<InventoryImportSummary | null> {
  const result = await client.query<InventoryImportRow>(
    `SELECT import_id, source_path, summary, imported_at
     FROM shp_inventory_import_runs
     ORDER BY imported_at DESC
     LIMIT 1`
  );

  return result.rows[0] ? toInventoryImportSummary(result.rows[0]) : null;
}

async function buildInventorySnapshot(client: PoolClient): Promise<InventoryStateSnapshot> {
  const [latestImport, nodeResult, zoneResult, appResult, databaseResult] = await Promise.all([
    getLatestInventoryImport(client),
    client.query<InventoryNodeRow>(
      `SELECT node_id, hostname, public_ipv4, wireguard_address
       FROM shp_nodes
       ORDER BY node_id ASC`
    ),
    client.query<InventoryZoneRow>(
      `SELECT
         zones.zone_name,
         tenants.slug AS tenant_slug,
         zones.primary_node_id
       FROM shp_dns_zones zones
       INNER JOIN shp_tenants tenants
         ON tenants.tenant_id = zones.tenant_id
       ORDER BY zones.zone_name ASC`
    ),
    client.query<InventoryAppRow>(
      `SELECT
         apps.slug,
         tenants.slug AS tenant_slug,
         zones.zone_name,
         apps.primary_node_id,
         sites.canonical_domain,
         sites.aliases,
         apps.backend_port,
         apps.runtime_image,
         apps.storage_root,
         apps.mode
       FROM shp_apps apps
       INNER JOIN shp_tenants tenants
         ON tenants.tenant_id = apps.tenant_id
       INNER JOIN shp_dns_zones zones
         ON zones.zone_id = apps.zone_id
       INNER JOIN shp_sites sites
         ON sites.app_id = apps.app_id
       ORDER BY apps.slug ASC`
    ),
    client.query<InventoryDatabaseRow>(
      `SELECT
         apps.slug AS app_slug,
         databases.engine,
         databases.database_name,
         databases.database_user,
         databases.primary_node_id,
         databases.pending_migration_to
       FROM shp_databases databases
       INNER JOIN shp_apps apps
         ON apps.app_id = databases.app_id
       ORDER BY apps.slug ASC`
    )
  ]);

  return {
    latestImport,
    nodes: nodeResult.rows.map(toInventoryNodeSummary),
    zones: zoneResult.rows.map(toInventoryZoneSummary),
    apps: appResult.rows.map(toInventoryAppSummary),
    databases: databaseResult.rows.map(toInventoryDatabaseSummary)
  };
}

function buildZoneRecords(
  zoneName: string,
  publicIpv4: string,
  siteRows: Array<{ canonical_domain: string; aliases: string[] }>
): DnsRecordPayload[] {
  const recordMap = new Map<string, DnsRecordPayload>();

  for (const site of siteRows) {
    const hostnames = [site.canonical_domain, ...site.aliases];

    for (const hostname of hostnames) {
      const name = relativeRecordNameForZone(hostname, zoneName);
      const key = `${name}:A:${publicIpv4}`;

      if (!recordMap.has(key)) {
        recordMap.set(key, {
          name,
          type: "A",
          value: publicIpv4,
          ttl: 300
        });
      }
    }
  }

  return [...recordMap.values()].sort((left, right) =>
    `${left.name}:${left.type}:${left.value}`.localeCompare(
      `${right.name}:${right.type}:${right.value}`
    )
  );
}

async function buildZoneDnsPayload(
  client: PoolClient,
  zoneName: string
): Promise<{ nodeId: string; payload: DnsSyncPayload }> {
  const zoneResult = await client.query<ZoneDispatchRow>(
    `SELECT
       zones.zone_name,
       zones.primary_node_id,
       nodes.public_ipv4
     FROM shp_dns_zones zones
     INNER JOIN shp_nodes nodes
       ON nodes.node_id = zones.primary_node_id
     WHERE zones.zone_name = $1`,
    [zoneName]
  );
  const zone = zoneResult.rows[0];

  if (!zone) {
    throw new Error(`Zone ${zoneName} does not exist in SHP inventory.`);
  }

  const siteResult = await client.query<{
    canonical_domain: string;
    aliases: string[];
  }>(
    `SELECT sites.canonical_domain, sites.aliases
     FROM shp_sites sites
     INNER JOIN shp_apps apps
       ON apps.app_id = sites.app_id
     INNER JOIN shp_dns_zones zones
       ON zones.zone_id = apps.zone_id
     WHERE zones.zone_name = $1
     ORDER BY sites.canonical_domain ASC`,
    [zoneName]
  );

  return {
    nodeId: zone.primary_node_id,
    payload: {
      zoneName,
      serial: createDnsSerial(),
      nameservers: [`ns1.${zoneName}`, `ns2.${zoneName}`],
      records: buildZoneRecords(zoneName, zone.public_ipv4, siteResult.rows)
    }
  };
}

async function buildProxyPayload(
  client: PoolClient,
  appSlug: string
): Promise<{ nodeId: string; payload: ProxyRenderPayload; zoneName: string }> {
  const result = await client.query<AppDispatchRow>(
    `SELECT
       apps.app_id,
       apps.slug,
       apps.primary_node_id,
       zones.zone_name,
       sites.canonical_domain,
       sites.aliases,
       apps.storage_root
     FROM shp_apps apps
     INNER JOIN shp_sites sites
       ON sites.app_id = apps.app_id
     INNER JOIN shp_dns_zones zones
       ON zones.zone_id = apps.zone_id
     WHERE apps.slug = $1`,
    [appSlug]
  );
  const app = result.rows[0];

  if (!app) {
    throw new Error(`Application ${appSlug} does not exist in SHP inventory.`);
  }

  return {
    nodeId: app.primary_node_id,
    zoneName: app.zone_name,
    payload: {
      vhostName: app.slug,
      serverName: app.canonical_domain,
      serverAliases: app.aliases,
      documentRoot: `${app.storage_root}/current/public`,
      tls: true
    }
  };
}

async function buildDatabasePayload(
  client: PoolClient,
  appSlug: string,
  password: string
): Promise<{
  nodeId: string;
  kind: "postgres.reconcile" | "mariadb.reconcile";
  payload: Record<string, unknown>;
}> {
  const result = await client.query<DatabaseDispatchRow>(
    `SELECT
       apps.slug,
       databases.engine,
       databases.database_name,
       databases.database_user,
       databases.primary_node_id
     FROM shp_databases databases
     INNER JOIN shp_apps apps
       ON apps.app_id = databases.app_id
     WHERE apps.slug = $1`,
    [appSlug]
  );
  const database = result.rows[0];

  if (!database) {
    throw new Error(`Database for application ${appSlug} does not exist in SHP inventory.`);
  }

  if (database.engine === "postgresql") {
    return {
      nodeId: database.primary_node_id,
      kind: "postgres.reconcile",
      payload: {
        appSlug: database.slug,
        databaseName: database.database_name,
        roleName: database.database_user,
        password
      }
    };
  }

  return {
    nodeId: database.primary_node_id,
    kind: "mariadb.reconcile",
    payload: {
      appSlug: database.slug,
      databaseName: database.database_name,
      userName: database.database_user,
      password
    }
  };
}

async function ensureControlPlaneTargetNode(
  client: PoolClient,
  nodeId: string,
  timestamp: string
): Promise<void> {
  const nodeResult = await client.query<InventoryNodeRow>(
    `SELECT node_id, hostname, public_ipv4, wireguard_address
     FROM shp_nodes
     WHERE node_id = $1`,
    [nodeId]
  );
  const node = nodeResult.rows[0];

  if (!node) {
    throw new Error(`Managed node ${nodeId} does not exist in SHP inventory.`);
  }

  await client.query(
    `INSERT INTO control_plane_nodes (
       node_id,
       hostname,
       version,
       supported_job_kinds,
       accepted_at,
       last_seen_at
     )
     VALUES ($1, $2, 'inventory', '[]'::jsonb, $3, $3)
     ON CONFLICT (node_id) DO NOTHING`,
    [nodeId, node.hostname, timestamp]
  );
}

async function insertDispatchedJobs(
  client: PoolClient,
  jobs: DispatchedJobEnvelope[],
  actorUserId: string,
  dispatchReason: string
): Promise<void> {
  const createdAt = new Date().toISOString();

  for (const nodeId of new Set(jobs.map((job) => job.nodeId))) {
    await ensureControlPlaneTargetNode(client, nodeId, createdAt);
  }

  for (const job of jobs) {
    await client.query(
      `INSERT INTO control_plane_jobs (
         id,
         desired_state_version,
         kind,
         node_id,
         created_at,
         payload,
         dispatched_by_user_id,
         dispatch_reason
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        job.id,
        job.desiredStateVersion,
        job.kind,
        job.nodeId,
        job.createdAt,
        JSON.stringify(job.payload),
        actorUserId,
        dispatchReason
      ]
    );

    await insertAuditEvent(client, {
      actorType: "user",
      actorId: actorUserId,
      eventType: "job.dispatched",
      entityType: "job",
      entityId: job.id,
      payload: {
        kind: job.kind,
        nodeId: job.nodeId,
        dispatchReason
      },
      occurredAt: job.createdAt
    });
  }
}

export async function createPostgresControlPlaneStore(
  databaseUrl: string,
  options: PanelControlPlaneStoreOptions
): Promise<PanelControlPlaneStore> {
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const pool = new Pool({
    connectionString: databaseUrl,
    application_name: "simplehost-panel-api"
  });

  await runPanelDatabaseMigrations(pool);
  await ensureBootstrapAdmin(pool, options);

  return {
    async registerNode(request, presentedToken) {
      const acceptedAt = new Date().toISOString();
      let issuedNodeToken: string | undefined;

      await withTransaction(pool, async (client) => {
        const credential = await getNodeCredential(client, request.nodeId);

        if (credential) {
          await authenticateNode(client, request.nodeId, presentedToken, acceptedAt);
        } else {
          if (!options.bootstrapEnrollmentToken) {
            throw new NodeAuthorizationError(
              "Bootstrap enrollment token is not configured on SHP."
            );
          }

          if (presentedToken !== options.bootstrapEnrollmentToken) {
            throw new NodeAuthorizationError(
              `Enrollment token rejected for node ${request.nodeId}.`
            );
          }

          issuedNodeToken = createOpaqueSessionToken();
        }

        await client.query(
          `INSERT INTO control_plane_nodes (
             node_id,
             hostname,
             version,
             supported_job_kinds,
             accepted_at,
             last_seen_at
           )
           VALUES ($1, $2, $3, $4::jsonb, $5, $5)
           ON CONFLICT (node_id)
           DO UPDATE SET
             hostname = EXCLUDED.hostname,
             version = EXCLUDED.version,
             supported_job_kinds = EXCLUDED.supported_job_kinds,
             last_seen_at = EXCLUDED.last_seen_at`,
          [
            request.nodeId,
            request.hostname,
            request.version,
            JSON.stringify(request.supportedJobKinds),
            acceptedAt
          ]
        );

        if (issuedNodeToken) {
          await upsertNodeCredential(client, request.nodeId, issuedNodeToken, acceptedAt);
        }

        await insertAuditEvent(client, {
          actorType: "node",
          actorId: request.nodeId,
          eventType: "node.upserted",
          entityType: "node",
          entityId: request.nodeId,
          payload: {
            hostname: request.hostname,
            version: request.version,
            supportedJobKinds: request.supportedJobKinds,
            issuedNodeToken: issuedNodeToken !== undefined
          },
          occurredAt: acceptedAt
        });
      });

      return {
        nodeId: request.nodeId,
        acceptedAt,
        pollIntervalMs,
        nodeToken: issuedNodeToken
      };
    },

    async claimJobs(request, presentedToken) {
      const claimedAt = new Date().toISOString();

      const jobs = await withTransaction(pool, async (client) => {
        await authenticateNode(client, request.nodeId, presentedToken, claimedAt);

        await client.query(
          `UPDATE control_plane_nodes
           SET hostname = $2,
               version = $3,
               last_seen_at = $4
           WHERE node_id = $1`,
          [request.nodeId, request.hostname, request.version, claimedAt]
        );

        const result = await client.query<JobRow>(
          `WITH candidate_jobs AS (
             SELECT id
             FROM control_plane_jobs
             WHERE node_id = $1
               AND claimed_at IS NULL
               AND completed_at IS NULL
             ORDER BY created_at ASC
             LIMIT $2
             FOR UPDATE SKIP LOCKED
           ),
           claimed_jobs AS (
             UPDATE control_plane_jobs jobs
             SET claimed_at = $3
             FROM candidate_jobs candidates
             WHERE jobs.id = candidates.id
             RETURNING
               jobs.id,
               jobs.desired_state_version,
               jobs.kind,
               jobs.node_id,
               jobs.created_at,
               jobs.payload
           )
           SELECT *
           FROM claimed_jobs
           ORDER BY created_at ASC`,
          [request.nodeId, request.maxJobs, claimedAt]
        );

        await insertAuditEvent(client, {
          actorType: "node",
          actorId: request.nodeId,
          eventType: "jobs.claimed",
          entityType: "node",
          entityId: request.nodeId,
          payload: {
            jobIds: result.rows.map((row) => row.id),
            maxJobs: request.maxJobs,
            hostname: request.hostname,
            version: request.version
          },
          occurredAt: claimedAt
        });

        return result.rows.map(toDispatchedJob);
      });

      return {
        nodeId: request.nodeId,
        claimedAt,
        jobs
      };
    },

    async reportJob(request, presentedToken) {
      const reportedAt = new Date().toISOString();

      await withTransaction(pool, async (client) => {
        await authenticateNode(client, request.nodeId, presentedToken, reportedAt);

        await client.query(
          `UPDATE control_plane_nodes
           SET last_seen_at = $2
           WHERE node_id = $1`,
          [request.nodeId, reportedAt]
        );

        await client.query(
          `UPDATE control_plane_jobs
           SET completed_at = $2
           WHERE id = $1`,
          [request.result.jobId, request.result.completedAt]
        );

        await client.query(
          `INSERT INTO control_plane_job_results (
             job_id,
             kind,
             node_id,
             status,
             summary,
             details,
             completed_at,
             reported_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           ON CONFLICT (job_id)
           DO UPDATE SET
             kind = EXCLUDED.kind,
             node_id = EXCLUDED.node_id,
             status = EXCLUDED.status,
             summary = EXCLUDED.summary,
             details = EXCLUDED.details,
             completed_at = EXCLUDED.completed_at,
             reported_at = EXCLUDED.reported_at`,
          [
            request.result.jobId,
            request.result.kind,
            request.result.nodeId,
            request.result.status,
            request.result.summary,
            JSON.stringify(request.result.details ?? null),
            request.result.completedAt,
            reportedAt
          ]
        );

        await insertAuditEvent(client, {
          actorType: "node",
          actorId: request.nodeId,
          eventType: "job.reported",
          entityType: "job",
          entityId: request.result.jobId,
          payload: {
            kind: request.result.kind,
            status: request.result.status,
            summary: request.result.summary
          },
          occurredAt: reportedAt
        });
      });

      return {
        accepted: true as const
      };
    },

    async loginUser(request) {
      return withTransaction(pool, async (client) => {
        const user = await getUserByEmail(client, request.email);

        if (!user) {
          throw new UserAuthorizationError("Invalid email or password.");
        }

        const credential = await getUserCredential(client, user.user_id);

        if (!credential) {
          throw new UserAuthorizationError("Invalid email or password.");
        }

        const passwordMatches = await verifyPasswordHash(request.password, {
          hash: credential.password_hash,
          salt: credential.password_salt,
          params: credential.password_params
        });

        if (!passwordMatches) {
          throw new UserAuthorizationError("Invalid email or password.");
        }

        const session = await createSession(client, user.user_id, options.sessionTtlSeconds);
        const summary = await buildAuthenticatedUserSummary(client, user.user_id);

        await insertAuditEvent(client, {
          actorType: "user",
          actorId: user.user_id,
          eventType: "auth.login",
          entityType: "user",
          entityId: user.user_id,
          payload: {
            email: user.email
          }
        });

        return {
          sessionToken: session.sessionToken,
          expiresAt: session.expiresAt,
          user: summary
        };
      });
    },

    async getCurrentUser(presentedToken) {
      return withTransaction(pool, (client) => authenticateSession(client, presentedToken));
    },

    async logoutUser(presentedToken) {
      return withTransaction(pool, async (client) => {
        const user = await authenticateSession(client, presentedToken);

        await client.query(
          `UPDATE shp_sessions
           SET revoked_at = NOW()
           WHERE session_token_hash = $1`,
          [hashToken(presentedToken!)]
        );

        await insertAuditEvent(client, {
          actorType: "user",
          actorId: user.userId,
          eventType: "auth.logout",
          entityType: "user",
          entityId: user.userId
        });

        return {
          revoked: true as const
        };
      });
    },

    async createUser(request, presentedToken) {
      return withTransaction(pool, async (client) => {
        const actor = await requireAuthorizedUser(client, presentedToken, [
          "platform_admin"
        ]);
        const email = normalizeEmail(request.email);
        const existing = await getUserByEmail(client, email);

        if (existing) {
          throw new Error(`User ${email} already exists.`);
        }

        const userId = `user-${randomUUID()}`;
        const globalRoles = request.globalRoles ?? [];
        const tenantMemberships = request.tenantMemberships ?? [];

        await client.query(
          `INSERT INTO shp_users (
             user_id,
             email,
             display_name,
             status
           )
           VALUES ($1, $2, $3, 'active')`,
          [userId, email, request.displayName]
        );

        await upsertUserCredential(client, userId, request.password);
        await replaceUserGlobalRoles(client, userId, globalRoles);
        await replaceUserTenantMemberships(client, userId, tenantMemberships);

        await insertAuditEvent(client, {
          actorType: "user",
          actorId: actor.userId,
          eventType: "user.created",
          entityType: "user",
          entityId: userId,
          payload: {
            email,
            globalRoles,
            tenantMemberships
          }
        });

        return {
          user: await buildAuthenticatedUserSummary(client, userId)
        };
      });
    },

    async listUsers(presentedToken) {
      return withTransaction(pool, async (client) => {
        await requireAuthorizedUser(client, presentedToken, ["platform_admin"]);
        const result = await client.query<{ user_id: string }>(
          `SELECT user_id
           FROM shp_users
           ORDER BY created_at ASC`
        );

        const users: AuthenticatedUserSummary[] = [];

        for (const row of result.rows) {
          users.push(await buildAuthenticatedUserSummary(client, row.user_id));
        }

        return users;
      });
    },

    async importInventory(request, presentedToken) {
      const sourcePath = request.path?.trim() || options.defaultInventoryImportPath;
      const inventory = await readPlatformInventory(sourcePath);
      const importedAt = new Date().toISOString();
      const importId = `import-${randomUUID()}`;

      return withTransaction(pool, async (client) => {
        const actor = await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);

        const zoneOwners = new Map<string, string>();

        for (const app of inventory.apps) {
          const owner = zoneOwners.get(app.zone);

          if (owner && owner !== app.client) {
            throw new Error(
              `Zone ${app.zone} is assigned to both ${owner} and ${app.client}.`
            );
          }

          zoneOwners.set(app.zone, app.client);
        }

        for (const [nodeId, node] of Object.entries(inventory.nodes)) {
          await client.query(
            `INSERT INTO shp_nodes (
               node_id,
               hostname,
               public_ipv4,
               wireguard_address,
               created_at,
               updated_at
             )
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             ON CONFLICT (node_id)
             DO UPDATE SET
               hostname = EXCLUDED.hostname,
               public_ipv4 = EXCLUDED.public_ipv4,
               wireguard_address = EXCLUDED.wireguard_address,
               updated_at = EXCLUDED.updated_at`,
            [nodeId, node.hostname, node.public_ipv4, node.wireguard_address]
          );
        }

        for (const tenantSlug of new Set(inventory.apps.map((app) => app.client))) {
          const tenantId = `tenant-${tenantSlug}`;

          await client.query(
            `INSERT INTO shp_tenants (
               tenant_id,
               slug,
               display_name,
               created_at,
               updated_at
             )
             VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT (slug)
             DO UPDATE SET
               display_name = EXCLUDED.display_name,
               updated_at = EXCLUDED.updated_at`,
            [tenantId, tenantSlug, titleizeSlug(tenantSlug)]
          );
        }

        for (const [zoneName, tenantSlug] of zoneOwners) {
          const tenantId = `tenant-${tenantSlug}`;

          await client.query(
            `INSERT INTO shp_dns_zones (
               zone_id,
               tenant_id,
               zone_name,
               primary_node_id,
               created_at,
               updated_at
             )
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             ON CONFLICT (zone_name)
             DO UPDATE SET
               tenant_id = EXCLUDED.tenant_id,
               primary_node_id = EXCLUDED.primary_node_id,
               updated_at = EXCLUDED.updated_at`,
            [`zone-${zoneName}`, tenantId, zoneName, "primary"]
          );
        }

        for (const app of inventory.apps) {
          const appId = `app-${app.slug}`;

          await client.query(
            `INSERT INTO shp_apps (
               app_id,
               tenant_id,
               zone_id,
               primary_node_id,
               slug,
               runtime_image,
               backend_port,
               storage_root,
               mode,
               created_at,
               updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
             ON CONFLICT (slug)
             DO UPDATE SET
               tenant_id = EXCLUDED.tenant_id,
               zone_id = EXCLUDED.zone_id,
               primary_node_id = EXCLUDED.primary_node_id,
               runtime_image = EXCLUDED.runtime_image,
               backend_port = EXCLUDED.backend_port,
               storage_root = EXCLUDED.storage_root,
               mode = EXCLUDED.mode,
               updated_at = EXCLUDED.updated_at`,
            [
              appId,
              `tenant-${app.client}`,
              `zone-${app.zone}`,
              "primary",
              app.slug,
              app.runtime_image,
              app.backend_port,
              app.storage_root,
              app.mode
            ]
          );

          await client.query(
            `INSERT INTO shp_sites (
               site_id,
               app_id,
               canonical_domain,
               aliases,
               created_at,
               updated_at
             )
             VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
             ON CONFLICT (canonical_domain)
             DO UPDATE SET
               app_id = EXCLUDED.app_id,
               aliases = EXCLUDED.aliases,
               updated_at = EXCLUDED.updated_at`,
            [`site-${app.slug}`, appId, app.canonical_domain, JSON.stringify(app.aliases)]
          );

          const databasePrimaryNodeId =
            app.database.engine === "postgresql"
              ? inventory.platform.postgresql_apps.primary_node
              : inventory.platform.mariadb_apps.primary_node;

          await client.query(
            `INSERT INTO shp_databases (
               database_id,
               app_id,
               primary_node_id,
               engine,
               database_name,
               database_user,
               pending_migration_to,
               created_at,
               updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             ON CONFLICT (engine, database_name)
             DO UPDATE SET
               app_id = EXCLUDED.app_id,
               primary_node_id = EXCLUDED.primary_node_id,
               database_user = EXCLUDED.database_user,
               pending_migration_to = EXCLUDED.pending_migration_to,
               updated_at = EXCLUDED.updated_at`,
            [
              `database-${app.slug}`,
              appId,
              databasePrimaryNodeId,
              app.database.engine,
              app.database.name,
              app.database.user,
              app.database.pending_migration_to ?? null
            ]
          );
        }

        const summary = {
          tenantCount: new Set(inventory.apps.map((app) => app.client)).size,
          nodeCount: Object.keys(inventory.nodes).length,
          zoneCount: zoneOwners.size,
          appCount: inventory.apps.length,
          siteCount: inventory.apps.length,
          databaseCount: inventory.apps.length
        };

        await client.query(
          `INSERT INTO shp_inventory_import_runs (
             import_id,
             source_path,
             summary,
             imported_at
           )
           VALUES ($1, $2, $3::jsonb, $4)`,
          [importId, sourcePath, JSON.stringify(summary), importedAt]
        );

        await insertAuditEvent(client, {
          actorType: "user",
          actorId: actor.userId,
          eventType: "inventory.imported",
          entityType: "inventory",
          entityId: importId,
          payload: {
            sourcePath,
            summary
          },
          occurredAt: importedAt
        });

        return {
          importId,
          sourcePath,
          importedAt,
          ...summary
        };
      });
    },

    async getInventorySnapshot(presentedToken) {
      return withTransaction(pool, async (client) => {
        await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);

        return buildInventorySnapshot(client);
      });
    },

    async dispatchZoneSync(zoneName, presentedToken) {
      return withTransaction(pool, async (client) => {
        const actor = await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        const desiredStateVersion = createDesiredStateVersion();
        const { nodeId, payload } = await buildZoneDnsPayload(client, zoneName);
        const jobs = [
          createDispatchedJobEnvelope(
            "dns.sync",
            nodeId,
            desiredStateVersion,
            payload as unknown as Record<string, unknown>
          )
        ];

        await insertDispatchedJobs(
          client,
          jobs,
          actor.userId,
          `dns.sync:${zoneName}`
        );

        return {
          desiredStateVersion,
          jobs: jobs.map((job) => ({
            ...job,
            payload: sanitizePayload(job.payload) as Record<string, unknown>
          }))
        };
      });
    },

    async dispatchAppReconcile(appSlug, request, presentedToken) {
      return withTransaction(pool, async (client) => {
        const actor = await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        const desiredStateVersion = createDesiredStateVersion();
        const jobs: DispatchedJobEnvelope[] = [];
        const includeDns = request.includeDns ?? true;
        const includeProxy = request.includeProxy ?? true;
        const proxyPlan = await buildProxyPayload(client, appSlug);

        if (includeProxy) {
          jobs.push(
            createDispatchedJobEnvelope(
              "proxy.render",
              proxyPlan.nodeId,
              desiredStateVersion,
              proxyPlan.payload as unknown as Record<string, unknown>
            )
          );
        }

        if (includeDns) {
          const dnsPlan = await buildZoneDnsPayload(client, proxyPlan.zoneName);

          jobs.push(
            createDispatchedJobEnvelope(
              "dns.sync",
              dnsPlan.nodeId,
              desiredStateVersion,
              dnsPlan.payload as unknown as Record<string, unknown>
            )
          );
        }

        if (jobs.length === 0) {
          throw new Error(`No jobs were selected for application ${appSlug}.`);
        }

        await insertDispatchedJobs(
          client,
          jobs,
          actor.userId,
          `app.reconcile:${appSlug}`
        );

        return {
          desiredStateVersion,
          jobs: jobs.map((job) => ({
            ...job,
            payload: sanitizePayload(job.payload) as Record<string, unknown>
          }))
        };
      });
    },

    async dispatchDatabaseReconcile(appSlug, request, presentedToken) {
      return withTransaction(pool, async (client) => {
        const actor = await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        const desiredStateVersion = createDesiredStateVersion();
        const databasePlan = await buildDatabasePayload(client, appSlug, request.password);
        const jobs = [
          createDispatchedJobEnvelope(
            databasePlan.kind,
            databasePlan.nodeId,
            desiredStateVersion,
            databasePlan.payload
          )
        ];

        await insertDispatchedJobs(
          client,
          jobs,
          actor.userId,
          `database.reconcile:${appSlug}`
        );

        return {
          desiredStateVersion,
          jobs: jobs.map((job) => ({
            ...job,
            payload: sanitizePayload(job.payload) as Record<string, unknown>
          }))
        };
      });
    },

    async getStateSnapshot() {
      const [nodeResult, pendingJobResult, reportedResult] = await Promise.all([
        pool.query<NodeRow>(
          `SELECT
             node_id,
             hostname,
             version,
             supported_job_kinds,
             accepted_at,
             last_seen_at
           FROM control_plane_nodes
           ORDER BY accepted_at ASC`
        ),
        pool.query<JobRow>(
          `SELECT
             id,
             desired_state_version,
             kind,
             node_id,
             created_at,
             payload
           FROM control_plane_jobs
           WHERE claimed_at IS NULL
             AND completed_at IS NULL
           ORDER BY created_at ASC`
        ),
        pool.query<ResultRow>(
          `SELECT
             job_id,
             kind,
             node_id,
             status,
             summary,
             details,
             completed_at
           FROM control_plane_job_results
           ORDER BY completed_at ASC`
        )
      ]);

      const pendingJobs: Record<string, DispatchedJobEnvelope[]> = {};

      for (const row of pendingJobResult.rows) {
        const job = toDispatchedJob(row);
        pendingJobs[job.nodeId] ??= [];
        pendingJobs[job.nodeId].push(job);
      }

      return {
        nodes: nodeResult.rows.map(toRegisteredNodeState),
        pendingJobs,
        reportedResults: reportedResult.rows.map(toReportedJobResult)
      };
    },

    async close() {
      await pool.end();
    }
  };
}
