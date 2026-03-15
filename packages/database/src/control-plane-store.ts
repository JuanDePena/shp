import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";

import { Pool, type PoolClient } from "pg";
import YAML from "yaml";

import {
  type AuditEventSummary,
  type BackupRunRecordRequest,
  type BackupRunSummary,
  type BackupsOverview,
  type CodeServerServiceSnapshot,
  type CodeServerUpdatePayload,
  type CodeServerUpdateRequest,
  createDispatchedJobEnvelope,
  type DesiredStateApplyRequest,
  type DesiredStateApplyResponse,
  type DesiredStateAppInput,
  type DesiredStateBackupPolicyInput,
  type DesiredStateDatabaseInput,
  type DesiredStateExportResponse,
  type DesiredStateNodeInput,
  type DesiredStateSpec,
  type DesiredStateTenantInput,
  type DesiredStateZoneInput,
  type JobHistoryEntry,
  panelGlobalRoles,
  type NodeHealthSnapshot,
  type OperationsOverview,
  type ResourceDriftSummary,
  type ReconciliationRunSummary,
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
import {
  readPlatformInventory,
  type PlatformInventoryApp,
  type PlatformInventoryDocument
} from "./inventory.js";
import { runPanelDatabaseMigrations } from "./migrations.js";

interface NodeRow {
  node_id: string;
  hostname: string;
  version: string;
  supported_job_kinds: unknown;
  accepted_at: Date | string;
  last_seen_at: Date | string;
  runtime_snapshot?: Record<string, unknown> | null;
}

interface JobRow {
  id: string;
  desired_state_version: string;
  kind: string;
  node_id: string;
  created_at: Date | string;
  payload: Record<string, unknown>;
  resource_key?: string | null;
  resource_kind?: string | null;
  payload_hash?: string | null;
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
  zone_id: string;
  zone_name: string;
  tenant_slug: string;
  primary_node_id: string;
}

interface InventoryAppRow {
  slug: string;
  tenant_slug: string;
  zone_name: string;
  primary_node_id: string;
  standby_node_id: string | null;
  canonical_domain: string;
  aliases: string[];
  backend_port: number;
  runtime_image: string;
  storage_root: string;
  mode: string;
}

interface InventoryDatabaseRow {
  database_id: string;
  app_slug: string;
  engine: "postgresql" | "mariadb";
  database_name: string;
  database_user: string;
  primary_node_id: string;
  standby_node_id: string | null;
  pending_migration_to: "postgresql" | "mariadb" | null;
  desired_password: Record<string, unknown> | null;
}

interface ZoneDispatchRow {
  zone_name: string;
  primary_node_id: string;
  public_ipv4: string;
  desired_updated_at: Date | string;
}

interface AppDispatchRow {
  app_id: string;
  slug: string;
  primary_node_id: string;
  standby_node_id: string | null;
  mode: string;
  zone_name: string;
  canonical_domain: string;
  aliases: string[];
  storage_root: string;
}

interface DatabaseDispatchRow {
  database_id: string;
  slug: string;
  engine: "postgresql" | "mariadb";
  database_name: string;
  database_user: string;
  primary_node_id: string;
  desired_password: Record<string, unknown> | null;
}

interface InventoryRecordRow {
  zone_name: string;
  name: string;
  type: "A" | "AAAA" | "CNAME" | "TXT";
  value: string;
  ttl: number;
}

interface BackupPolicyRow {
  policy_slug: string;
  tenant_slug: string;
  target_node_id: string;
  schedule: string;
  retention_days: number;
  storage_location: string;
  resource_selectors: string[];
}

interface BackupRunRow {
  run_id: string;
  policy_slug: string;
  node_id: string;
  status: "running" | "succeeded" | "failed";
  summary: string;
  started_at: Date | string;
  completed_at: Date | string | null;
}

interface DriftStatusRow {
  id: string;
  payload_hash: string | null;
  completed_at: Date | string | null;
  status: string | null;
  summary: string | null;
}

interface ReconciliationRunRow {
  run_id: string;
  desired_state_version: string;
  generated_job_count: number;
  skipped_job_count: number;
  missing_credential_count: number;
  summary: Record<string, unknown>;
  started_at: Date | string;
  completed_at: Date | string;
}

interface JobHistoryRow {
  id: string;
  desired_state_version: string;
  kind: string;
  node_id: string;
  created_at: Date | string;
  claimed_at: Date | string | null;
  completed_at: Date | string | null;
  payload: Record<string, unknown>;
  status: string | null;
  summary: string | null;
  details: Record<string, unknown> | null;
  dispatch_reason: string | null;
  resource_key: string | null;
}

interface NodeHealthRow {
  node_id: string;
  hostname: string;
  current_version: string | null;
  last_seen_at: Date | string | null;
  pending_job_count: number;
  latest_job_status: string | null;
  latest_job_summary: string | null;
  drifted_resource_count: number;
  primary_zone_count: number;
  primary_app_count: number;
  backup_policy_count: number;
  runtime_snapshot?: Record<string, unknown> | null;
}

interface AuditEventRow {
  event_id: string;
  actor_type: string;
  actor_id: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: Date | string;
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
  jobPayloadSecret: string | null;
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
  applyDesiredState(
    request: DesiredStateApplyRequest,
    presentedToken: string | null
  ): Promise<DesiredStateApplyResponse>;
  exportDesiredState(
    presentedToken: string | null
  ): Promise<DesiredStateExportResponse>;
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
  dispatchCodeServerUpdate(
    request: CodeServerUpdateRequest,
    presentedToken: string | null
  ): Promise<JobDispatchResponse>;
  runReconciliationCycle(presentedToken?: string | null): Promise<ReconciliationRunSummary>;
  getOperationsOverview(presentedToken: string | null): Promise<OperationsOverview>;
  getResourceDrift(presentedToken: string | null): Promise<ResourceDriftSummary[]>;
  getNodeHealth(presentedToken: string | null): Promise<NodeHealthSnapshot[]>;
  listJobHistory(
    presentedToken: string | null,
    limit?: number
  ): Promise<JobHistoryEntry[]>;
  listAuditEvents(
    presentedToken: string | null,
    limit?: number
  ): Promise<AuditEventSummary[]>;
  getBackupsOverview(presentedToken: string | null): Promise<BackupsOverview>;
  recordBackupRun(
    request: BackupRunRecordRequest,
    presentedToken: string | null
  ): Promise<BackupRunSummary>;
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

interface EncryptedJobPayloadEnvelope {
  __simplehostEncryptedJobPayload: true;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

function isEncryptedJobPayloadEnvelope(
  value: unknown
): value is EncryptedJobPayloadEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    record.__simplehostEncryptedJobPayload === true &&
    record.alg === "aes-256-gcm" &&
    typeof record.iv === "string" &&
    typeof record.tag === "string" &&
    typeof record.ciphertext === "string"
  );
}

function deriveJobPayloadKey(secret: string | null): Buffer | null {
  if (!secret) {
    return null;
  }

  return createHash("sha256").update(secret).digest();
}

function encodeStoredJobPayload(
  payload: Record<string, unknown>,
  key: Buffer | null
): Record<string, unknown> {
  if (!key) {
    return payload;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    __simplehostEncryptedJobPayload: true,
    alg: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

function decodeStoredJobPayload(
  payload: Record<string, unknown>,
  key: Buffer | null
): Record<string, unknown> {
  if (!isEncryptedJobPayloadEnvelope(payload)) {
    return payload;
  }

  if (!key) {
    throw new Error("SHP job payload secret is required to decrypt queued jobs.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
  const decoded = JSON.parse(plaintext) as unknown;

  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Stored SHP job payload did not decode to an object.");
  }

  return decoded as Record<string, unknown>;
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
      key.toLowerCase().includes("password") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("token")
        ? "[redacted]"
        : sanitizePayload(entry);
  }

  return sanitized;
}

function stripSensitivePayloadFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripSensitivePayloadFields(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const stripped: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey.includes("password") ||
      normalizedKey.includes("secret") ||
      normalizedKey.includes("token")
    ) {
      continue;
    }

    stripped[key] = stripSensitivePayloadFields(entry);
  }

  return stripped;
}

function toDispatchedJob(
  row: JobRow,
  payloadKey: Buffer | null,
  options: { sanitizeSecrets?: boolean } = {}
): DispatchedJobEnvelope {
  const { sanitizeSecrets = true } = options;
  const decodedPayload = decodeStoredJobPayload(row.payload, payloadKey);

  return {
    id: row.id,
    desiredStateVersion: row.desired_state_version,
    kind: row.kind as DispatchedJobEnvelope["kind"],
    nodeId: row.node_id,
    createdAt: normalizeTimestamp(row.created_at),
    payload: (sanitizeSecrets ? sanitizePayload(decodedPayload) : decodedPayload) as Record<
      string,
      unknown
    >
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
    standbyNodeId: row.standby_node_id ?? undefined,
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
    standbyNodeId: row.standby_node_id ?? undefined,
    pendingMigrationTo: row.pending_migration_to ?? undefined
  };
}

function toBackupPolicySummary(row: BackupPolicyRow): BackupsOverview["policies"][number] {
  return {
    policySlug: row.policy_slug,
    tenantSlug: row.tenant_slug,
    targetNodeId: row.target_node_id,
    schedule: row.schedule,
    retentionDays: row.retention_days,
    storageLocation: row.storage_location,
    resourceSelectors: row.resource_selectors
  };
}

function toBackupRunSummary(row: BackupRunRow): BackupsOverview["latestRuns"][number] {
  return {
    runId: row.run_id,
    policySlug: row.policy_slug,
    nodeId: row.node_id,
    status: row.status,
    summary: row.summary,
    startedAt: normalizeTimestamp(row.started_at),
    completedAt: row.completed_at ? normalizeTimestamp(row.completed_at) : undefined
  };
}

function toReconciliationRunSummary(
  row: ReconciliationRunRow
): ReconciliationRunSummary {
  return {
    runId: row.run_id,
    desiredStateVersion: row.desired_state_version,
    startedAt: normalizeTimestamp(row.started_at),
    completedAt: normalizeTimestamp(row.completed_at),
    generatedJobCount: row.generated_job_count,
    skippedJobCount: row.skipped_job_count,
    missingCredentialCount: row.missing_credential_count,
    jobs: Array.isArray(row.summary.jobs)
      ? (row.summary.jobs as ReconciliationRunSummary["jobs"])
      : []
  };
}

function normalizeCodeServerSnapshot(
  value: unknown
): CodeServerServiceSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.serviceName !== "string") {
    return undefined;
  }

  return {
    serviceName: record.serviceName,
    enabled: Boolean(record.enabled),
    active: Boolean(record.active),
    version: typeof record.version === "string" ? record.version : undefined,
    bindAddress: typeof record.bindAddress === "string" ? record.bindAddress : undefined,
    authMode: typeof record.authMode === "string" ? record.authMode : undefined,
    settingsProfileHash:
      typeof record.settingsProfileHash === "string"
        ? record.settingsProfileHash
        : undefined,
    checkedAt: typeof record.checkedAt === "string" ? record.checkedAt : new Date(0).toISOString()
  };
}

function toNodeHealthSnapshot(row: NodeHealthRow): NodeHealthSnapshot {
  const runtimeSnapshot =
    row.runtime_snapshot && typeof row.runtime_snapshot === "object"
      ? row.runtime_snapshot
      : {};

  return {
    nodeId: row.node_id,
    hostname: row.hostname,
    desiredRole: "inventory",
    currentVersion: row.current_version ?? undefined,
    desiredVersion: undefined,
    lastSeenAt: row.last_seen_at ? normalizeTimestamp(row.last_seen_at) : undefined,
    pendingJobCount: Number(row.pending_job_count),
    latestJobStatus: (row.latest_job_status as NodeHealthSnapshot["latestJobStatus"]) ?? undefined,
    latestJobSummary: row.latest_job_summary ?? undefined,
    driftedResourceCount: Number(row.drifted_resource_count ?? 0),
    primaryZoneCount: Number(row.primary_zone_count ?? 0),
    primaryAppCount: Number(row.primary_app_count ?? 0),
    backupPolicyCount: Number(row.backup_policy_count ?? 0),
    codeServer: normalizeCodeServerSnapshot(
      (runtimeSnapshot as Record<string, unknown>).codeServer
    )
  };
}

function toJobHistoryEntry(
  row: JobHistoryRow,
  payloadKey: Buffer | null
): JobHistoryEntry {
  return {
    jobId: row.id,
    desiredStateVersion: row.desired_state_version,
    kind: row.kind as JobHistoryEntry["kind"],
    nodeId: row.node_id,
    createdAt: normalizeTimestamp(row.created_at),
    claimedAt: row.claimed_at ? normalizeTimestamp(row.claimed_at) : undefined,
    completedAt: row.completed_at ? normalizeTimestamp(row.completed_at) : undefined,
    status: (row.status as JobHistoryEntry["status"]) ?? undefined,
    summary: row.summary ?? undefined,
    dispatchReason: row.dispatch_reason ?? undefined,
    resourceKey: row.resource_key ?? undefined,
    payload: sanitizePayload(
      decodeStoredJobPayload(row.payload, payloadKey)
    ) as Record<string, unknown>,
    details: row.details
      ? (sanitizePayload(row.details) as Record<string, unknown>)
      : undefined
  };
}

function toAuditEventSummary(row: AuditEventRow): AuditEventSummary {
  return {
    eventId: row.event_id,
    actorType: row.actor_type,
    actorId: row.actor_id ?? undefined,
    eventType: row.event_type,
    entityType: row.entity_type ?? undefined,
    entityId: row.entity_id ?? undefined,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    occurredAt: normalizeTimestamp(row.occurred_at)
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (!value || typeof value !== "object") {
    return JSON.stringify(value);
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hashDesiredPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function createStableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16)}`;
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
         zones.zone_id,
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
         apps.standby_node_id,
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
         databases.database_id,
         apps.slug AS app_slug,
         databases.engine,
         databases.database_name,
         databases.database_user,
         databases.primary_node_id,
         databases.standby_node_id,
         databases.pending_migration_to,
         credentials.secret_payload AS desired_password
       FROM shp_databases databases
       INNER JOIN shp_apps apps
         ON apps.app_id = databases.app_id
       LEFT JOIN shp_database_credentials credentials
         ON credentials.database_id = databases.database_id
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

function encodeDesiredPassword(
  password: string,
  key: Buffer | null
): Record<string, unknown> {
  return encodeStoredJobPayload({ password }, key);
}

function decodeDesiredPassword(
  payload: Record<string, unknown> | null,
  key: Buffer | null
): string | null {
  if (!payload) {
    return null;
  }

  const decoded = decodeStoredJobPayload(payload, key);
  return typeof decoded.password === "string" ? decoded.password : null;
}

async function buildDesiredStateSpecFromDatabase(
  client: PoolClient
): Promise<DesiredStateSpec> {
  const [tenantResult, nodeResult, zoneResult, recordResult, appResult, databaseResult, backupPolicyResult] =
    await Promise.all([
      client.query<{ slug: string; display_name: string }>(
        `SELECT slug, display_name
         FROM shp_tenants
         ORDER BY slug ASC`
      ),
      client.query<InventoryNodeRow>(
        `SELECT node_id, hostname, public_ipv4, wireguard_address
         FROM shp_nodes
         ORDER BY node_id ASC`
      ),
      client.query<InventoryZoneRow>(
        `SELECT
           zone_id,
           zones.zone_name,
           tenants.slug AS tenant_slug,
           zones.primary_node_id
         FROM shp_dns_zones zones
         INNER JOIN shp_tenants tenants
           ON tenants.tenant_id = zones.tenant_id
         ORDER BY zones.zone_name ASC`
      ),
      client.query<InventoryRecordRow>(
        `SELECT
           zones.zone_name,
           records.name,
           records.type,
           records.value,
           records.ttl
         FROM shp_dns_records records
         INNER JOIN shp_dns_zones zones
           ON zones.zone_id = records.zone_id
         ORDER BY zones.zone_name ASC, records.name ASC, records.type ASC, records.value ASC`
      ),
      client.query<InventoryAppRow>(
        `SELECT
           apps.slug,
           tenants.slug AS tenant_slug,
           zones.zone_name,
           apps.primary_node_id,
           apps.standby_node_id,
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
           databases.database_id,
           apps.slug AS app_slug,
           databases.engine,
           databases.database_name,
           databases.database_user,
           databases.primary_node_id,
           databases.standby_node_id,
           databases.pending_migration_to,
           credentials.secret_payload AS desired_password
         FROM shp_databases databases
         INNER JOIN shp_apps apps
           ON apps.app_id = databases.app_id
         LEFT JOIN shp_database_credentials credentials
           ON credentials.database_id = databases.database_id
         ORDER BY apps.slug ASC`
      ),
      client.query<BackupPolicyRow>(
        `SELECT
           policies.policy_slug,
           tenants.slug AS tenant_slug,
           policies.target_node_id,
           policies.schedule,
           policies.retention_days,
           policies.storage_location,
           policies.resource_selectors
         FROM shp_backup_policies policies
         INNER JOIN shp_tenants tenants
           ON tenants.tenant_id = policies.tenant_id
         ORDER BY policies.policy_slug ASC`
      )
    ]);

  const recordsByZone = new Map<string, DnsRecordPayload[]>();

  for (const row of recordResult.rows) {
    const records = recordsByZone.get(row.zone_name) ?? [];
    records.push({
      name: row.name,
      type: row.type,
      value: row.value,
      ttl: row.ttl
    });
    recordsByZone.set(row.zone_name, records);
  }

  return {
    tenants: tenantResult.rows.map((row) => ({
      slug: row.slug,
      displayName: row.display_name
    })),
    nodes: nodeResult.rows.map((row) => toInventoryNodeSummary(row)),
    zones: zoneResult.rows.map((row) => ({
      zoneName: row.zone_name,
      tenantSlug: row.tenant_slug,
      primaryNodeId: row.primary_node_id,
      records: normalizeDnsRecords(recordsByZone.get(row.zone_name) ?? [])
    })),
    apps: appResult.rows.map((row) => ({
      slug: row.slug,
      tenantSlug: row.tenant_slug,
      zoneName: row.zone_name,
      primaryNodeId: row.primary_node_id,
      standbyNodeId: row.standby_node_id ?? undefined,
      canonicalDomain: row.canonical_domain,
      aliases: row.aliases,
      backendPort: row.backend_port,
      runtimeImage: row.runtime_image,
      storageRoot: row.storage_root,
      mode: row.mode
    })),
    databases: databaseResult.rows.map((row) => ({
      appSlug: row.app_slug,
      engine: row.engine,
      databaseName: row.database_name,
      databaseUser: row.database_user,
      primaryNodeId: row.primary_node_id,
      standbyNodeId: row.standby_node_id ?? undefined,
      pendingMigrationTo: row.pending_migration_to ?? undefined
    })),
    backupPolicies: backupPolicyResult.rows.map((row) => ({
      policySlug: row.policy_slug,
      tenantSlug: row.tenant_slug,
      targetNodeId: row.target_node_id,
      schedule: row.schedule,
      retentionDays: row.retention_days,
      storageLocation: row.storage_location,
      resourceSelectors: row.resource_selectors
    }))
  };
}

async function applyDesiredStateSpec(
  client: PoolClient,
  spec: DesiredStateSpec,
  payloadKey: Buffer | null
): Promise<void> {
  validateDesiredStateSpec(spec);

  const desiredTenantIds = spec.tenants.map((tenant) => `tenant-${tenant.slug}`);
  const desiredNodeIds = spec.nodes.map((node) => node.nodeId);
  const desiredZoneIds = spec.zones.map((zone) => `zone-${zone.zoneName}`);
  const desiredAppIds = spec.apps.map((app) => `app-${app.slug}`);
  const desiredDatabaseIds = spec.databases.map((database) => `database-${database.appSlug}`);
  const desiredBackupPolicyIds = spec.backupPolicies.map(
    (policy) => `backup-policy-${policy.policySlug}`
  );

  for (const tenant of spec.tenants) {
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
      [`tenant-${tenant.slug}`, tenant.slug, tenant.displayName]
    );
  }

  for (const node of spec.nodes) {
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
      [node.nodeId, node.hostname, node.publicIpv4, node.wireguardAddress]
    );
  }

  for (const zone of spec.zones) {
    const zoneId = `zone-${zone.zoneName}`;

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
      [zoneId, `tenant-${zone.tenantSlug}`, zone.zoneName, zone.primaryNodeId]
    );

    await client.query(`DELETE FROM shp_dns_records WHERE zone_id = $1`, [zoneId]);

    for (const record of normalizeDnsRecords(zone.records)) {
      await client.query(
        `INSERT INTO shp_dns_records (
           record_id,
           zone_id,
           name,
           type,
           value,
           ttl,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (zone_id, name, type, value)
         DO UPDATE SET
           ttl = EXCLUDED.ttl,
           updated_at = EXCLUDED.updated_at`,
        [
          createStableId("record", zone.zoneName, record.name, record.type, record.value),
          zoneId,
          record.name,
          record.type,
          record.value,
          record.ttl
        ]
      );
    }
  }

  for (const app of spec.apps) {
    const appId = `app-${app.slug}`;

    await client.query(
      `INSERT INTO shp_apps (
         app_id,
         tenant_id,
         zone_id,
         primary_node_id,
         standby_node_id,
         slug,
         runtime_image,
         backend_port,
         storage_root,
         mode,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (slug)
       DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         zone_id = EXCLUDED.zone_id,
         primary_node_id = EXCLUDED.primary_node_id,
         standby_node_id = EXCLUDED.standby_node_id,
         runtime_image = EXCLUDED.runtime_image,
         backend_port = EXCLUDED.backend_port,
         storage_root = EXCLUDED.storage_root,
         mode = EXCLUDED.mode,
         updated_at = EXCLUDED.updated_at`,
      [
        appId,
        `tenant-${app.tenantSlug}`,
        `zone-${app.zoneName}`,
        app.primaryNodeId,
        app.standbyNodeId ?? null,
        app.slug,
        app.runtimeImage,
        app.backendPort,
        app.storageRoot,
        app.mode
      ]
    );

    await client.query(`DELETE FROM shp_sites WHERE app_id = $1`, [appId]);

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
      [`site-${app.slug}`, appId, app.canonicalDomain, JSON.stringify(app.aliases)]
    );
  }

  for (const database of spec.databases) {
    const databaseId = `database-${database.appSlug}`;

    await client.query(
      `INSERT INTO shp_databases (
         database_id,
         app_id,
         primary_node_id,
         standby_node_id,
         engine,
         database_name,
         database_user,
         pending_migration_to,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (engine, database_name)
       DO UPDATE SET
         app_id = EXCLUDED.app_id,
         primary_node_id = EXCLUDED.primary_node_id,
         standby_node_id = EXCLUDED.standby_node_id,
         database_user = EXCLUDED.database_user,
         pending_migration_to = EXCLUDED.pending_migration_to,
         updated_at = EXCLUDED.updated_at`,
      [
        databaseId,
        `app-${database.appSlug}`,
        database.primaryNodeId,
        database.standbyNodeId ?? null,
        database.engine,
        database.databaseName,
        database.databaseUser,
        database.pendingMigrationTo ?? null
      ]
    );

    if (database.desiredPassword) {
      await client.query(
        `INSERT INTO shp_database_credentials (
           database_id,
           secret_payload,
           updated_at
         )
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (database_id)
         DO UPDATE SET
           secret_payload = EXCLUDED.secret_payload,
           updated_at = EXCLUDED.updated_at`,
        [
          databaseId,
          JSON.stringify(encodeDesiredPassword(database.desiredPassword, payloadKey))
        ]
      );
    }
  }

  for (const policy of spec.backupPolicies) {
    await client.query(
      `INSERT INTO shp_backup_policies (
         policy_id,
         tenant_id,
         target_node_id,
         policy_slug,
         schedule,
         retention_days,
         storage_location,
         resource_selectors,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
       ON CONFLICT (policy_slug)
       DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         target_node_id = EXCLUDED.target_node_id,
         schedule = EXCLUDED.schedule,
         retention_days = EXCLUDED.retention_days,
         storage_location = EXCLUDED.storage_location,
         resource_selectors = EXCLUDED.resource_selectors,
         updated_at = EXCLUDED.updated_at`,
      [
        `backup-policy-${policy.policySlug}`,
        `tenant-${policy.tenantSlug}`,
        policy.targetNodeId,
        policy.policySlug,
        policy.schedule,
        policy.retentionDays,
        policy.storageLocation,
        JSON.stringify(policy.resourceSelectors)
      ]
    );
  }

  await client.query(
    `DELETE FROM shp_backup_policies
     WHERE NOT (policy_id = ANY($1::text[]))`,
    [desiredBackupPolicyIds]
  );
  await client.query(
    `DELETE FROM shp_database_credentials
     WHERE NOT (database_id = ANY($1::text[]))`,
    [desiredDatabaseIds]
  );
  await client.query(
    `DELETE FROM shp_databases
     WHERE NOT (database_id = ANY($1::text[]))`,
    [desiredDatabaseIds]
  );
  await client.query(
    `DELETE FROM shp_apps
     WHERE NOT (app_id = ANY($1::text[]))`,
    [desiredAppIds]
  );
  await client.query(
    `DELETE FROM shp_dns_zones
     WHERE NOT (zone_id = ANY($1::text[]))`,
    [desiredZoneIds]
  );
  await client.query(
    `DELETE FROM shp_nodes
     WHERE NOT (node_id = ANY($1::text[]))`,
    [desiredNodeIds]
  );
  await client.query(
    `DELETE FROM shp_tenants
     WHERE NOT (tenant_id = ANY($1::text[]))`,
    [desiredTenantIds]
  );
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

function resolveDefaultPrimaryNodeId(inventory: PlatformInventoryDocument): string {
  return inventory.platform.postgresql_shp.primary_node;
}

function resolveAppPrimaryNodeId(
  inventory: PlatformInventoryDocument,
  app: PlatformInventoryApp
): string {
  return app.database.engine === "postgresql"
    ? inventory.platform.postgresql_apps.primary_node
    : inventory.platform.mariadb_apps.primary_node;
}

function resolveAppStandbyNodeId(
  inventory: PlatformInventoryDocument,
  app: PlatformInventoryApp
): string | null {
  if (app.mode !== "active-passive") {
    return null;
  }

  return app.database.engine === "postgresql"
    ? inventory.platform.postgresql_apps.standby_node
    : inventory.platform.mariadb_apps.replica_node;
}

function resolveDatabaseStandbyNodeId(
  inventory: PlatformInventoryDocument,
  app: PlatformInventoryApp
): string | null {
  return app.database.engine === "postgresql"
    ? inventory.platform.postgresql_apps.standby_node
    : inventory.platform.mariadb_apps.replica_node;
}

function normalizeDnsRecords(records: DnsRecordPayload[]): DnsRecordPayload[] {
  const unique = new Map<string, DnsRecordPayload>();

  for (const record of records) {
    const key = `${record.name}:${record.type}:${record.value}:${record.ttl}`;

    if (!unique.has(key)) {
      unique.set(key, {
        name: record.name,
        type: record.type,
        value: record.value,
        ttl: record.ttl
      });
    }
  }

  return [...unique.values()].sort((left, right) =>
    `${left.name}:${left.type}:${left.value}:${left.ttl}`.localeCompare(
      `${right.name}:${right.type}:${right.value}:${right.ttl}`
    )
  );
}

function buildDesiredStateSpecFromInventory(
  inventory: PlatformInventoryDocument
): DesiredStateSpec {
  const tenants: DesiredStateTenantInput[] = [
    ...new Map(
      inventory.apps.map((app) => [
        app.client,
        {
          slug: app.client,
          displayName: titleizeSlug(app.client)
        } satisfies DesiredStateTenantInput
      ])
    ).values()
  ].sort((left, right) => left.slug.localeCompare(right.slug));
  const nodes: DesiredStateNodeInput[] = Object.entries(inventory.nodes)
    .map(([nodeId, node]) => ({
      nodeId,
      hostname: node.hostname,
      publicIpv4: node.public_ipv4,
      wireguardAddress: node.wireguard_address
    }))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const apps: DesiredStateAppInput[] = inventory.apps
    .map((app) => ({
      slug: app.slug,
      tenantSlug: app.client,
      zoneName: app.zone,
      primaryNodeId: resolveAppPrimaryNodeId(inventory, app),
      standbyNodeId: resolveAppStandbyNodeId(inventory, app) ?? undefined,
      canonicalDomain: app.canonical_domain,
      aliases: app.aliases,
      backendPort: app.backend_port,
      runtimeImage: app.runtime_image,
      storageRoot: app.storage_root,
      mode: app.mode
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const zones: DesiredStateZoneInput[] = [...new Set(inventory.apps.map((app) => app.zone))]
    .map((zoneName) => {
      const zoneApps = inventory.apps.filter((app) => app.zone === zoneName);
      const primaryNodeId = resolveDefaultPrimaryNodeId(inventory);
      const publicIpv4 = inventory.nodes[primaryNodeId]?.public_ipv4;

      return {
        zoneName,
        tenantSlug: zoneApps[0]!.client,
        primaryNodeId,
        records: normalizeDnsRecords(
          publicIpv4
            ? buildZoneRecords(
                zoneName,
                publicIpv4,
                zoneApps.map((app) => ({
                  canonical_domain: app.canonical_domain,
                  aliases: app.aliases
                }))
              )
            : []
        )
      };
    })
    .sort((left, right) => left.zoneName.localeCompare(right.zoneName));
  const databases: DesiredStateDatabaseInput[] = inventory.apps
    .map((app) => ({
      appSlug: app.slug,
      engine: app.database.engine,
      databaseName: app.database.name,
      databaseUser: app.database.user,
      primaryNodeId:
        app.database.engine === "postgresql"
          ? inventory.platform.postgresql_apps.primary_node
          : inventory.platform.mariadb_apps.primary_node,
      standbyNodeId: resolveDatabaseStandbyNodeId(inventory, app) ?? undefined,
      pendingMigrationTo: app.database.pending_migration_to
    }))
    .sort((left, right) => left.appSlug.localeCompare(right.appSlug));

  return {
    tenants,
    nodes,
    zones,
    apps,
    databases,
    backupPolicies: []
  };
}

function summarizeDesiredStateSpec(
  spec: DesiredStateSpec
): DesiredStateApplyResponse["summary"] {
  return {
    tenantCount: spec.tenants.length,
    nodeCount: spec.nodes.length,
    zoneCount: spec.zones.length,
    recordCount: spec.zones.reduce((count, zone) => count + zone.records.length, 0),
    appCount: spec.apps.length,
    databaseCount: spec.databases.length,
    backupPolicyCount: spec.backupPolicies.length
  };
}

function ensureUnique(values: string[], label: string): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}.`);
    }

    seen.add(value);
  }
}

function validateDesiredStateSpec(spec: DesiredStateSpec): void {
  ensureUnique(
    spec.tenants.map((tenant) => tenant.slug),
    "tenant slug"
  );
  ensureUnique(
    spec.nodes.map((node) => node.nodeId),
    "node id"
  );
  ensureUnique(
    spec.zones.map((zone) => zone.zoneName),
    "zone name"
  );
  ensureUnique(
    spec.apps.map((app) => app.slug),
    "app slug"
  );
  ensureUnique(
    spec.apps.map((app) => app.canonicalDomain),
    "site canonical domain"
  );
  ensureUnique(
    spec.databases.map((database) => `${database.engine}:${database.databaseName}`),
    "database name"
  );
  ensureUnique(
    spec.databases.map((database) => `${database.engine}:${database.databaseUser}`),
    "database user"
  );
  ensureUnique(
    spec.backupPolicies.map((policy) => policy.policySlug),
    "backup policy slug"
  );

  const tenantSlugs = new Set(spec.tenants.map((tenant) => tenant.slug));
  const nodeIds = new Set(spec.nodes.map((node) => node.nodeId));
  const zonesByName = new Map(spec.zones.map((zone) => [zone.zoneName, zone]));
  const appsBySlug = new Map(spec.apps.map((app) => [app.slug, app]));

  for (const zone of spec.zones) {
    if (!tenantSlugs.has(zone.tenantSlug)) {
      throw new Error(`Zone ${zone.zoneName} references unknown tenant ${zone.tenantSlug}.`);
    }

    if (!nodeIds.has(zone.primaryNodeId)) {
      throw new Error(`Zone ${zone.zoneName} references unknown node ${zone.primaryNodeId}.`);
    }
  }

  for (const app of spec.apps) {
    if (!tenantSlugs.has(app.tenantSlug)) {
      throw new Error(`Application ${app.slug} references unknown tenant ${app.tenantSlug}.`);
    }

    const zone = zonesByName.get(app.zoneName);

    if (!zone) {
      throw new Error(`Application ${app.slug} references unknown zone ${app.zoneName}.`);
    }

    if (zone.tenantSlug !== app.tenantSlug) {
      throw new Error(
        `Application ${app.slug} tenant ${app.tenantSlug} does not match zone tenant ${zone.tenantSlug}.`
      );
    }

    if (!nodeIds.has(app.primaryNodeId)) {
      throw new Error(`Application ${app.slug} references unknown node ${app.primaryNodeId}.`);
    }

    if (app.standbyNodeId && !nodeIds.has(app.standbyNodeId)) {
      throw new Error(
        `Application ${app.slug} references unknown standby node ${app.standbyNodeId}.`
      );
    }
  }

  for (const database of spec.databases) {
    const app = appsBySlug.get(database.appSlug);

    if (!app) {
      throw new Error(
        `Database ${database.databaseName} references unknown application ${database.appSlug}.`
      );
    }

    if (!nodeIds.has(database.primaryNodeId)) {
      throw new Error(
        `Database ${database.databaseName} references unknown node ${database.primaryNodeId}.`
      );
    }

    if (database.standbyNodeId && !nodeIds.has(database.standbyNodeId)) {
      throw new Error(
        `Database ${database.databaseName} references unknown standby node ${database.standbyNodeId}.`
      );
    }

    if (database.engine !== "postgresql" && database.engine !== "mariadb") {
      throw new Error(`Database ${database.databaseName} uses unsupported engine ${database.engine}.`);
    }

    if (database.pendingMigrationTo && database.pendingMigrationTo === database.engine) {
      throw new Error(
        `Database ${database.databaseName} pending migration target matches the current engine.`
      );
    }

    if (app.primaryNodeId !== database.primaryNodeId) {
      throw new Error(
        `Database ${database.databaseName} primary node ${database.primaryNodeId} does not match app ${app.slug} primary node ${app.primaryNodeId}.`
      );
    }
  }

  for (const policy of spec.backupPolicies) {
    if (!tenantSlugs.has(policy.tenantSlug)) {
      throw new Error(
        `Backup policy ${policy.policySlug} references unknown tenant ${policy.tenantSlug}.`
      );
    }

    if (!nodeIds.has(policy.targetNodeId)) {
      throw new Error(
        `Backup policy ${policy.policySlug} references unknown node ${policy.targetNodeId}.`
      );
    }
  }
}

async function buildZoneDnsPayload(
  client: PoolClient,
  zoneName: string
): Promise<{ nodeId: string; payload: DnsSyncPayload }> {
  const zoneResult = await client.query<ZoneDispatchRow>(
    `SELECT
       zones.zone_name,
       zones.primary_node_id,
       nodes.public_ipv4,
       GREATEST(
         zones.updated_at,
         COALESCE(MAX(records.updated_at), zones.updated_at),
         COALESCE(MAX(apps.updated_at), zones.updated_at),
         COALESCE(MAX(sites.updated_at), zones.updated_at)
       ) AS desired_updated_at
     FROM shp_dns_zones zones
     INNER JOIN shp_nodes nodes
       ON nodes.node_id = zones.primary_node_id
     LEFT JOIN shp_dns_records records
       ON records.zone_id = zones.zone_id
     LEFT JOIN shp_apps apps
       ON apps.zone_id = zones.zone_id
     LEFT JOIN shp_sites sites
       ON sites.app_id = apps.app_id
     WHERE zones.zone_name = $1
     GROUP BY
       zones.zone_name,
       zones.primary_node_id,
       nodes.public_ipv4,
       zones.updated_at`,
    [zoneName]
  );
  const zone = zoneResult.rows[0];

  if (!zone) {
    throw new Error(`Zone ${zoneName} does not exist in SHP inventory.`);
  }

  const recordResult = await client.query<InventoryRecordRow>(
    `SELECT
       zones.zone_name,
       records.name,
       records.type,
       records.value,
       records.ttl
     FROM shp_dns_records records
     INNER JOIN shp_dns_zones zones
       ON zones.zone_id = records.zone_id
     WHERE zones.zone_name = $1
     ORDER BY records.name ASC, records.type ASC, records.value ASC`,
    [zoneName]
  );
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
      serial: Math.max(1, Math.floor(new Date(zone.desired_updated_at).getTime() / 1000)),
      nameservers: [`ns1.${zoneName}`, `ns2.${zoneName}`],
      records:
        recordResult.rows.length > 0
          ? normalizeDnsRecords(
              recordResult.rows.map((row) => ({
                name: row.name,
                type: row.type,
                value: row.value,
                ttl: row.ttl
              }))
            )
          : buildZoneRecords(zoneName, zone.public_ipv4, siteResult.rows)
    }
  };
}

async function buildProxyPayload(
  client: PoolClient,
  appSlug: string
): Promise<{
  plans: Array<{ nodeId: string; payload: ProxyRenderPayload }>;
  zoneName: string;
}> {
  const result = await client.query<AppDispatchRow>(
    `SELECT
       apps.app_id,
       apps.slug,
       apps.primary_node_id,
       apps.standby_node_id,
       apps.mode,
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

  const payload: ProxyRenderPayload = {
    vhostName: app.slug,
    serverName: app.canonical_domain,
    serverAliases: app.aliases,
    documentRoot: `${app.storage_root}/current/public`,
    tls: true
  };
  const plans = [
    {
      nodeId: app.primary_node_id,
      payload
    }
  ];

  if (
    app.mode === "active-passive" &&
    app.standby_node_id &&
    app.standby_node_id !== app.primary_node_id
  ) {
    plans.push({
      nodeId: app.standby_node_id,
      payload
    });
  }

  return {
    zoneName: app.zone_name,
    plans
  };
}

async function buildDatabasePayload(
  client: PoolClient,
  appSlug: string,
  password: string | null,
  payloadKey: Buffer | null
): Promise<{
  nodeId: string;
  kind: "postgres.reconcile" | "mariadb.reconcile";
  payload: Record<string, unknown>;
}> {
  const result = await client.query<DatabaseDispatchRow>(
    `SELECT
       apps.slug,
       databases.database_id,
       databases.engine,
       databases.database_name,
       databases.database_user,
       databases.primary_node_id,
       credentials.secret_payload AS desired_password
     FROM shp_databases databases
     INNER JOIN shp_apps apps
       ON apps.app_id = databases.app_id
     LEFT JOIN shp_database_credentials credentials
       ON credentials.database_id = databases.database_id
     WHERE apps.slug = $1`,
    [appSlug]
  );
  const database = result.rows[0];

  if (!database) {
    throw new Error(`Database for application ${appSlug} does not exist in SHP inventory.`);
  }

  const desiredPassword =
    password ?? decodeDesiredPassword(database.desired_password, payloadKey);

  if (!desiredPassword) {
    throw new Error(
      `Database ${database.database_name} does not have a desired password stored in SHP.`
    );
  }

  if (database.engine === "postgresql") {
    return {
      nodeId: database.primary_node_id,
      kind: "postgres.reconcile",
      payload: {
        appSlug: database.slug,
        databaseName: database.database_name,
        roleName: database.database_user,
        password: desiredPassword
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
      password: desiredPassword
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

interface QueuedDispatchJob {
  envelope: DispatchedJobEnvelope;
  resourceKey: string;
  resourceKind: string;
  payloadHash: string;
}

async function insertDispatchedJobs(
  client: PoolClient,
  jobs: QueuedDispatchJob[],
  actorUserId: string | null,
  dispatchReason: string,
  payloadKey: Buffer | null
): Promise<void> {
  const createdAt = new Date().toISOString();

  for (const nodeId of new Set(jobs.map((job) => job.envelope.nodeId))) {
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
         dispatch_reason,
         resource_key,
         resource_kind,
         payload_hash
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)`,
      [
        job.envelope.id,
        job.envelope.desiredStateVersion,
        job.envelope.kind,
        job.envelope.nodeId,
        job.envelope.createdAt,
        JSON.stringify(encodeStoredJobPayload(job.envelope.payload, payloadKey)),
        actorUserId,
        dispatchReason,
        job.resourceKey,
        job.resourceKind,
        job.payloadHash
      ]
    );

    await insertAuditEvent(client, {
      actorType: actorUserId ? "user" : "system",
      actorId: actorUserId ?? "reconciler",
      eventType: "job.dispatched",
      entityType: "job",
      entityId: job.envelope.id,
      payload: {
        kind: job.envelope.kind,
        nodeId: job.envelope.nodeId,
        dispatchReason,
        resourceKey: job.resourceKey
      },
      occurredAt: job.envelope.createdAt
    });
  }
}

function createQueuedDispatchJob(
  envelope: DispatchedJobEnvelope,
  resourceKey: string,
  resourceKind: string
): QueuedDispatchJob {
  const resourceSuffix = createHash("sha256")
    .update(resourceKey)
    .digest("hex")
    .slice(0, 12);

  return {
    envelope: {
      ...envelope,
      id: `${envelope.id}-${resourceSuffix}`
    },
    resourceKey,
    resourceKind,
    payloadHash: hashDesiredPayload(envelope.payload)
  };
}

async function shouldDispatchQueuedJob(
  client: PoolClient,
  job: QueuedDispatchJob
): Promise<boolean> {
  const result = await client.query<DriftStatusRow>(
    `SELECT
       jobs.id,
       jobs.payload_hash,
       jobs.completed_at,
       results.status
       ,
       results.summary
     FROM control_plane_jobs jobs
     LEFT JOIN control_plane_job_results results
       ON results.job_id = jobs.id
     WHERE jobs.node_id = $1
       AND jobs.kind = $2
       AND jobs.resource_key = $3
     ORDER BY jobs.created_at DESC
     LIMIT 1`,
    [job.envelope.nodeId, job.envelope.kind, job.resourceKey]
  );
  const latest = result.rows[0];

  if (!latest) {
    return true;
  }

  if (!latest.completed_at) {
    return latest.payload_hash !== job.payloadHash;
  }

  if (latest.payload_hash !== job.payloadHash) {
    return true;
  }

  return latest.status !== "applied";
}

async function getLatestResourceJob(
  client: PoolClient,
  job: QueuedDispatchJob
): Promise<DriftStatusRow | null> {
  const result = await client.query<DriftStatusRow>(
    `SELECT
       jobs.id,
       jobs.payload_hash,
       jobs.completed_at,
       results.status,
       results.summary
     FROM control_plane_jobs jobs
     LEFT JOIN control_plane_job_results results
       ON results.job_id = jobs.id
     WHERE jobs.node_id = $1
       AND jobs.kind = $2
       AND jobs.resource_key = $3
     ORDER BY jobs.created_at DESC
     LIMIT $4`,
    [job.envelope.nodeId, job.envelope.kind, job.resourceKey, 1]
  );

  return result.rows[0] ?? null;
}

function createResourceDriftSummary(
  job: QueuedDispatchJob,
  latest: DriftStatusRow | null
): ResourceDriftSummary {
  if (!latest) {
    return {
      resourceKind: job.resourceKind as ResourceDriftSummary["resourceKind"],
      resourceKey: job.resourceKey,
      nodeId: job.envelope.nodeId,
      driftStatus: "out_of_sync",
      desiredPayloadHash: job.payloadHash,
      dispatchRecommended: true
    };
  }

  if (!latest.completed_at) {
    return {
      resourceKind: job.resourceKind as ResourceDriftSummary["resourceKind"],
      resourceKey: job.resourceKey,
      nodeId: job.envelope.nodeId,
      driftStatus: "pending",
      desiredPayloadHash: job.payloadHash,
      latestPayloadHash: latest.payload_hash ?? undefined,
      latestJobId: latest.id,
      dispatchRecommended: latest.payload_hash !== job.payloadHash
    };
  }

  if (latest.payload_hash !== job.payloadHash) {
    return {
      resourceKind: job.resourceKind as ResourceDriftSummary["resourceKind"],
      resourceKey: job.resourceKey,
      nodeId: job.envelope.nodeId,
      driftStatus: "out_of_sync",
      desiredPayloadHash: job.payloadHash,
      latestPayloadHash: latest.payload_hash ?? undefined,
      latestJobId: latest.id,
      latestJobStatus: (latest.status as ResourceDriftSummary["latestJobStatus"]) ?? undefined,
      latestSummary: latest.summary ?? undefined,
      dispatchRecommended: true
    };
  }

  if (latest.status !== "applied") {
    return {
      resourceKind: job.resourceKind as ResourceDriftSummary["resourceKind"],
      resourceKey: job.resourceKey,
      nodeId: job.envelope.nodeId,
      driftStatus: "failed",
      desiredPayloadHash: job.payloadHash,
      latestPayloadHash: latest.payload_hash ?? undefined,
      latestJobId: latest.id,
      latestJobStatus: (latest.status as ResourceDriftSummary["latestJobStatus"]) ?? undefined,
      latestSummary: latest.summary ?? undefined,
      dispatchRecommended: true
    };
  }

  return {
    resourceKind: job.resourceKind as ResourceDriftSummary["resourceKind"],
    resourceKey: job.resourceKey,
    nodeId: job.envelope.nodeId,
    driftStatus: "in_sync",
    desiredPayloadHash: job.payloadHash,
    latestPayloadHash: latest.payload_hash ?? undefined,
    latestJobId: latest.id,
    latestJobStatus: "applied",
    latestSummary: latest.summary ?? undefined,
    dispatchRecommended: false
  };
}

async function getLatestReconciliationRun(
  client: PoolClient
): Promise<ReconciliationRunSummary | null> {
  const result = await client.query<ReconciliationRunRow>(
    `SELECT
       run_id,
       desired_state_version,
       generated_job_count,
       skipped_job_count,
       missing_credential_count,
       summary,
       started_at,
       completed_at
     FROM shp_reconciliation_runs
     ORDER BY completed_at DESC
     LIMIT 1`
  );

  return result.rows[0] ? toReconciliationRunSummary(result.rows[0]) : null;
}

async function buildReconciliationCandidates(
  client: PoolClient,
  payloadKey: Buffer | null,
  desiredStateVersion: string
): Promise<{ jobs: QueuedDispatchJob[]; missingCredentialCount: number }> {
  const jobs: QueuedDispatchJob[] = [];
  let missingCredentialCount = 0;
  const zoneResult = await client.query<{ zone_name: string }>(
    `SELECT zone_name
     FROM shp_dns_zones
     ORDER BY zone_name ASC`
  );

  for (const row of zoneResult.rows) {
    const plan = await buildZoneDnsPayload(client, row.zone_name);

    if (plan.payload.records.length === 0) {
      continue;
    }

    jobs.push(
      createQueuedDispatchJob(
        createDispatchedJobEnvelope(
          "dns.sync",
          plan.nodeId,
          desiredStateVersion,
          plan.payload as unknown as Record<string, unknown>
        ),
        `zone:${row.zone_name}`,
        "dns"
      )
    );
  }

  const appResult = await client.query<{ slug: string }>(
    `SELECT slug
     FROM shp_apps
     ORDER BY slug ASC`
  );

  for (const row of appResult.rows) {
    const plan = await buildProxyPayload(client, row.slug);

    for (const target of plan.plans) {
      jobs.push(
        createQueuedDispatchJob(
          createDispatchedJobEnvelope(
            "proxy.render",
            target.nodeId,
            desiredStateVersion,
            target.payload as unknown as Record<string, unknown>
          ),
          `app:${row.slug}:proxy:${target.nodeId}`,
          "site"
        )
      );
    }
  }

  const databaseResult = await client.query<{ slug: string }>(
    `SELECT apps.slug
     FROM shp_databases databases
     INNER JOIN shp_apps apps
       ON apps.app_id = databases.app_id
     ORDER BY apps.slug ASC`
  );

  for (const row of databaseResult.rows) {
    try {
      const plan = await buildDatabasePayload(client, row.slug, null, payloadKey);
      jobs.push(
        createQueuedDispatchJob(
          createDispatchedJobEnvelope(
            plan.kind,
            plan.nodeId,
            desiredStateVersion,
            plan.payload
          ),
          `database:${row.slug}`,
          "database"
        )
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("does not have a desired password stored in SHP")
      ) {
        missingCredentialCount += 1;
        continue;
      }

      throw error;
    }
  }

  return {
    jobs,
    missingCredentialCount
  };
}

export async function createPostgresControlPlaneStore(
  databaseUrl: string,
  options: PanelControlPlaneStoreOptions
): Promise<PanelControlPlaneStore> {
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const jobPayloadKey = deriveJobPayloadKey(options.jobPayloadSecret);
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
             runtime_snapshot,
             accepted_at,
             last_seen_at
           )
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6)
           ON CONFLICT (node_id)
           DO UPDATE SET
             hostname = EXCLUDED.hostname,
             version = EXCLUDED.version,
             supported_job_kinds = EXCLUDED.supported_job_kinds,
             runtime_snapshot = EXCLUDED.runtime_snapshot,
             last_seen_at = EXCLUDED.last_seen_at`,
          [
            request.nodeId,
            request.hostname,
            request.version,
            JSON.stringify(request.supportedJobKinds),
            JSON.stringify(request.runtimeSnapshot ?? {}),
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
               runtime_snapshot = $4::jsonb,
               last_seen_at = $5
           WHERE node_id = $1`,
          [
            request.nodeId,
            request.hostname,
            request.version,
            JSON.stringify(request.runtimeSnapshot ?? {}),
            claimedAt
          ]
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

        return result.rows.map((row) =>
          toDispatchedJob(row, jobPayloadKey, { sanitizeSecrets: false })
        );
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

        if (
          request.result.kind === "code-server.update" &&
          request.result.details &&
          typeof request.result.details === "object" &&
          !Array.isArray(request.result.details) &&
          "after" in request.result.details
        ) {
          const afterSnapshot = (request.result.details as Record<string, unknown>).after;

          if (afterSnapshot && typeof afterSnapshot === "object" && !Array.isArray(afterSnapshot)) {
            await client.query(
              `UPDATE control_plane_nodes
               SET runtime_snapshot = jsonb_set(
                     COALESCE(runtime_snapshot, '{}'::jsonb),
                     '{codeServer}',
                     $2::jsonb,
                     true
                   )
               WHERE node_id = $1`,
              [request.nodeId, JSON.stringify(afterSnapshot)]
            );
          }
        }

        const jobResult = await client.query<JobRow>(
          `SELECT
             id,
             desired_state_version,
             kind,
             node_id,
             created_at,
             payload
           FROM control_plane_jobs
           WHERE id = $1`,
          [request.result.jobId]
        );
        const storedJob = jobResult.rows[0];

        if (!storedJob) {
          throw new Error(`Claimed job ${request.result.jobId} no longer exists.`);
        }

        await client.query(
          `UPDATE control_plane_jobs
           SET completed_at = $2,
               payload = $3::jsonb
           WHERE id = $1`,
          [
            request.result.jobId,
            request.result.completedAt,
            JSON.stringify(
              stripSensitivePayloadFields(
                decodeStoredJobPayload(storedJob.payload, jobPayloadKey)
              )
            )
          ]
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
      const desiredStateSpec = buildDesiredStateSpecFromInventory(inventory);
      const importedAt = new Date().toISOString();
      const importId = `import-${randomUUID()}`;

      return withTransaction(pool, async (client) => {
        const actor = await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        await applyDesiredStateSpec(client, desiredStateSpec, jobPayloadKey);
        const desiredSummary = summarizeDesiredStateSpec(desiredStateSpec);
        const summary = {
          tenantCount: desiredSummary.tenantCount,
          nodeCount: desiredSummary.nodeCount,
          zoneCount: desiredSummary.zoneCount,
          appCount: desiredSummary.appCount,
          siteCount: desiredSummary.appCount,
          databaseCount: desiredSummary.databaseCount
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

    async applyDesiredState(request, presentedToken) {
      const appliedAt = new Date().toISOString();
      const desiredStateVersion = createDesiredStateVersion();

      return withTransaction(pool, async (client) => {
        const actor = await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        await applyDesiredStateSpec(client, request.spec, jobPayloadKey);
        const summary = summarizeDesiredStateSpec(request.spec);

        await insertAuditEvent(client, {
          actorType: "user",
          actorId: actor.userId,
          eventType: "desired_state.applied",
          entityType: "desired_state",
          entityId: desiredStateVersion,
          payload: {
            summary,
            reason: request.reason ?? null
          },
          occurredAt: appliedAt
        });

        return {
          appliedAt,
          desiredStateVersion,
          summary
        };
      });
    },

    async exportDesiredState(presentedToken) {
      return withTransaction(pool, async (client) => {
        await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);

        const spec = await buildDesiredStateSpecFromDatabase(client);

        return {
          exportedAt: new Date().toISOString(),
          spec,
          yaml: YAML.stringify(spec)
        };
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
          createQueuedDispatchJob(
            createDispatchedJobEnvelope(
              "dns.sync",
              nodeId,
              desiredStateVersion,
              payload as unknown as Record<string, unknown>
            ),
            `zone:${zoneName}`,
            "dns"
          )
        ];

        await insertDispatchedJobs(
          client,
          jobs,
          actor.userId,
          `dns.sync:${zoneName}`,
          jobPayloadKey
        );

        return {
          desiredStateVersion,
          jobs: jobs.map((job) => ({
            ...job.envelope,
            payload: sanitizePayload(job.envelope.payload) as Record<string, unknown>
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
        const jobs: QueuedDispatchJob[] = [];
        const includeDns = request.includeDns ?? true;
        const includeProxy = request.includeProxy ?? true;
        const includeStandbyProxy = request.includeStandbyProxy ?? true;
        const proxyPlan = await buildProxyPayload(client, appSlug);

        if (includeProxy) {
          const primaryNodeId = proxyPlan.plans[0]?.nodeId;

          for (const plan of proxyPlan.plans) {
            if (!includeStandbyProxy && plan.nodeId !== primaryNodeId) {
              continue;
            }

            jobs.push(
              createQueuedDispatchJob(
                createDispatchedJobEnvelope(
                  "proxy.render",
                  plan.nodeId,
                  desiredStateVersion,
                  plan.payload as unknown as Record<string, unknown>
                ),
                `app:${appSlug}:proxy:${plan.nodeId}`,
                "site"
              )
            );
          }
        }

        if (includeDns) {
          const dnsPlan = await buildZoneDnsPayload(client, proxyPlan.zoneName);

          jobs.push(
            createQueuedDispatchJob(
              createDispatchedJobEnvelope(
                "dns.sync",
                dnsPlan.nodeId,
                desiredStateVersion,
                dnsPlan.payload as unknown as Record<string, unknown>
              ),
              `zone:${proxyPlan.zoneName}`,
              "dns"
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
          `app.reconcile:${appSlug}`,
          jobPayloadKey
        );

        return {
          desiredStateVersion,
          jobs: jobs.map((job) => ({
            ...job.envelope,
            payload: sanitizePayload(job.envelope.payload) as Record<string, unknown>
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
        const databasePlan = await buildDatabasePayload(
          client,
          appSlug,
          request.password ?? null,
          jobPayloadKey
        );

        if (request.password) {
          await client.query(
            `INSERT INTO shp_database_credentials (
               database_id,
               secret_payload,
               updated_at
             )
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (database_id)
             DO UPDATE SET
               secret_payload = EXCLUDED.secret_payload,
               updated_at = EXCLUDED.updated_at`,
            [
              `database-${appSlug}`,
              JSON.stringify(encodeDesiredPassword(request.password, jobPayloadKey))
            ]
          );
        }

        const jobs = [
          createQueuedDispatchJob(
            createDispatchedJobEnvelope(
              databasePlan.kind,
              databasePlan.nodeId,
              desiredStateVersion,
              databasePlan.payload
            ),
            `database:${appSlug}`,
            "database"
          )
        ];

        await insertDispatchedJobs(
          client,
          jobs,
          actor.userId,
          `database.reconcile:${appSlug}`,
          jobPayloadKey
        );

        return {
          desiredStateVersion,
          jobs: jobs.map((job) => ({
            ...job.envelope,
            payload: sanitizePayload(job.envelope.payload) as Record<string, unknown>
          }))
        };
      });
    },

    async dispatchCodeServerUpdate(request, presentedToken) {
      return withTransaction(pool, async (client) => {
        const actor = await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        const rpmUrl = request.rpmUrl.trim();

        if (!/^https?:\/\//i.test(rpmUrl)) {
          throw new Error("code-server RPM URL must be an absolute http(s) URL.");
        }

        const desiredStateVersion = createDesiredStateVersion();
        const requestedNodeIds = Array.from(
          new Set((request.nodeIds ?? []).map((value) => value.trim()).filter(Boolean))
        );
        const nodeResult = requestedNodeIds.length > 0
          ? await client.query<{ node_id: string }>(
              `SELECT node_id
               FROM shp_nodes
               WHERE node_id = ANY($1::text[])
               ORDER BY node_id ASC`,
              [requestedNodeIds]
            )
          : await client.query<{ node_id: string }>(
              `SELECT node_id
               FROM shp_nodes
               ORDER BY node_id ASC`
            );
        const targetNodeIds = nodeResult.rows.map((row) => row.node_id);

        if (requestedNodeIds.length > 0 && targetNodeIds.length !== requestedNodeIds.length) {
          const missingNodeIds = requestedNodeIds.filter(
            (nodeId) => !targetNodeIds.includes(nodeId)
          );
          throw new Error(
            `Unknown target node(s): ${missingNodeIds.join(", ")}.`
          );
        }

        if (targetNodeIds.length === 0) {
          throw new Error("No managed nodes are available for code-server updates.");
        }

        const jobs = targetNodeIds.map((nodeId) =>
          createQueuedDispatchJob(
            createDispatchedJobEnvelope(
              "code-server.update",
              nodeId,
              desiredStateVersion,
              {
                rpmUrl,
                expectedSha256: request.expectedSha256
              } satisfies CodeServerUpdatePayload
            ),
            `node:${nodeId}:code-server`,
            "service"
          )
        );

        await insertDispatchedJobs(
          client,
          jobs,
          actor.userId,
          `code-server.update:${requestedNodeIds.length > 0 ? requestedNodeIds.join(",") : "all"}`,
          jobPayloadKey
        );

        await insertAuditEvent(client, {
          actorType: "user",
          actorId: actor.userId,
          eventType: "code_server.update.requested",
          entityType: "service",
          entityId: "code-server",
          payload: {
            nodeIds: targetNodeIds,
            rpmUrl
          }
        });

        return {
          desiredStateVersion,
          jobs: jobs.map((job) => ({
            ...job.envelope,
            payload: sanitizePayload(job.envelope.payload) as Record<string, unknown>
          }))
        };
      });
    },

    async runReconciliationCycle(presentedToken) {
      const startedAt = new Date().toISOString();
      const desiredStateVersion = createDesiredStateVersion();
      const runId = `reconcile-${randomUUID()}`;

      return withTransaction(pool, async (client) => {
        if (presentedToken) {
          await requireAuthorizedUser(client, presentedToken, [
            "platform_admin",
            "platform_operator"
          ]);
        }

        const { jobs: candidates, missingCredentialCount } =
          await buildReconciliationCandidates(client, jobPayloadKey, desiredStateVersion);
        const jobsToDispatch: QueuedDispatchJob[] = [];
        let skippedJobCount = 0;

        for (const candidate of candidates) {
          if (await shouldDispatchQueuedJob(client, candidate)) {
            jobsToDispatch.push(candidate);
          } else {
            skippedJobCount += 1;
          }
        }

        if (jobsToDispatch.length > 0) {
          await insertDispatchedJobs(
            client,
            jobsToDispatch,
            null,
            "worker.reconcile",
            jobPayloadKey
          );
        }

        const completedAt = new Date().toISOString();

        await client.query(
          `INSERT INTO shp_reconciliation_runs (
             run_id,
             desired_state_version,
             generated_job_count,
             skipped_job_count,
             missing_credential_count,
             summary,
             started_at,
             completed_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
          [
            runId,
            desiredStateVersion,
            jobsToDispatch.length,
            skippedJobCount,
            missingCredentialCount,
            JSON.stringify({
              jobs: jobsToDispatch.map((job) => ({
                ...job.envelope,
                payload: sanitizePayload(job.envelope.payload)
              }))
            }),
            startedAt,
            completedAt
          ]
        );

        return {
          runId,
          desiredStateVersion,
          startedAt,
          completedAt,
          generatedJobCount: jobsToDispatch.length,
          skippedJobCount,
          missingCredentialCount,
          jobs: jobsToDispatch.map((job) => ({
            ...job.envelope,
            payload: sanitizePayload(job.envelope.payload) as Record<string, unknown>
          }))
        };
      });
    },

    async getOperationsOverview(presentedToken) {
      return withTransaction(pool, async (client) => {
        if (presentedToken) {
          await requireAuthorizedUser(client, presentedToken, [
            "platform_admin",
            "platform_operator"
          ]);
        }

        const drift = await (async () => {
          const { jobs, missingCredentialCount } = await buildReconciliationCandidates(
            client,
            jobPayloadKey,
            `drift-${Date.now()}`
          );
          const summaries: ResourceDriftSummary[] = [];

          for (const job of jobs) {
            summaries.push(createResourceDriftSummary(job, await getLatestResourceJob(client, job)));
          }

          if (missingCredentialCount > 0) {
            const missingDatabases = await client.query<{ slug: string }>(
              `SELECT apps.slug
               FROM shp_databases databases
               INNER JOIN shp_apps apps
                 ON apps.app_id = databases.app_id
               LEFT JOIN shp_database_credentials credentials
                 ON credentials.database_id = databases.database_id
               WHERE credentials.database_id IS NULL
               ORDER BY apps.slug ASC`
            );

            for (const row of missingDatabases.rows) {
              summaries.push({
                resourceKind: "database",
                resourceKey: `database:${row.slug}`,
                nodeId: "unknown",
                driftStatus: "missing_secret",
                dispatchRecommended: false
              });
            }
          }

          return summaries;
        })();
        const [nodeCountResult, pendingJobCountResult, failedJobCountResult, backupPolicyCountResult, latestReconciliation] =
          await Promise.all([
            client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM shp_nodes`),
            client.query<{ count: string }>(
              `SELECT COUNT(*) AS count
               FROM control_plane_jobs
               WHERE completed_at IS NULL`
            ),
            client.query<{ count: string }>(
              `SELECT COUNT(*) AS count
               FROM control_plane_job_results
               WHERE status = 'failed'`
            ),
            client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM shp_backup_policies`),
            getLatestReconciliationRun(client)
          ]);

        return {
          generatedAt: new Date().toISOString(),
          nodeCount: Number(nodeCountResult.rows[0]?.count ?? 0),
          pendingJobCount: Number(pendingJobCountResult.rows[0]?.count ?? 0),
          failedJobCount: Number(failedJobCountResult.rows[0]?.count ?? 0),
          backupPolicyCount: Number(backupPolicyCountResult.rows[0]?.count ?? 0),
          driftedResourceCount: drift.filter((item) => item.driftStatus !== "in_sync").length,
          latestReconciliation: latestReconciliation ?? undefined
        };
      });
    },

    async getResourceDrift(presentedToken) {
      return withTransaction(pool, async (client) => {
        await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        const { jobs, missingCredentialCount } = await buildReconciliationCandidates(
          client,
          jobPayloadKey,
          `drift-${Date.now()}`
        );
        const summaries: ResourceDriftSummary[] = [];

        for (const job of jobs) {
          summaries.push(createResourceDriftSummary(job, await getLatestResourceJob(client, job)));
        }

        if (missingCredentialCount > 0) {
          const missingDatabases = await client.query<{ slug: string; primary_node_id: string }>(
            `SELECT apps.slug, databases.primary_node_id
             FROM shp_databases databases
             INNER JOIN shp_apps apps
               ON apps.app_id = databases.app_id
             LEFT JOIN shp_database_credentials credentials
               ON credentials.database_id = databases.database_id
             WHERE credentials.database_id IS NULL
             ORDER BY apps.slug ASC`
          );

          for (const row of missingDatabases.rows) {
            summaries.push({
              resourceKind: "database",
              resourceKey: `database:${row.slug}`,
              nodeId: row.primary_node_id,
              driftStatus: "missing_secret",
              dispatchRecommended: false
            });
          }
        }

        return summaries.sort((left, right) =>
          `${left.resourceKind}:${left.resourceKey}:${left.nodeId}`.localeCompare(
            `${right.resourceKind}:${right.resourceKey}:${right.nodeId}`
          )
        );
      });
    },

    async getNodeHealth(presentedToken) {
      return withTransaction(pool, async (client) => {
        await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);

        const result = await client.query<NodeHealthRow>(
          `SELECT
             nodes.node_id,
             nodes.hostname,
             control.version AS current_version,
             control.runtime_snapshot,
             control.last_seen_at,
             COALESCE(pending.pending_job_count, 0) AS pending_job_count,
             0 AS drifted_resource_count,
             COALESCE(zones.primary_zone_count, 0) AS primary_zone_count,
             COALESCE(apps.primary_app_count, 0) AS primary_app_count,
             COALESCE(backups.backup_policy_count, 0) AS backup_policy_count,
             latest.status AS latest_job_status,
             latest.summary AS latest_job_summary
           FROM shp_nodes nodes
           LEFT JOIN control_plane_nodes control
             ON control.node_id = nodes.node_id
           LEFT JOIN (
             SELECT node_id, COUNT(*) AS pending_job_count
             FROM control_plane_jobs
             WHERE completed_at IS NULL
             GROUP BY node_id
           ) pending
             ON pending.node_id = nodes.node_id
           LEFT JOIN (
             SELECT primary_node_id AS node_id, COUNT(*) AS primary_zone_count
             FROM shp_dns_zones
             GROUP BY primary_node_id
           ) zones
             ON zones.node_id = nodes.node_id
           LEFT JOIN (
             SELECT primary_node_id AS node_id, COUNT(*) AS primary_app_count
             FROM shp_apps
             GROUP BY primary_node_id
           ) apps
             ON apps.node_id = nodes.node_id
           LEFT JOIN (
             SELECT target_node_id AS node_id, COUNT(*) AS backup_policy_count
             FROM shp_backup_policies
             GROUP BY target_node_id
           ) backups
             ON backups.node_id = nodes.node_id
           LEFT JOIN (
             SELECT DISTINCT ON (jobs.node_id)
               jobs.node_id,
               results.status,
               results.summary
             FROM control_plane_jobs jobs
             INNER JOIN control_plane_job_results results
               ON results.job_id = jobs.id
             ORDER BY jobs.node_id, results.completed_at DESC
           ) latest
             ON latest.node_id = nodes.node_id
           ORDER BY nodes.node_id ASC`
        );

        return result.rows.map(toNodeHealthSnapshot);
      });
    },

    async listJobHistory(presentedToken, limit = 50) {
      return withTransaction(pool, async (client) => {
        await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        const boundedLimit = Math.max(1, Math.min(limit, 200));
        const result = await client.query<JobHistoryRow>(
          `SELECT
             jobs.id,
             jobs.desired_state_version,
             jobs.kind,
             jobs.node_id,
             jobs.created_at,
             jobs.claimed_at,
             jobs.completed_at,
             jobs.payload,
             results.status,
             results.summary,
             results.details,
             jobs.dispatch_reason,
             jobs.resource_key
           FROM control_plane_jobs jobs
           LEFT JOIN control_plane_job_results results
             ON results.job_id = jobs.id
           ORDER BY jobs.created_at DESC
           LIMIT $1`,
          [boundedLimit]
        );

        return result.rows.map((row) => toJobHistoryEntry(row, jobPayloadKey));
      });
    },

    async listAuditEvents(presentedToken, limit = 50) {
      return withTransaction(pool, async (client) => {
        await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        const boundedLimit = Math.max(1, Math.min(limit, 200));
        const result = await client.query<AuditEventRow>(
          `SELECT
             event_id,
             actor_type,
             actor_id,
             event_type,
             entity_type,
             entity_id,
             payload,
             occurred_at
           FROM shp_audit_events
           ORDER BY occurred_at DESC
           LIMIT $1`,
          [boundedLimit]
        );

        return result.rows.map(toAuditEventSummary);
      });
    },

    async getBackupsOverview(presentedToken) {
      return withTransaction(pool, async (client) => {
        await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        const [policyResult, runResult] = await Promise.all([
          client.query<BackupPolicyRow>(
            `SELECT
               policies.policy_slug,
               tenants.slug AS tenant_slug,
               policies.target_node_id,
               policies.schedule,
               policies.retention_days,
               policies.storage_location,
               policies.resource_selectors
             FROM shp_backup_policies policies
             INNER JOIN shp_tenants tenants
               ON tenants.tenant_id = policies.tenant_id
             ORDER BY policies.policy_slug ASC`
          ),
          client.query<BackupRunRow>(
            `SELECT DISTINCT ON (policies.policy_slug)
               runs.run_id,
               policies.policy_slug,
               runs.node_id,
               runs.status,
               runs.summary,
               runs.started_at,
               runs.completed_at
             FROM shp_backup_runs runs
             INNER JOIN shp_backup_policies policies
               ON policies.policy_id = runs.policy_id
             ORDER BY policies.policy_slug ASC, runs.started_at DESC`
          )
        ]);

        return {
          policies: policyResult.rows.map(toBackupPolicySummary),
          latestRuns: runResult.rows.map(toBackupRunSummary)
        };
      });
    },

    async recordBackupRun(request, presentedToken) {
      const startedAt = new Date().toISOString();

      return withTransaction(pool, async (client) => {
        await requireAuthorizedUser(client, presentedToken, [
          "platform_admin",
          "platform_operator"
        ]);
        const runId = `backup-run-${randomUUID()}`;

        await client.query(
          `INSERT INTO shp_backup_runs (
             run_id,
             policy_id,
             node_id,
             status,
             summary,
             started_at,
             completed_at,
             details
           )
           VALUES (
             $1,
             (SELECT policy_id FROM shp_backup_policies WHERE policy_slug = $2),
             $3,
             $4,
             $5,
             $6,
             $7,
             '{}'::jsonb
           )`,
          [
            runId,
            request.policySlug,
            request.nodeId,
            request.status,
            request.summary,
            startedAt,
            request.completedAt ?? null
          ]
        );

        return {
          runId,
          policySlug: request.policySlug,
          nodeId: request.nodeId,
          status: request.status,
          summary: request.summary,
          startedAt,
          completedAt: request.completedAt
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
        const job = toDispatchedJob(row, jobPayloadKey);
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
