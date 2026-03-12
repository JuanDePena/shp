# SHP Failover Runbook

This runbook documents the current manual failover path for `SHP` in the
two-node layout.

## Current runtime model

- Primary host: `vps-3dbbfb0b.vps.ovh.ca`
- Secondary host: `vps-16535090.vps.ovh.ca`
- `postgresql-shp` replicates over WireGuard on `10.89.0.0/24`
- `spanel-api`, `spanel-web`, and `spanel-worker` are installed on both nodes
- On the secondary node, the `spanel-*` services remain installed but disabled
  while PostgreSQL is still in physical standby mode

## Preconditions

Before promoting the secondary:

- confirm the secondary reports `pg_is_in_recovery() = true`
- confirm `pg_stat_wal_receiver.status = streaming`
- confirm `wg0` is active on both nodes

## Manual promotion sequence

1. On the secondary, promote `postgresql-shp`:

   ```bash
   sudo -u postgres psql -p 5433 -c 'select pg_promote();'
   ```

2. Wait until the secondary reports:

   ```bash
   sudo -u postgres psql -p 5433 -Atqc 'select pg_is_in_recovery();'
   ```

   Expected result:

   ```text
   f
   ```

3. If the old primary is still reachable, stop `SHP` services there to avoid
   split-brain at the application layer:

   ```bash
   systemctl stop spanel-worker.service spanel-api.service spanel-web.service
   ```

4. Enable and start `SHP` on the promoted secondary:

   ```bash
   systemctl enable --now spanel-api.service spanel-web.service spanel-worker.service
   ```

5. Validate local service health on the promoted secondary:

   ```bash
   curl -fsS http://127.0.0.1:3000/healthz
   curl -fsS http://127.0.0.1:3100/
   ```

6. Repoint any front-facing proxy or traffic entrypoint to the promoted node as
   required by the surrounding platform.

## Rebuild after failover

After a failover, do not try to reconnect the old primary as if nothing
happened.

Rebuild the old primary as a fresh standby:

1. re-bootstrap `postgresql-shp` from the new primary
2. verify streaming replication is back
3. keep `spanel-*` disabled on the rebuilt standby unless you are failing back

## Notes

- This is a manual failover design by intent.
- Do not run `spanel-worker` active on both nodes at the same time.
- Keep `SHP` write traffic pointed only at the promoted PostgreSQL primary.
