import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

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

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const server = startPanelWeb();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close(() => {
        process.exit(0);
      });
    });
  }
}
