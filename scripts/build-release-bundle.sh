#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-$(node -e "const fs=require('node:fs'); console.log(JSON.parse(fs.readFileSync('${repo_root}/package.json','utf8')).version)")}"
work_dir="$(mktemp -d)"
staging_dir="${work_dir}/simplehost-panel-${version}"
bundle_dir="${repo_root}/dist/releases"
bundle_path="${bundle_dir}/simplehost-panel-${version}.tar.gz"

cleanup() {
  rm -rf "${work_dir}"
}
trap cleanup EXIT

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install Node.js, npm, and pnpm first." >&2
  exit 1
fi

install -d "${bundle_dir}"
cp -a "${repo_root}/." "${staging_dir}"
rm -rf "${staging_dir}/.git" "${staging_dir}/node_modules" "${staging_dir}/dist"

(
  cd "${staging_dir}"
  pnpm install --frozen-lockfile
  pnpm build
)

tar -C "${work_dir}" -czf "${bundle_path}" "simplehost-panel-${version}"
echo "Created ${bundle_path}"
