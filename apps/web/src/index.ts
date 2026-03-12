import { realpathSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { createPanelRuntimeConfig } from "@simplehost/panel-config";
import { createPanelApiMetadata } from "@simplehost/panel-contracts";
import { renderPanelShell } from "@simplehost/panel-ui";

export function startPanelWeb(): ReturnType<typeof createServer> {
  const config = createPanelRuntimeConfig();
  const metadata = createPanelApiMetadata("web", config.version);
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8"
    });
    response.end(
      renderPanelShell({
        title: "SimpleHostPanel",
        heading: "SimpleHostPanel",
        body: `${metadata.product} web bootstrap is running in ${config.env} mode on ${config.web.host}:${config.web.port}.`
      })
    );
  });

  server.listen(config.web.port, config.web.host, () => {
    console.log(`SHP Web listening on http://${config.web.host}:${config.web.port}`);
  });

  return server;
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
  const server = startPanelWeb();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close(() => {
        process.exit(0);
      });
    });
  }
}
