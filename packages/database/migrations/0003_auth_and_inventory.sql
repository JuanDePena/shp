CREATE TABLE IF NOT EXISTS shp_user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES shp_users(user_id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shp_user_global_roles (
  user_id TEXT NOT NULL REFERENCES shp_users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS shp_user_global_roles_role_idx
  ON shp_user_global_roles (role, created_at DESC);

CREATE TABLE IF NOT EXISTS shp_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES shp_users(user_id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  remote_addr TEXT
);

CREATE INDEX IF NOT EXISTS shp_sessions_user_idx
  ON shp_sessions (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS shp_sessions_active_idx
  ON shp_sessions (expires_at DESC, last_used_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS shp_inventory_import_runs (
  import_id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shp_nodes (
  node_id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  public_ipv4 TEXT NOT NULL,
  wireguard_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shp_dns_zones (
  zone_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES shp_tenants(tenant_id) ON DELETE CASCADE,
  zone_name TEXT NOT NULL UNIQUE,
  primary_node_id TEXT NOT NULL REFERENCES shp_nodes(node_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shp_apps (
  app_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES shp_tenants(tenant_id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL REFERENCES shp_dns_zones(zone_id) ON DELETE CASCADE,
  primary_node_id TEXT NOT NULL REFERENCES shp_nodes(node_id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  runtime_image TEXT NOT NULL,
  backend_port INTEGER NOT NULL,
  storage_root TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shp_sites (
  site_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES shp_apps(app_id) ON DELETE CASCADE,
  canonical_domain TEXT NOT NULL UNIQUE,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shp_databases (
  database_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES shp_apps(app_id) ON DELETE CASCADE,
  primary_node_id TEXT NOT NULL REFERENCES shp_nodes(node_id) ON DELETE RESTRICT,
  engine TEXT NOT NULL,
  database_name TEXT NOT NULL,
  database_user TEXT NOT NULL,
  pending_migration_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (engine, database_name),
  UNIQUE (engine, database_user)
);

CREATE INDEX IF NOT EXISTS shp_apps_tenant_idx
  ON shp_apps (tenant_id, slug);

CREATE INDEX IF NOT EXISTS shp_apps_primary_node_idx
  ON shp_apps (primary_node_id, slug);

CREATE INDEX IF NOT EXISTS shp_databases_app_idx
  ON shp_databases (app_id, engine);
