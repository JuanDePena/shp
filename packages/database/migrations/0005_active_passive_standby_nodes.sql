ALTER TABLE shp_apps
  ADD COLUMN IF NOT EXISTS standby_node_id TEXT REFERENCES shp_nodes(node_id) ON DELETE RESTRICT;

ALTER TABLE shp_databases
  ADD COLUMN IF NOT EXISTS standby_node_id TEXT REFERENCES shp_nodes(node_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS shp_apps_standby_node_idx
  ON shp_apps (standby_node_id, slug);

CREATE INDEX IF NOT EXISTS shp_databases_standby_node_idx
  ON shp_databases (standby_node_id, engine);

UPDATE shp_apps
SET standby_node_id = 'secondary'
WHERE mode = 'active-passive'
  AND primary_node_id = 'primary'
  AND standby_node_id IS NULL
  AND EXISTS (SELECT 1 FROM shp_nodes WHERE node_id = 'secondary');

UPDATE shp_databases
SET standby_node_id = 'secondary'
WHERE primary_node_id = 'primary'
  AND standby_node_id IS NULL
  AND EXISTS (SELECT 1 FROM shp_nodes WHERE node_id = 'secondary');
