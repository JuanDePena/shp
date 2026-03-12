CREATE TABLE IF NOT EXISTS shp_tenants (
  tenant_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shp_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shp_memberships (
  tenant_id TEXT NOT NULL REFERENCES shp_tenants(tenant_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES shp_users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS control_plane_nodes (
  node_id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  version TEXT NOT NULL,
  supported_job_kinds JSONB NOT NULL DEFAULT '[]'::jsonb,
  accepted_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS control_plane_jobs (
  id TEXT PRIMARY KEY,
  desired_state_version TEXT NOT NULL,
  kind TEXT NOT NULL,
  node_id TEXT NOT NULL REFERENCES control_plane_nodes(node_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS control_plane_jobs_pending_idx
  ON control_plane_jobs (node_id, created_at)
  WHERE claimed_at IS NULL AND completed_at IS NULL;

CREATE TABLE IF NOT EXISTS control_plane_job_results (
  job_id TEXT PRIMARY KEY REFERENCES control_plane_jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB,
  completed_at TIMESTAMPTZ NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS shp_audit_events (
  event_id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shp_audit_events_occurred_at_idx
  ON shp_audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS shp_audit_events_entity_idx
  ON shp_audit_events (entity_type, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS shp_memberships_user_idx
  ON shp_memberships (user_id, created_at DESC);
