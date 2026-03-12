ALTER TABLE control_plane_jobs
  ADD COLUMN IF NOT EXISTS dispatched_by_user_id TEXT REFERENCES shp_users(user_id) ON DELETE SET NULL;

ALTER TABLE control_plane_jobs
  ADD COLUMN IF NOT EXISTS dispatch_reason TEXT;

CREATE INDEX IF NOT EXISTS control_plane_jobs_dispatched_by_idx
  ON control_plane_jobs (dispatched_by_user_id, created_at DESC);
