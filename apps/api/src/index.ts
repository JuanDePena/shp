import { realpathSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { createPanelRuntimeConfig } from "@simplehost/panel-config";
import {
  type AppReconcileRequest,
  type AuthLoginRequest,
  type BackupRunRecordRequest,
  type CreateUserRequest,
  type DesiredStateApplyRequest,
  type DatabaseReconcileRequest,
  type InventoryImportRequest,
  createPanelApiMetadata,
  type JobClaimRequest,
  type JobReportRequest,
  type NodeRegistrationRequest,
  type PanelHealthSnapshot
} from "@simplehost/panel-contracts";
import {
  createPanelDatabaseHealthSummary,
  createPostgresControlPlaneStore,
  NodeAuthorizationError,
  UserAuthorizationError,
  type PanelControlPlaneStore
} from "@simplehost/panel-database";

const startedAt = Date.now();
const config = createPanelRuntimeConfig();

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function readBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;

  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

function matchRoute(pathname: string, pattern: RegExp): RegExpMatchArray | null {
  return pathname.match(pattern);
}

function createHealthSnapshot(): PanelHealthSnapshot {
  return {
    service: "api",
    status: "ok",
    version: config.version,
    environment: config.env,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000)
  };
}

async function requestHandler(
  request: IncomingMessage,
  response: ServerResponse,
  controlPlaneStore: PanelControlPlaneStore
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/healthz") {
    writeJson(response, 200, createHealthSnapshot());
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/meta") {
    const stateSnapshot = await controlPlaneStore.getStateSnapshot();

    writeJson(response, 200, {
      metadata: createPanelApiMetadata("api", config.version),
      database: createPanelDatabaseHealthSummary(config.database.url),
      controlPlane: {
        registeredNodes: stateSnapshot.nodes.length
      }
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/control-plane/state") {
    await controlPlaneStore.getCurrentUser(readBearerToken(request));
    writeJson(response, 200, await controlPlaneStore.getStateSnapshot());
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/auth/login") {
    writeJson(
      response,
      200,
      await controlPlaneStore.loginUser(await readJsonBody<AuthLoginRequest>(request))
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/auth/me") {
    writeJson(response, 200, await controlPlaneStore.getCurrentUser(readBearerToken(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/auth/logout") {
    writeJson(response, 200, await controlPlaneStore.logoutUser(readBearerToken(request)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/users") {
    writeJson(response, 200, await controlPlaneStore.listUsers(readBearerToken(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/users") {
    writeJson(
      response,
      201,
      await controlPlaneStore.createUser(
        await readJsonBody<CreateUserRequest>(request),
        readBearerToken(request)
      )
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/inventory/summary") {
    writeJson(
      response,
      200,
      await controlPlaneStore.getInventorySnapshot(readBearerToken(request))
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/inventory/import") {
    writeJson(
      response,
      200,
      await controlPlaneStore.importInventory(
        await readJsonBody<InventoryImportRequest>(request),
        readBearerToken(request)
      )
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/inventory/export") {
    const exported = await controlPlaneStore.exportDesiredState(readBearerToken(request));
    response.writeHead(200, {
      "content-type": "text/yaml; charset=utf-8"
    });
    response.end(exported.yaml);
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/resources/spec") {
    writeJson(
      response,
      200,
      await controlPlaneStore.exportDesiredState(readBearerToken(request))
    );
    return;
  }

  if (request.method === "PUT" && url.pathname === "/v1/resources/spec") {
    writeJson(
      response,
      200,
      await controlPlaneStore.applyDesiredState(
        await readJsonBody<DesiredStateApplyRequest>(request),
        readBearerToken(request)
      )
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/reconcile/run") {
    writeJson(
      response,
      200,
      await controlPlaneStore.runReconciliationCycle(readBearerToken(request))
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/operations/overview") {
    writeJson(
      response,
      200,
      await controlPlaneStore.getOperationsOverview(readBearerToken(request))
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/resources/drift") {
    writeJson(
      response,
      200,
      await controlPlaneStore.getResourceDrift(readBearerToken(request))
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/nodes/health") {
    writeJson(response, 200, await controlPlaneStore.getNodeHealth(readBearerToken(request)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/jobs/history") {
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    writeJson(
      response,
      200,
      await controlPlaneStore.listJobHistory(
        readBearerToken(request),
        Number.isInteger(limit) ? limit : 50
      )
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/audit/events") {
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    writeJson(
      response,
      200,
      await controlPlaneStore.listAuditEvents(
        readBearerToken(request),
        Number.isInteger(limit) ? limit : 50
      )
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/backups/summary") {
    writeJson(
      response,
      200,
      await controlPlaneStore.getBackupsOverview(readBearerToken(request))
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/backups/runs") {
    writeJson(
      response,
      201,
      await controlPlaneStore.recordBackupRun(
        await readJsonBody<BackupRunRecordRequest>(request),
        readBearerToken(request)
      )
    );
    return;
  }

  const zoneSyncMatch = matchRoute(url.pathname, /^\/v1\/zones\/([^/]+)\/sync$/);

  if (request.method === "POST" && zoneSyncMatch) {
    writeJson(
      response,
      200,
      await controlPlaneStore.dispatchZoneSync(
        decodeURIComponent(zoneSyncMatch[1]!),
        readBearerToken(request)
      )
    );
    return;
  }

  const renderProxyMatch = matchRoute(url.pathname, /^\/v1\/apps\/([^/]+)\/render-proxy$/);

  if (request.method === "POST" && renderProxyMatch) {
    writeJson(
      response,
      200,
      await controlPlaneStore.dispatchAppReconcile(
        decodeURIComponent(renderProxyMatch[1]!),
        {
          includeDns: false,
          includeProxy: true
        },
        readBearerToken(request)
      )
    );
    return;
  }

  const appReconcileMatch = matchRoute(url.pathname, /^\/v1\/apps\/([^/]+)\/reconcile$/);

  if (request.method === "POST" && appReconcileMatch) {
    writeJson(
      response,
      200,
      await controlPlaneStore.dispatchAppReconcile(
        decodeURIComponent(appReconcileMatch[1]!),
        await readJsonBody<AppReconcileRequest>(request),
        readBearerToken(request)
      )
    );
    return;
  }

  const databaseReconcileMatch = matchRoute(
    url.pathname,
    /^\/v1\/databases\/([^/]+)\/reconcile$/
  );

  if (request.method === "POST" && databaseReconcileMatch) {
    writeJson(
      response,
      200,
      await controlPlaneStore.dispatchDatabaseReconcile(
        decodeURIComponent(databaseReconcileMatch[1]!),
        await readJsonBody<DatabaseReconcileRequest>(request),
        readBearerToken(request)
      )
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/nodes/register") {
    writeJson(
      response,
      200,
      await controlPlaneStore.registerNode(
        await readJsonBody<NodeRegistrationRequest>(request),
        readBearerToken(request)
      )
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/jobs/claim") {
    writeJson(
      response,
      200,
      await controlPlaneStore.claimJobs(
        await readJsonBody<JobClaimRequest>(request),
        readBearerToken(request)
      )
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/jobs/report") {
    writeJson(
      response,
      200,
      await controlPlaneStore.reportJob(
        await readJsonBody<JobReportRequest>(request),
        readBearerToken(request)
      )
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    writeJson(response, 200, {
      message: "SimpleHostPanel API bootstrap is running.",
      endpoints: [
        "GET /healthz",
        "GET /v1/meta",
        "POST /v1/auth/login",
        "GET /v1/auth/me",
        "POST /v1/auth/logout",
        "GET /v1/users",
        "POST /v1/users",
        "GET /v1/inventory/summary",
        "POST /v1/inventory/import",
        "GET /v1/inventory/export",
        "GET /v1/resources/spec",
        "PUT /v1/resources/spec",
        "GET /v1/resources/drift",
        "POST /v1/reconcile/run",
        "GET /v1/operations/overview",
        "GET /v1/nodes/health",
        "GET /v1/jobs/history",
        "GET /v1/audit/events",
        "GET /v1/backups/summary",
        "POST /v1/backups/runs",
        "GET /v1/control-plane/state",
        "POST /v1/zones/:zone/sync",
        "POST /v1/apps/:slug/render-proxy",
        "POST /v1/apps/:slug/reconcile",
        "POST /v1/databases/:slug/reconcile",
        "POST /v1/nodes/register",
        "POST /v1/jobs/claim",
        "POST /v1/jobs/report"
      ]
    });
    return;
  }

  writeJson(response, 404, {
    error: "Not Found",
    method: request.method ?? "GET",
    path: url.pathname
  });
}

export async function createPanelApiRuntime(): Promise<{
  server: ReturnType<typeof createServer>;
  close: () => Promise<void>;
}> {
  const controlPlaneStore = await createPostgresControlPlaneStore(
    config.database.url,
    {
      pollIntervalMs: config.worker.pollIntervalMs,
      bootstrapEnrollmentToken: config.auth.bootstrapEnrollmentToken,
      sessionTtlSeconds: config.auth.sessionTtlSeconds,
      bootstrapAdminEmail: config.auth.bootstrapAdminEmail,
      bootstrapAdminPassword: config.auth.bootstrapAdminPassword,
      bootstrapAdminName: config.auth.bootstrapAdminName,
      defaultInventoryImportPath: config.inventory.importPath,
      jobPayloadSecret: config.jobs.payloadSecret
    }
  );
  const server = createServer((request, response) => {
    void requestHandler(request, response, controlPlaneStore).catch((error: unknown) => {
      if (error instanceof NodeAuthorizationError) {
        writeJson(response, 401, {
          error: "Unauthorized",
          message: error.message
        });
        return;
      }

      if (error instanceof UserAuthorizationError) {
        writeJson(
          response,
          error.message.includes("required role") ? 403 : 401,
          {
            error: error.message.includes("required role") ? "Forbidden" : "Unauthorized",
            message: error.message
          }
        );
        return;
      }

      writeJson(response, 500, {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error)
      });
    });
  });

  server.listen(config.api.port, config.api.host, () => {
    console.log(`SHP API listening on http://${config.api.host}:${config.api.port}`);
  });

  return {
    server,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      await controlPlaneStore.close();
    }
  };
}

export async function startPanelApi(): Promise<ReturnType<typeof createServer>> {
  const runtime = await createPanelApiRuntime();
  return runtime.server;
}

function isMainModule(): boolean {
  if (process.argv[1] === undefined) {
    return false;
  }

  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
}

if (isMainModule()) {
  createPanelApiRuntime()
    .then(({ close, server }) => {
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.on(signal, () => {
          void close().finally(() => {
            if (server.listening) {
              server.unref();
            }
            process.exit(0);
          });
        });
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
