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
- `spanel-api` and `spanel-worker` must stay stopped on the standby while
  PostgreSQL is read-only, because their startup path applies migrations and
  other control-plane bootstrap writes

## Preconditions

Before promoting the secondary:

- confirm the secondary reports `pg_is_in_recovery() = true`
- confirm `pg_stat_wal_receiver.status = streaming`
- confirm `wg0` is active on both nodes
- confirm `/opt/simplehost/spanel/current` exists on the secondary and points to
  a populated release tree

## Passive runtime refresh

Keep the standby node updated with the same installed `SHP` release as the
primary, but leave `spanel-*` disabled until a promotion.

If the standby does not have the build toolchain available, refresh it from the
installed runtime on the primary:

```bash
release_version="$(basename "$(readlink -f /opt/simplehost/spanel/current)")"

ssh root@vps-16535090.vps.ovh.ca \
  'install -d /opt/simplehost/spanel/releases /opt/simplehost/spanel/shared /etc/spanel /var/log/spanel'

rsync -a --delete "/opt/simplehost/spanel/releases/${release_version}/" \
  "root@vps-16535090.vps.ovh.ca:/opt/simplehost/spanel/releases/${release_version}/"

rsync -a \
  /etc/systemd/system/spanel-api.service \
  /etc/systemd/system/spanel-web.service \
  /etc/systemd/system/spanel-worker.service \
  root@vps-16535090.vps.ovh.ca:/etc/systemd/system/

rsync -a \
  /etc/spanel/api.env \
  /etc/spanel/web.env \
  /etc/spanel/worker.env \
  /etc/spanel/api.env.example \
  /etc/spanel/web.env.example \
  /etc/spanel/worker.env.example \
  /etc/spanel/inventory.apps.yaml \
  root@vps-16535090.vps.ovh.ca:/etc/spanel/

ssh root@vps-16535090.vps.ovh.ca \
  "ln -sfn /opt/simplehost/spanel/releases/${release_version} /opt/simplehost/spanel/current && \
   chown root:spanel /etc/spanel/api.env /etc/spanel/web.env /etc/spanel/worker.env && \
   chmod 0640 /etc/spanel/api.env /etc/spanel/web.env /etc/spanel/worker.env && \
   systemctl daemon-reload && \
   systemctl disable spanel-api.service spanel-web.service spanel-worker.service"
```

For a passive smoke test on the secondary, only validate `spanel-web` before a
promotion. `spanel-api` and `spanel-worker` are expected to fail while
`postgresql-shp` is still in recovery mode.

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
   curl -fsS http://127.0.0.1:3100/healthz
   curl -fsS http://127.0.0.1:3200/
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

## Manual failback checklist

Use this checklist only after the failed node has been rebuilt cleanly as a
standby from the currently active primary.

- Confirm the current primary is healthy and serving `SHP` traffic correctly.
- Confirm the node you want to fail back to reports `pg_is_in_recovery() = true`.
- Confirm `pg_stat_wal_receiver.status = streaming` on that standby.
- Confirm `/opt/simplehost/spanel/current` on the standby points to the same
  installed release generation you expect to promote.
- Confirm `spanel-api`, `spanel-web`, and `spanel-worker` are still disabled on
  the standby before promotion.
- Stop `spanel-worker`, `spanel-api`, and `spanel-web` on the current primary.
- Promote the standby that will become the new primary:

  ```bash
  sudo -u postgres psql -p 5433 -c 'select pg_promote();'
  ```

- Wait until `pg_is_in_recovery()` returns `f` on the promoted node.
- Enable and start `spanel-api`, `spanel-web`, and `spanel-worker` on the
  promoted node.
- Validate `http://127.0.0.1:3100/healthz` and `http://127.0.0.1:3200/` on the
  promoted node.
- Repoint any front-facing proxy or traffic entrypoint back to the promoted
  node.
- Rebuild the old primary as a fresh standby from the new primary.
- Keep `spanel-*` disabled on the rebuilt standby after failback until the next
  planned switchover or incident.

## Notes

- This is a manual failover design by intent.
- Do not run `spanel-worker` active on both nodes at the same time.
- Keep `SHP` write traffic pointed only at the promoted PostgreSQL primary.
