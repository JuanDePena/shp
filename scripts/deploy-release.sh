#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: deploy-release.sh <version> [target-host|local] [active|passive]}"
target_host="${2:-local}"
mode="${3:-active}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="${SHP_RUNTIME_ROOT:-/opt/simplehost/spanel}"
release_dir="${runtime_root}/releases/${version}"

if [[ "${mode}" != "active" && "${mode}" != "passive" ]]; then
  echo "mode must be active or passive" >&2
  exit 1
fi

if [[ "${target_host}" == "local" || ! -d "${release_dir}" ]]; then
  bash "${repo_root}/scripts/install-release.sh" "${version}"
fi

ensure_env_version() {
  local target_path="$1"
  local example_path="$2"

  if [[ ! -f "${target_path}" ]]; then
    install -m 0640 "${example_path}" "${target_path}"
  fi

  if grep -q '^SHP_VERSION=' "${target_path}"; then
    sed -i "s/^SHP_VERSION=.*/SHP_VERSION=${version}/" "${target_path}"
  else
    printf '\nSHP_VERSION=%s\n' "${version}" >>"${target_path}"
  fi
}

activate_local() {
  ensure_env_version /etc/spanel/api.env "${release_dir}/packaging/env/spanel-api.env.example"
  ensure_env_version /etc/spanel/web.env "${release_dir}/packaging/env/spanel-web.env.example"
  ensure_env_version /etc/spanel/worker.env "${release_dir}/packaging/env/spanel-worker.env.example"
  systemctl daemon-reload

  if [[ "${mode}" == "passive" ]]; then
    systemctl disable spanel-api.service spanel-web.service spanel-worker.service || true
    systemctl stop spanel-api.service spanel-web.service spanel-worker.service || true
    echo "Installed SHP ${version} locally in passive mode"
    return
  fi

  systemctl enable spanel-api.service spanel-web.service spanel-worker.service
  systemctl restart spanel-api.service spanel-web.service spanel-worker.service
  systemctl is-active spanel-api.service spanel-web.service spanel-worker.service
  echo "Installed SHP ${version} locally in active mode"
}

activate_remote() {
  local remote_release_dir="${release_dir}"

  rsync -a "${release_dir}/" "${target_host}:${remote_release_dir}/"

  ssh "${target_host}" \
    "install -d '${runtime_root}/releases' /etc/spanel /var/log/spanel && \
     ln -sfn '${remote_release_dir}' '${runtime_root}/current' && \
     install -m 0644 '${remote_release_dir}/packaging/systemd/spanel-api.service' /etc/systemd/system/spanel-api.service && \
     install -m 0644 '${remote_release_dir}/packaging/systemd/spanel-web.service' /etc/systemd/system/spanel-web.service && \
     install -m 0644 '${remote_release_dir}/packaging/systemd/spanel-worker.service' /etc/systemd/system/spanel-worker.service && \
     install -m 0644 '${remote_release_dir}/packaging/env/spanel-api.env.example' /etc/spanel/api.env.example && \
     install -m 0644 '${remote_release_dir}/packaging/env/spanel-web.env.example' /etc/spanel/web.env.example && \
     install -m 0644 '${remote_release_dir}/packaging/env/spanel-worker.env.example' /etc/spanel/worker.env.example && \
     if [ ! -f /etc/spanel/api.env ]; then install -m 0640 '${remote_release_dir}/packaging/env/spanel-api.env.example' /etc/spanel/api.env; fi && \
     if [ ! -f /etc/spanel/web.env ]; then install -m 0640 '${remote_release_dir}/packaging/env/spanel-web.env.example' /etc/spanel/web.env; fi && \
     if [ ! -f /etc/spanel/worker.env ]; then install -m 0640 '${remote_release_dir}/packaging/env/spanel-worker.env.example' /etc/spanel/worker.env; fi && \
     if grep -q '^SHP_VERSION=' /etc/spanel/api.env; then sed -i 's/^SHP_VERSION=.*/SHP_VERSION=${version}/' /etc/spanel/api.env; else printf '\nSHP_VERSION=${version}\n' >> /etc/spanel/api.env; fi && \
     if grep -q '^SHP_VERSION=' /etc/spanel/web.env; then sed -i 's/^SHP_VERSION=.*/SHP_VERSION=${version}/' /etc/spanel/web.env; else printf '\nSHP_VERSION=${version}\n' >> /etc/spanel/web.env; fi && \
     if grep -q '^SHP_VERSION=' /etc/spanel/worker.env; then sed -i 's/^SHP_VERSION=.*/SHP_VERSION=${version}/' /etc/spanel/worker.env; else printf '\nSHP_VERSION=${version}\n' >> /etc/spanel/worker.env; fi && \
     systemctl daemon-reload"

  if [[ "${mode}" == "passive" ]]; then
    ssh "${target_host}" \
      "systemctl disable spanel-api.service spanel-web.service spanel-worker.service || true && \
       systemctl stop spanel-api.service spanel-web.service spanel-worker.service || true"
    echo "Installed SHP ${version} on ${target_host} in passive mode"
    return
  fi

  ssh "${target_host}" \
    "systemctl enable spanel-api.service spanel-web.service spanel-worker.service && \
     systemctl restart spanel-api.service spanel-web.service spanel-worker.service && \
     systemctl is-active spanel-api.service spanel-web.service spanel-worker.service"
  echo "Installed SHP ${version} on ${target_host} in active mode"
}

if [[ "${target_host}" == "local" ]]; then
  activate_local
else
  activate_remote
fi
