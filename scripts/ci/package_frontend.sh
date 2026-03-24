#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WEB_DIR="${1:-${REPO_ROOT}/web}"

if [[ ! -f "${WEB_DIR}/package.json" ]]; then
  echo "package.json not found in ${WEB_DIR}" >&2
  exit 1
fi

cd "${WEB_DIR}"
npm ci
npm run build
tar -cJf frontend.tar.xz -C dist .
