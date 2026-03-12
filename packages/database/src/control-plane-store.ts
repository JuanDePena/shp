import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import {
  createBootstrapDispatchedJob,
  type ControlPlaneStateSnapshot,
  type DispatchedJobEnvelope,
  type JobClaimRequest,
  type JobClaimResponse,
  type JobReportRequest,
  type NodeRegistrationRequest,
  type NodeRegistrationResponse,
  type RegisteredNodeState,
  type ReportedJobResult
} from "@simplehost/panel-contracts";

import { runPanelDatabaseMigrations } from "./migrations.js";

interface NodeRow {
  node_id: string;
  hostname: string;
  version: string;
  supported_job_kinds: unknown;
  accepted_at: Date | string;
  last_seen_at: Date | string;
}

interface JobRow {
  id: string;
  desired_state_version: string;
  kind: string;
  node_id: string;
  created_at: Date | string;
  payload: Record<string, unknown>;
}

interface ResultRow {
  job_id: string;
  kind: string;
  node_id: string;
  status: string;
  summary: string;
  details: Record<string, unknown> | null;
  completed_at: Date | string;
}

interface AuditEventInput {
  actorType: string;
  actorId?: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export interface PanelControlPlaneStore {
  registerNode(request: NodeRegistrationRequest): Promise<NodeRegistrationResponse>;
  claimJobs(request: JobClaimRequest): Promise<JobClaimResponse>;
  reportJob(request: JobReportRequest): Promise<{ accepted: true }>;
  getStateSnapshot(): Promise<ControlPlaneStateSnapshot>;
  close(): Promise<void>;
}

function normalizeTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDispatchedJob(row: JobRow): DispatchedJobEnvelope {
  return {
    id: row.id,
    desiredStateVersion: row.desired_state_version,
    kind: row.kind as DispatchedJobEnvelope["kind"],
    nodeId: row.node_id,
    createdAt: normalizeTimestamp(row.created_at),
    payload: row.payload
  };
}

function toRegisteredNodeState(row: NodeRow): RegisteredNodeState {
  return {
    nodeId: row.node_id,
    hostname: row.hostname,
    version: row.version,
    supportedJobKinds: row.supported_job_kinds as RegisteredNodeState["supportedJobKinds"],
    acceptedAt: normalizeTimestamp(row.accepted_at),
    lastSeenAt: normalizeTimestamp(row.last_seen_at)
  };
}

function toReportedJobResult(row: ResultRow): ReportedJobResult {
  return {
    jobId: row.job_id,
    kind: row.kind as ReportedJobResult["kind"],
    nodeId: row.node_id,
    status: row.status as ReportedJobResult["status"],
    summary: row.summary,
    details: row.details ?? undefined,
    completedAt: normalizeTimestamp(row.completed_at)
  };
}

async function withTransaction<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedBootstrapJobs(client: PoolClient, nodeId: string): Promise<void> {
  const bootstrapJobs = [
    createBootstrapDispatchedJob(nodeId, "proxy.render"),
    createBootstrapDispatchedJob(nodeId, "dns.sync")
  ];

  for (const job of bootstrapJobs) {
    await client.query(
      `INSERT INTO control_plane_jobs (
         id,
         desired_state_version,
         kind,
         node_id,
         created_at,
         payload
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        job.id,
        job.desiredStateVersion,
        job.kind,
        job.nodeId,
        job.createdAt,
        JSON.stringify(job.payload)
      ]
    );
  }
}

async function insertAuditEvent(
  client: PoolClient,
  input: AuditEventInput
): Promise<void> {
  await client.query(
    `INSERT INTO shp_audit_events (
       event_id,
       actor_type,
       actor_id,
       event_type,
       entity_type,
       entity_id,
       payload,
       occurred_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      randomUUID(),
      input.actorType,
      input.actorId ?? null,
      input.eventType,
      input.entityType ?? null,
      input.entityId ?? null,
      JSON.stringify(input.payload ?? {}),
      input.occurredAt ?? new Date().toISOString()
    ]
  );
}

export async function createPostgresControlPlaneStore(
  databaseUrl: string,
  pollIntervalMs = 5000
): Promise<PanelControlPlaneStore> {
  const pool = new Pool({
    connectionString: databaseUrl,
    application_name: "simplehost-panel-api"
  });

  await runPanelDatabaseMigrations(pool);

  return {
    async registerNode(request) {
      const acceptedAt = new Date().toISOString();

      await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO control_plane_nodes (
             node_id,
             hostname,
             version,
             supported_job_kinds,
             accepted_at,
             last_seen_at
           )
           VALUES ($1, $2, $3, $4::jsonb, $5, $5)
           ON CONFLICT (node_id)
           DO UPDATE SET
             hostname = EXCLUDED.hostname,
             version = EXCLUDED.version,
             supported_job_kinds = EXCLUDED.supported_job_kinds,
             last_seen_at = EXCLUDED.last_seen_at`,
          [
            request.nodeId,
            request.hostname,
            request.version,
            JSON.stringify(request.supportedJobKinds),
            acceptedAt
          ]
        );

        await seedBootstrapJobs(client, request.nodeId);
        await insertAuditEvent(client, {
          actorType: "node",
          actorId: request.nodeId,
          eventType: "node.upserted",
          entityType: "node",
          entityId: request.nodeId,
          payload: {
            hostname: request.hostname,
            version: request.version,
            supportedJobKinds: request.supportedJobKinds
          },
          occurredAt: acceptedAt
        });
      });

      return {
        nodeId: request.nodeId,
        acceptedAt,
        pollIntervalMs
      };
    },

    async claimJobs(request) {
      const claimedAt = new Date().toISOString();

      const jobs = await withTransaction(pool, async (client) => {
        await client.query(
          `UPDATE control_plane_nodes
           SET hostname = $2,
               version = $3,
               last_seen_at = $4
           WHERE node_id = $1`,
          [request.nodeId, request.hostname, request.version, claimedAt]
        );

        const result = await client.query<JobRow>(
          `WITH candidate_jobs AS (
             SELECT id
             FROM control_plane_jobs
             WHERE node_id = $1
               AND claimed_at IS NULL
               AND completed_at IS NULL
             ORDER BY created_at ASC
             LIMIT $2
             FOR UPDATE SKIP LOCKED
           ),
           claimed_jobs AS (
             UPDATE control_plane_jobs jobs
             SET claimed_at = $3
             FROM candidate_jobs candidates
             WHERE jobs.id = candidates.id
             RETURNING
               jobs.id,
               jobs.desired_state_version,
               jobs.kind,
               jobs.node_id,
               jobs.created_at,
               jobs.payload
           )
           SELECT *
           FROM claimed_jobs
           ORDER BY created_at ASC`,
          [request.nodeId, request.maxJobs, claimedAt]
        );

        await insertAuditEvent(client, {
          actorType: "node",
          actorId: request.nodeId,
          eventType: "jobs.claimed",
          entityType: "node",
          entityId: request.nodeId,
          payload: {
            jobIds: result.rows.map((row) => row.id),
            maxJobs: request.maxJobs,
            hostname: request.hostname,
            version: request.version
          },
          occurredAt: claimedAt
        });

        return result.rows.map(toDispatchedJob);
      });

      return {
        nodeId: request.nodeId,
        claimedAt,
        jobs
      };
    },

    async reportJob(request) {
      const reportedAt = new Date().toISOString();

      await withTransaction(pool, async (client) => {
        await client.query(
          `UPDATE control_plane_nodes
           SET last_seen_at = $2
           WHERE node_id = $1`,
          [request.nodeId, reportedAt]
        );

        await client.query(
          `UPDATE control_plane_jobs
           SET completed_at = $2
           WHERE id = $1`,
          [request.result.jobId, request.result.completedAt]
        );

        await client.query(
          `INSERT INTO control_plane_job_results (
             job_id,
             kind,
             node_id,
             status,
             summary,
             details,
             completed_at,
             reported_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           ON CONFLICT (job_id)
           DO UPDATE SET
             kind = EXCLUDED.kind,
             node_id = EXCLUDED.node_id,
             status = EXCLUDED.status,
             summary = EXCLUDED.summary,
             details = EXCLUDED.details,
             completed_at = EXCLUDED.completed_at,
             reported_at = EXCLUDED.reported_at`,
          [
            request.result.jobId,
            request.result.kind,
            request.result.nodeId,
            request.result.status,
            request.result.summary,
            JSON.stringify(request.result.details ?? null),
            request.result.completedAt,
            reportedAt
          ]
        );

        await insertAuditEvent(client, {
          actorType: "node",
          actorId: request.nodeId,
          eventType: "job.reported",
          entityType: "job",
          entityId: request.result.jobId,
          payload: {
            kind: request.result.kind,
            status: request.result.status,
            summary: request.result.summary
          },
          occurredAt: reportedAt
        });
      });

      return {
        accepted: true as const
      };
    },

    async getStateSnapshot() {
      const [nodeResult, pendingJobResult, reportedResult] = await Promise.all([
        pool.query<NodeRow>(
          `SELECT
             node_id,
             hostname,
             version,
             supported_job_kinds,
             accepted_at,
             last_seen_at
           FROM control_plane_nodes
           ORDER BY accepted_at ASC`
        ),
        pool.query<JobRow>(
          `SELECT
             id,
             desired_state_version,
             kind,
             node_id,
             created_at,
             payload
           FROM control_plane_jobs
           WHERE claimed_at IS NULL
             AND completed_at IS NULL
           ORDER BY created_at ASC`
        ),
        pool.query<ResultRow>(
          `SELECT
             job_id,
             kind,
             node_id,
             status,
             summary,
             details,
             completed_at
           FROM control_plane_job_results
           ORDER BY completed_at ASC`
        )
      ]);

      const pendingJobs: Record<string, DispatchedJobEnvelope[]> = {};

      for (const row of pendingJobResult.rows) {
        const job = toDispatchedJob(row);
        pendingJobs[job.nodeId] ??= [];
        pendingJobs[job.nodeId].push(job);
      }

      return {
        nodes: nodeResult.rows.map(toRegisteredNodeState),
        pendingJobs,
        reportedResults: reportedResult.rows.map(toReportedJobResult)
      };
    },

    async close() {
      await pool.end();
    }
  };
}
