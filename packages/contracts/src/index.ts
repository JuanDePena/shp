export type PanelServiceName = "api" | "web" | "worker";
export type PanelHealthStatus = "ok" | "degraded";
export type PlannedResourceKind =
  | "dns"
  | "site"
  | "certificate"
  | "app"
  | "database"
  | "backup";

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
