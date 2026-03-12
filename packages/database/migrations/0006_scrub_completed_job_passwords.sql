UPDATE control_plane_jobs
SET payload = payload - 'password'
WHERE completed_at IS NOT NULL
  AND jsonb_typeof(payload) = 'object'
  AND payload ? 'password';
