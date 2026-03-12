export interface PanelListenerConfig {
  host: string;
  port: number;
}

export interface PanelWorkerConfig {
  pollIntervalMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface PanelDatabaseRuntimeConfig {
  url: string;
}

export interface PanelAuthRuntimeConfig {
  bootstrapEnrollmentToken: string | null;
  bootstrapAdminEmail: string | null;
  bootstrapAdminPassword: string | null;
  bootstrapAdminName: string | null;
  sessionTtlSeconds: number;
}

export interface PanelInventoryRuntimeConfig {
  importPath: string;
}

export interface PanelJobRuntimeConfig {
  payloadSecret: string | null;
}

export interface PanelRuntimeConfig {
  env: string;
  version: string;
  api: PanelListenerConfig;
  web: PanelListenerConfig;
  worker: PanelWorkerConfig;
  database: PanelDatabaseRuntimeConfig;
  auth: PanelAuthRuntimeConfig;
  inventory: PanelInventoryRuntimeConfig;
  jobs: PanelJobRuntimeConfig;
}

function readString(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function readPort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }

  return parsed;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readOptionalString(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function createPanelRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): PanelRuntimeConfig {
  return {
    env: readString(env.NODE_ENV, "development"),
    version: readString(env.SHP_VERSION, "0.1.0"),
    api: {
      host: readString(env.SHP_API_HOST, "127.0.0.1"),
      port: readPort(env.SHP_API_PORT, 3100)
    },
    web: {
      host: readString(env.SHP_WEB_HOST, "127.0.0.1"),
      port: readPort(env.SHP_WEB_PORT, 3200)
    },
    worker: {
      pollIntervalMs: readPositiveInt(env.SHP_WORKER_POLL_INTERVAL_MS, 5000),
      logLevel: readString(env.SHP_LOG_LEVEL, "info") as PanelWorkerConfig["logLevel"]
    },
    database: {
      url: readString(
        env.SHP_DATABASE_URL,
        "postgresql://simplehost_panel:change-me@127.0.0.1:5433/simplehost_panel"
      )
    },
    auth: {
      bootstrapEnrollmentToken: readOptionalString(env.SHP_BOOTSTRAP_ENROLLMENT_TOKEN),
      bootstrapAdminEmail: readOptionalString(env.SHP_BOOTSTRAP_ADMIN_EMAIL),
      bootstrapAdminPassword: readOptionalString(env.SHP_BOOTSTRAP_ADMIN_PASSWORD),
      bootstrapAdminName: readOptionalString(env.SHP_BOOTSTRAP_ADMIN_NAME),
      sessionTtlSeconds: readPositiveInt(env.SHP_SESSION_TTL_SECONDS, 43200)
    },
    inventory: {
      importPath: readString(
        env.SHP_INVENTORY_PATH,
        "/etc/spanel/inventory.apps.yaml"
      )
    },
    jobs: {
      payloadSecret:
        readOptionalString(env.SHP_JOB_SECRET_KEY) ??
        readOptionalString(env.SHP_BOOTSTRAP_ENROLLMENT_TOKEN)
    }
  };
}
