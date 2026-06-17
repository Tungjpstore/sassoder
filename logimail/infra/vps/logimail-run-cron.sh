#!/usr/bin/env bash
set -euo pipefail

LABEL=${1:?label required}
PATHNAME=${2:?path required}
ENV_FILE=${LOGIMAIL_ENV_FILE:-/etc/logimail/logimail.env}
BASE_URL=${LOGIMAIL_CRON_BASE_URL:-https://mail.logivn.com}

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [ -z "${LOGIMAIL_CRON_KEY:-}" ]; then
  printf '[%s] missing LOGIMAIL_CRON_KEY\n' "$LABEL" >&2
  exit 2
fi

curl -fsS --retry 2 --retry-delay 5 --max-time 120 \
  -H "x-logimail-cron-key: ${LOGIMAIL_CRON_KEY}" \
  "${BASE_URL%/}${PATHNAME}"
printf '\n[%s] OK %s\n' "$LABEL" "$(date -Is)"
