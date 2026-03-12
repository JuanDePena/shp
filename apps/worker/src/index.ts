import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { createPanelRuntimeConfig } from "@simplehost/panel-config";
import { createPanelApiMetadata } from "@simplehost/panel-contracts";
import {
  createPanelDatabaseHealthSummary,
  createPostgresControlPlaneStore
} from "@simplehost/panel-database";

export async function runWorkerIteration(): Promise<void> {
  const config = createPanelRuntimeConfig();
  const metadata = createPanelApiMetadata("worker", config.version);
  const controlPlaneStore = await createPostgresControlPlaneStore(config.database.url, {
    pollIntervalMs: config.worker.pollIntervalMs,
    bootstrapEnrollmentToken: config.auth.bootstrapEnrollmentToken,
    sessionTtlSeconds: config.auth.sessionTtlSeconds,
    bootstrapAdminEmail: config.auth.bootstrapAdminEmail,
    bootstrapAdminPassword: config.auth.bootstrapAdminPassword,
    bootstrapAdminName: config.auth.bootstrapAdminName,
    defaultInventoryImportPath: config.inventory.importPath
  });
  const stateSnapshot = await controlPlaneStore.getStateSnapshot();

  try {
    console.log(
      JSON.stringify(
        {
          metadata,
          database: createPanelDatabaseHealthSummary(config.database.url),
          controlPlane: {
            registeredNodes: stateSnapshot.nodes.length,
            pendingJobCount: Object.values(stateSnapshot.pendingJobs).reduce(
              (count, jobs) => count + jobs.length,
              0
            ),
            reportedResultCount: stateSnapshot.reportedResults.length
          }
        },
        null,
        2
      )
    );
  } finally {
    await controlPlaneStore.close();
  }
}

export async function startPanelWorker(): Promise<void> {
  const config = createPanelRuntimeConfig();
  const runOnce = process.env.SHP_WORKER_RUN_ONCE === "true";

  do {
    await runWorkerIteration();

    if (runOnce) {
      break;
    }

    await sleep(config.worker.pollIntervalMs);
  } while (true);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  startPanelWorker().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
