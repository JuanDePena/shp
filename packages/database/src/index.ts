export type PanelDatabaseEngine = "postgresql" | "mariadb";

export interface PanelDatabaseSettings {
  applicationName: string;
  engine: PanelDatabaseEngine;
  url: string;
  host: string;
  port: number | null;
  database: string;
}

export function detectPanelDatabaseEngine(url: string): PanelDatabaseEngine {
  if (url.startsWith("mariadb://") || url.startsWith("mysql://")) {
    return "mariadb";
  }

  return "postgresql";
}

export function createPanelDatabaseSettings(
  url: string,
  applicationName = "simplehost-panel"
): PanelDatabaseSettings {
  const parsed = new URL(url);

  return {
    applicationName,
    engine: detectPanelDatabaseEngine(url),
    url,
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : null,
    database: parsed.pathname.replace(/^\//, "")
  };
}

export function createPanelDatabaseHealthSummary(url: string): Record<string, unknown> {
  const settings = createPanelDatabaseSettings(url);

  return {
    applicationName: settings.applicationName,
    engine: settings.engine,
    host: settings.host,
    port: settings.port,
    database: settings.database
  };
}

export { createPostgresControlPlaneStore, type PanelControlPlaneStore } from "./control-plane-store.js";
