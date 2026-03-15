export type PanelServiceName = "api" | "web" | "worker";
export type PanelHealthStatus = "ok" | "degraded";
export const panelGlobalRoles = ["platform_admin", "platform_operator"] as const;
export type PanelGlobalRole = (typeof panelGlobalRoles)[number];
export const tenantMembershipRoles = [
  "tenant_owner",
  "tenant_admin",
  "tenant_readonly"
] as const;
export type TenantMembershipRole = (typeof tenantMembershipRoles)[number];
export type PlannedResourceKind =
  | "dns"
  | "site"
  | "certificate"
  | "app"
  | "database"
  | "backup";
export const dispatchedJobKinds = [
  "dns.sync",
  "proxy.render",
  "certificate.renew",
  "container.reconcile",
  "postgres.reconcile",
  "mariadb.reconcile",
  "code-server.update",
  "backup.trigger",
  "mail.sync"
] as const;

export type DispatchedJobKind = (typeof dispatchedJobKinds)[number];
export type DispatchedJobStatus = "applied" | "skipped" | "failed";

export interface ProxyRenderPayload {
  vhostName: string;
  serverName: string;
  serverAliases?: string[];
  documentRoot: string;
  tls?: boolean;
}

export interface DnsRecordPayload {
  name: string;
  type: "A" | "AAAA" | "CNAME" | "TXT";
  value: string;
  ttl: number;
}

export interface DnsSyncPayload {
  zoneName: string;
  serial: number;
  nameservers: string[];
  records: DnsRecordPayload[];
}

export interface PostgresReconcilePayload {
  appSlug: string;
  databaseName: string;
  roleName: string;
  password: string;
}

export interface MariadbReconcilePayload {
  appSlug: string;
  databaseName: string;
  userName: string;
  password: string;
}

export interface CodeServerUpdatePayload {
  rpmUrl: string;
  expectedSha256?: string;
}

export interface CodeServerServiceSnapshot {
  serviceName: string;
  enabled: boolean;
  active: boolean;
  version?: string;
  bindAddress?: string;
  authMode?: string;
  settingsProfileHash?: string;
  checkedAt: string;
}

export interface NodeRuntimeSnapshot {
  codeServer?: CodeServerServiceSnapshot;
}

export interface PanelHealthSnapshot {
  service: PanelServiceName;
  status: PanelHealthStatus;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
}

export interface PlannedOperation {
  resource: PlannedResourceKind;
  action: string;
  nodeId: string;
  summary: string;
}

export interface PlannedJobEnvelope {
  id: string;
  desiredStateVersion: string;
  nodeId: string;
  operations: PlannedOperation[];
  createdAt: string;
}

export interface DispatchedJobEnvelope {
  id: string;
  desiredStateVersion: string;
  kind: DispatchedJobKind;
  nodeId: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface NodeRegistrationRequest {
  nodeId: string;
  hostname: string;
  version: string;
  supportedJobKinds: DispatchedJobKind[];
  generatedAt: string;
  runtimeSnapshot?: NodeRuntimeSnapshot;
}

export interface NodeRegistrationResponse {
  nodeId: string;
  acceptedAt: string;
  pollIntervalMs: number;
  nodeToken?: string;
}

export interface JobClaimRequest {
  nodeId: string;
  hostname: string;
  version: string;
  maxJobs: number;
  runtimeSnapshot?: NodeRuntimeSnapshot;
}

export interface JobClaimResponse {
  nodeId: string;
  claimedAt: string;
  jobs: DispatchedJobEnvelope[];
}

export interface ReportedJobResult {
  jobId: string;
  kind: DispatchedJobKind;
  nodeId: string;
  status: DispatchedJobStatus;
  summary: string;
  details?: Record<string, unknown>;
  completedAt: string;
}

export interface JobReportRequest {
  nodeId: string;
  result: ReportedJobResult;
}

export interface TenantMembershipSummary {
  tenantId: string;
  tenantSlug: string;
  tenantDisplayName: string;
  role: TenantMembershipRole;
}

export interface AuthenticatedUserSummary {
  userId: string;
  email: string;
  displayName: string;
  status: string;
  globalRoles: PanelGlobalRole[];
  tenantMemberships: TenantMembershipSummary[];
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthLoginResponse {
  sessionToken: string;
  expiresAt: string;
  user: AuthenticatedUserSummary;
}

export interface AuthLogoutResponse {
  revoked: true;
}

export interface CreateUserTenantMembershipInput {
  tenantSlug: string;
  role: TenantMembershipRole;
}

export interface CreateUserRequest {
  email: string;
  displayName: string;
  password: string;
  globalRoles?: PanelGlobalRole[];
  tenantMemberships?: CreateUserTenantMembershipInput[];
}

export interface CreateUserResponse {
  user: AuthenticatedUserSummary;
}

export interface InventoryImportRequest {
  path?: string;
}

export interface InventoryImportSummary {
  importId: string;
  sourcePath: string;
  importedAt: string;
  tenantCount: number;
  nodeCount: number;
  zoneCount: number;
  appCount: number;
  siteCount: number;
  databaseCount: number;
}

export interface InventoryNodeSummary {
  nodeId: string;
  hostname: string;
  publicIpv4: string;
  wireguardAddress: string;
}

export interface InventoryZoneSummary {
  zoneName: string;
  tenantSlug: string;
  primaryNodeId: string;
}

export interface InventoryAppSummary {
  slug: string;
  tenantSlug: string;
  zoneName: string;
  primaryNodeId: string;
  standbyNodeId?: string;
  canonicalDomain: string;
  aliases: string[];
  backendPort: number;
  runtimeImage: string;
  storageRoot: string;
  mode: string;
}

export interface InventoryDatabaseSummary {
  appSlug: string;
  engine: "postgresql" | "mariadb";
  databaseName: string;
  databaseUser: string;
  primaryNodeId: string;
  standbyNodeId?: string;
  pendingMigrationTo?: "postgresql" | "mariadb";
}

export interface InventoryStateSnapshot {
  latestImport: InventoryImportSummary | null;
  nodes: InventoryNodeSummary[];
  zones: InventoryZoneSummary[];
  apps: InventoryAppSummary[];
  databases: InventoryDatabaseSummary[];
}

export interface AppReconcileRequest {
  includeDns?: boolean;
  includeProxy?: boolean;
  includeStandbyProxy?: boolean;
}

export interface DatabaseReconcileRequest {
  password?: string;
}

export interface CodeServerUpdateRequest {
  rpmUrl: string;
  expectedSha256?: string;
  nodeIds?: string[];
}

export interface JobDispatchResponse {
  desiredStateVersion: string;
  jobs: DispatchedJobEnvelope[];
}

export interface RegisteredNodeState {
  nodeId: string;
  hostname: string;
  version: string;
  supportedJobKinds: DispatchedJobKind[];
  acceptedAt: string;
  lastSeenAt: string;
}

export interface ControlPlaneStateSnapshot {
  nodes: RegisteredNodeState[];
  pendingJobs: Record<string, DispatchedJobEnvelope[]>;
  reportedResults: ReportedJobResult[];
}

export interface DesiredStateTenantInput {
  slug: string;
  displayName: string;
}

export interface DesiredStateNodeInput {
  nodeId: string;
  hostname: string;
  publicIpv4: string;
  wireguardAddress: string;
}

export interface DesiredStateZoneInput {
  zoneName: string;
  tenantSlug: string;
  primaryNodeId: string;
  records: DnsRecordPayload[];
}

export interface DesiredStateAppInput {
  slug: string;
  tenantSlug: string;
  zoneName: string;
  primaryNodeId: string;
  standbyNodeId?: string;
  canonicalDomain: string;
  aliases: string[];
  backendPort: number;
  runtimeImage: string;
  storageRoot: string;
  mode: string;
}

export interface DesiredStateDatabaseInput {
  appSlug: string;
  engine: "postgresql" | "mariadb";
  databaseName: string;
  databaseUser: string;
  primaryNodeId: string;
  standbyNodeId?: string;
  pendingMigrationTo?: "postgresql" | "mariadb";
  desiredPassword?: string;
}

export interface DesiredStateBackupPolicyInput {
  policySlug: string;
  tenantSlug: string;
  targetNodeId: string;
  schedule: string;
  retentionDays: number;
  storageLocation: string;
  resourceSelectors: string[];
}

export interface DesiredStateSpec {
  tenants: DesiredStateTenantInput[];
  nodes: DesiredStateNodeInput[];
  zones: DesiredStateZoneInput[];
  apps: DesiredStateAppInput[];
  databases: DesiredStateDatabaseInput[];
  backupPolicies: DesiredStateBackupPolicyInput[];
}

export interface DesiredStateApplyRequest {
  spec: DesiredStateSpec;
  reason?: string;
}

export interface DesiredStateApplySummary {
  tenantCount: number;
  nodeCount: number;
  zoneCount: number;
  recordCount: number;
  appCount: number;
  databaseCount: number;
  backupPolicyCount: number;
}

export interface DesiredStateApplyResponse {
  appliedAt: string;
  desiredStateVersion: string;
  summary: DesiredStateApplySummary;
}

export interface DesiredStateExportResponse {
  exportedAt: string;
  spec: DesiredStateSpec;
  yaml: string;
}

export interface ReconciliationRunSummary {
  runId: string;
  desiredStateVersion: string;
  startedAt: string;
  completedAt: string;
  generatedJobCount: number;
  skippedJobCount: number;
  missingCredentialCount: number;
  jobs: DispatchedJobEnvelope[];
}

export interface NodeHealthSnapshot {
  nodeId: string;
  hostname: string;
  desiredRole: "inventory";
  currentVersion?: string;
  desiredVersion?: string;
  lastSeenAt?: string;
  pendingJobCount: number;
  latestJobStatus?: DispatchedJobStatus;
  latestJobSummary?: string;
  driftedResourceCount?: number;
  primaryZoneCount?: number;
  primaryAppCount?: number;
  backupPolicyCount?: number;
  codeServer?: CodeServerServiceSnapshot;
}

export interface JobHistoryEntry {
  jobId: string;
  desiredStateVersion: string;
  kind: DispatchedJobKind;
  nodeId: string;
  createdAt: string;
  claimedAt?: string;
  completedAt?: string;
  status?: DispatchedJobStatus;
  summary?: string;
  dispatchReason?: string;
  resourceKey?: string;
  payload: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export interface AuditEventSummary {
  eventId: string;
  actorType: string;
  actorId?: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface BackupPolicySummary {
  policySlug: string;
  tenantSlug: string;
  targetNodeId: string;
  schedule: string;
  retentionDays: number;
  storageLocation: string;
  resourceSelectors: string[];
}

export interface BackupRunSummary {
  runId: string;
  policySlug: string;
  nodeId: string;
  status: "running" | "succeeded" | "failed";
  summary: string;
  startedAt: string;
  completedAt?: string;
}

export interface BackupRunRecordRequest {
  policySlug: string;
  nodeId: string;
  status: "running" | "succeeded" | "failed";
  summary: string;
  completedAt?: string;
}

export interface BackupsOverview {
  policies: BackupPolicySummary[];
  latestRuns: BackupRunSummary[];
}

export interface OperationsOverview {
  generatedAt: string;
  nodeCount: number;
  pendingJobCount: number;
  failedJobCount: number;
  backupPolicyCount: number;
  driftedResourceCount: number;
  latestReconciliation?: ReconciliationRunSummary;
}

export interface ResourceDriftSummary {
  resourceKind: "dns" | "site" | "database";
  resourceKey: string;
  nodeId: string;
  driftStatus: "in_sync" | "pending" | "failed" | "out_of_sync" | "missing_secret";
  desiredPayloadHash?: string;
  latestPayloadHash?: string;
  latestJobId?: string;
  latestJobStatus?: DispatchedJobStatus;
  latestSummary?: string;
  dispatchRecommended: boolean;
}

export interface PanelApiMetadata {
  product: "SHP";
  service: PanelServiceName;
  runtime: "nodejs";
  version: string;
}

export function createPanelApiMetadata(
  service: PanelServiceName,
  version: string
): PanelApiMetadata {
  return {
    product: "SHP",
    service,
    runtime: "nodejs",
    version
  };
}

export function createBootstrapDispatchedJob(
  nodeId: string,
  kind: DispatchedJobKind = "proxy.render"
): DispatchedJobEnvelope {
  if (kind === "proxy.render") {
    return {
      id: `bootstrap-${nodeId}-${kind.replace(/\./g, "-")}`,
      desiredStateVersion: "bootstrap-v1",
      kind,
      nodeId,
      createdAt: new Date().toISOString(),
      payload: {
        vhostName: `${nodeId}-bootstrap`,
        serverName: `${nodeId}.bootstrap.simplehost.test`,
        serverAliases: [`www.${nodeId}.bootstrap.simplehost.test`],
        documentRoot: `/srv/www/${nodeId}/current/public`,
        tls: false
      } satisfies ProxyRenderPayload
    };
  }

  if (kind === "dns.sync") {
    return {
      id: `bootstrap-${nodeId}-${kind.replace(/\./g, "-")}`,
      desiredStateVersion: "bootstrap-v1",
      kind,
      nodeId,
      createdAt: new Date().toISOString(),
      payload: {
        zoneName: `${nodeId}.bootstrap.simplehost.test`,
        serial: 2026031201,
        nameservers: [
          `ns1.${nodeId}.bootstrap.simplehost.test`,
          `ns2.${nodeId}.bootstrap.simplehost.test`
        ],
        records: [
          {
            name: "@",
            type: "A",
            value: "127.0.0.1",
            ttl: 300
          }
        ]
      } satisfies DnsSyncPayload
    };
  }

  return {
    id: `bootstrap-${nodeId}-${kind.replace(/\./g, "-")}`,
    desiredStateVersion: "bootstrap-v1",
    kind,
    nodeId,
    createdAt: new Date().toISOString(),
    payload: {
      requestedBy: "bootstrap",
      dryRun: true
    }
  };
}

export function createDispatchedJobEnvelope(
  kind: DispatchedJobKind,
  nodeId: string,
  desiredStateVersion: string,
  payload: Record<string, unknown>
): DispatchedJobEnvelope {
  return {
    id: `${desiredStateVersion}-${nodeId}-${kind.replace(/\./g, "-")}`,
    desiredStateVersion,
    kind,
    nodeId,
    createdAt: new Date().toISOString(),
    payload
  };
}
