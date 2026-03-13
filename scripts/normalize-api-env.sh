#!/usr/bin/env bash
set -euo pipefail

target_path="${1:?usage: normalize-api-env.sh <env-path>}"

if [[ ! -f "${target_path}" ]]; then
  echo "env file not found: ${target_path}" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  local line
  local value

  line="$(grep -E "^${key}=" "${target_path}" | tail -n 1 || true)"

  if [[ -z "${line}" ]]; then
    return 0
  fi

  value="${line#*=}"

  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:-1}"
  fi

  printf '%s' "${value}"
}

write_env_value() {
  local key="$1"
  local value="$2"

  if grep -q -E "^${key}=" "${target_path}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${target_path}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >>"${target_path}"
  fi
}

current_email="$(read_env_value "SHP_BOOTSTRAP_ADMIN_EMAIL")"

if [[ -n "${current_email}" && "${current_email}" != "admin@example.com" ]]; then
  exit 0
fi

default_domain="$(read_env_value "SHP_DEFAULT_DOMAIN")"

if [[ -z "${default_domain}" ]]; then
  public_hostname="$(read_env_value "SHP_PUBLIC_HOSTNAME")"

  if [[ -n "${public_hostname}" && "${public_hostname}" == *.* ]]; then
    default_domain="${public_hostname#*.}"
  fi
fi

if [[ -z "${default_domain}" ]]; then
  exit 0
fi

write_env_value "SHP_BOOTSTRAP_ADMIN_EMAIL" "webmaster@${default_domain}"
