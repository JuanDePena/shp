import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { createPanelRuntimeConfig } from "@simplehost/panel-config";
import {
  createPanelApiMetadata,
  type PlannedJobEnvelope
} from "@simplehost/panel-contracts";
import { createPanelDatabaseHealthSummary } from "@simplehost/panel-database";

export function planDemoJob(): PlannedJobEnvelope {
  return {
    id: `job-${Date.now()}`,
    desiredStateVersion: `rev-${Date.now()}`,
    nodeId: "primary",
    createdAt: new Date().toISOString(),
    operations: [
      {
        resource: "dns",
        action: "sync",
        nodeId: "primary",
        summary: "Render authoritative DNS changes for the primary node."
      }
    ]
  };
}

export async function runWorkerIteration(): Promise<void> {
  const config = createPanelRuntimeConfig();
  const metadata = createPanelApiMetadata("worker", config.version);

  console.log(
    JSON.stringify(
      {
        metadata,
        database: createPanelDatabaseHealthSummary(config.database.url),
        plannedJob: planDemoJob()
      },
      null,
      2
    )
  );
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
