export type PanelServiceName = "api" | "web" | "worker";
export type PanelHealthStatus = "ok" | "degraded";
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
  "backup.trigger",
  "mail.sync"
] as const;

export type DispatchedJobKind = (typeof dispatchedJobKinds)[number];
export type DispatchedJobStatus = "applied" | "skipped" | "failed";

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
}

export interface NodeRegistrationResponse {
  nodeId: string;
  acceptedAt: string;
  pollIntervalMs: number;
}

export interface JobClaimRequest {
  nodeId: string;
  hostname: string;
  version: string;
  maxJobs: number;
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
