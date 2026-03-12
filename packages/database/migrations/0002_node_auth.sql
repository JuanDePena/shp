CREATE TABLE IF NOT EXISTS control_plane_node_credentials (
  node_id TEXT PRIMARY KEY REFERENCES control_plane_nodes(node_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS control_plane_node_credentials_last_used_idx
  ON control_plane_node_credentials (last_used_at DESC);
