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

response_file="$(mktemp)"
trap 'rm -f "${response_file}"' EXIT

set +e
http_status=$(curl -sS --retry 2 --retry-delay 5 --max-time 120 \
  -o "${response_file}" \
  -w '%{http_code}' \
  -H "x-logimail-cron-key: ${LOGIMAIL_CRON_KEY}" \
  "${BASE_URL%/}${PATHNAME}")
curl_status=$?
set -e

if [ "${curl_status}" -ne 0 ]; then
  printf '[%s] FAILED curl=%s HTTP=%s %s\n' "$LABEL" "${curl_status}" "${http_status:-unknown}" "$(date -Is)" >&2
  sed -n '1,40p' "${response_file}" >&2
  exit 1
fi

if [ "${http_status}" -lt 200 ] || [ "${http_status}" -ge 300 ]; then
  printf '[%s] FAILED HTTP %s %s\n' "$LABEL" "${http_status}" "$(date -Is)" >&2
  sed -n '1,40p' "${response_file}" >&2
  exit 1
fi

cat "${response_file}"
printf '\n[%s] OK HTTP %s %s\n' "$LABEL" "${http_status}" "$(date -Is)"
