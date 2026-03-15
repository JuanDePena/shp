ALTER TABLE control_plane_nodes
  ADD COLUMN IF NOT EXISTS runtime_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
