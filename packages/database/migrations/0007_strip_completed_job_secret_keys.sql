UPDATE control_plane_jobs
SET payload = payload - 'password' - 'secret' - 'token'
WHERE completed_at IS NOT NULL
  AND jsonb_typeof(payload) = 'object'
  AND (payload ? 'password' OR payload ? 'secret' OR payload ? 'token');
