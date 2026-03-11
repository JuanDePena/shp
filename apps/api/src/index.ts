import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { createPanelRuntimeConfig } from "@simplehost/panel-config";
import {
  createPanelApiMetadata,
  type JobClaimRequest,
  type JobReportRequest,
  type NodeRegistrationRequest,
  type PanelHealthSnapshot
} from "@simplehost/panel-contracts";
import {
  createPanelDatabaseHealthSummary,
  createPostgresControlPlaneStore,
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
    writeJson(response, 200, await controlPlaneStore.getStateSnapshot());
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/nodes/register") {
    writeJson(
      response,
      200,
      await controlPlaneStore.registerNode(
        await readJsonBody<NodeRegistrationRequest>(request)
      )
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/jobs/claim") {
    writeJson(
      response,
      200,
      await controlPlaneStore.claimJobs(await readJsonBody<JobClaimRequest>(request))
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/jobs/report") {
    writeJson(
      response,
      200,
      await controlPlaneStore.reportJob(await readJsonBody<JobReportRequest>(request))
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    writeJson(response, 200, {
      message: "SimpleHostPanel API bootstrap is running.",
      endpoints: [
        "GET /healthz",
        "GET /v1/meta",
        "GET /v1/control-plane/state",
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
    config.worker.pollIntervalMs
  );
  const server = createServer((request, response) => {
    void requestHandler(request, response, controlPlaneStore).catch((error: unknown) => {
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

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
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
