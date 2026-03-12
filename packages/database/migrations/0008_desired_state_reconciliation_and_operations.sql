CREATE TABLE IF NOT EXISTS shp_dns_records (
  record_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES shp_dns_zones(zone_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  ttl INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (zone_id, name, type, value)
);

CREATE INDEX IF NOT EXISTS shp_dns_records_zone_idx
  ON shp_dns_records (zone_id, name, type);

CREATE TABLE IF NOT EXISTS shp_database_credentials (
  database_id TEXT PRIMARY KEY REFERENCES shp_databases(database_id) ON DELETE CASCADE,
  secret_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shp_backup_policies (
  policy_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES shp_tenants(tenant_id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES shp_nodes(node_id) ON DELETE RESTRICT,
  policy_slug TEXT NOT NULL UNIQUE,
  schedule TEXT NOT NULL,
  retention_days INTEGER NOT NULL,
  storage_location TEXT NOT NULL,
  resource_selectors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shp_backup_policies_tenant_idx
  ON shp_backup_policies (tenant_id, policy_slug);

CREATE TABLE IF NOT EXISTS shp_backup_runs (
  run_id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES shp_backup_policies(policy_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES shp_nodes(node_id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS shp_backup_runs_policy_idx
  ON shp_backup_runs (policy_id, started_at DESC);

CREATE TABLE IF NOT EXISTS shp_reconciliation_runs (
  run_id TEXT PRIMARY KEY,
  desired_state_version TEXT NOT NULL,
  generated_job_count INTEGER NOT NULL DEFAULT 0,
  skipped_job_count INTEGER NOT NULL DEFAULT 0,
  missing_credential_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS shp_reconciliation_runs_completed_idx
  ON shp_reconciliation_runs (completed_at DESC);

ALTER TABLE control_plane_jobs
  ADD COLUMN IF NOT EXISTS resource_key TEXT;

ALTER TABLE control_plane_jobs
  ADD COLUMN IF NOT EXISTS resource_kind TEXT;

ALTER TABLE control_plane_jobs
  ADD COLUMN IF NOT EXISTS payload_hash TEXT;

CREATE INDEX IF NOT EXISTS control_plane_jobs_resource_idx
  ON control_plane_jobs (node_id, resource_key, created_at DESC);
