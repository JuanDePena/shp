import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { createPanelRuntimeConfig } from "@simplehost/panel-config";
import {
  createPanelApiMetadata,
  type PanelHealthSnapshot
} from "@simplehost/panel-contracts";
import { createPanelDatabaseHealthSummary } from "@simplehost/panel-database";

const startedAt = Date.now();

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function createHealthSnapshot(): PanelHealthSnapshot {
  const config = createPanelRuntimeConfig();

  return {
    service: "api",
    status: "ok",
    version: config.version,
    environment: config.env,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000)
  };
}

function requestHandler(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const config = createPanelRuntimeConfig();

  if (url.pathname === "/healthz") {
    writeJson(response, 200, createHealthSnapshot());
    return;
  }

  if (url.pathname === "/v1/meta") {
    writeJson(response, 200, {
      metadata: createPanelApiMetadata("api", config.version),
      database: createPanelDatabaseHealthSummary(config.database.url)
    });
    return;
  }

  if (url.pathname === "/") {
    writeJson(response, 200, {
      message: "SimpleHostPanel API bootstrap is running.",
      endpoints: ["/healthz", "/v1/meta"]
    });
    return;
  }

  writeJson(response, 404, {
    error: "Not Found",
    path: url.pathname
  });
}

export function startPanelApi(): ReturnType<typeof createServer> {
  const config = createPanelRuntimeConfig();
  const server = createServer(requestHandler);

  server.listen(config.api.port, config.api.host, () => {
    console.log(`SHP API listening on http://${config.api.host}:${config.api.port}`);
  });

  return server;
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const server = startPanelApi();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close(() => {
        process.exit(0);
      });
    });
  }
}
