#!/usr/bin/env bash
set -euo pipefail

bundle_path="${1:?usage: install-bundle.sh <bundle.tar.gz>}"
runtime_root="${SHP_RUNTIME_ROOT:-/opt/simplehost/spanel}"
extract_dir="$(mktemp -d)"

cleanup() {
  rm -rf "${extract_dir}"
}
trap cleanup EXIT

install -d "${runtime_root}/releases" "${runtime_root}/shared" /etc/spanel /var/log/spanel
tar -xzf "${bundle_path}" -C "${extract_dir}"
release_source="$(find "${extract_dir}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

if [[ -z "${release_source}" ]]; then
  echo "Bundle ${bundle_path} did not contain a release directory." >&2
  exit 1
fi

version="$(basename "${release_source}" | sed 's/^simplehost-panel-//')"
release_dir="${runtime_root}/releases/${version}"

rm -rf "${release_dir}"
mv "${release_source}" "${release_dir}"
ln -sfn "${release_dir}" "${runtime_root}/current"

install -m 0644 "${release_dir}/packaging/systemd/spanel-api.service" /etc/systemd/system/spanel-api.service
install -m 0644 "${release_dir}/packaging/systemd/spanel-web.service" /etc/systemd/system/spanel-web.service
install -m 0644 "${release_dir}/packaging/systemd/spanel-worker.service" /etc/systemd/system/spanel-worker.service
install -m 0644 "${release_dir}/packaging/env/spanel-api.env.example" /etc/spanel/api.env.example
install -m 0644 "${release_dir}/packaging/env/spanel-web.env.example" /etc/spanel/web.env.example
install -m 0644 "${release_dir}/packaging/env/spanel-worker.env.example" /etc/spanel/worker.env.example
systemctl daemon-reload

echo "Installed SHP bundle ${bundle_path} into ${release_dir}"
