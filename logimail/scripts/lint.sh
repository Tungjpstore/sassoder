#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
bash scripts/check-secrets.sh
if [ -d apps/logimail-web/node_modules ]; then
  npm --workspace @logivn/logimail-web run lint
else
  echo "Skip Next lint: dependencies are not installed."
fi
