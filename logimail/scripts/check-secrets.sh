#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

patterns=(
  'Global API Key'
  'CLOUDFLARE_API_KEY='
  'SUPABASE_SERVICE_ROLE_KEY=ey'
  'BILLIONMAIL_API_KEY=.'
  'ADMIN_PASSWORD=billion$'
  '^REDISPASS=[A-Za-z0-9+/=_-]{12,}$'
  '^REDIS_PASSWORD=[A-Za-z0-9+/=_-]{12,}$'
  '^DBPASS=[A-Za-z0-9+/=_-]{12,}$'
)

is_allowed_match() {
  local pattern="$1"
  local file="$2"

  case "${pattern}|${file#./}" in
    'Global API Key|apps/logimail-web/src/components/logimail-pages.tsx'|'Global API Key|apps/logimail-web/src/lib/mock-data.ts')
      return 0
      ;;
  esac

  return 1
}

failed=0
for pattern in "${patterns[@]}"; do
  : >/tmp/logimail-secret-scan.txt
  if grep -RIl --exclude-dir=node_modules --exclude-dir=.next --exclude='*.md' --exclude='check-secrets.sh' -E "${pattern}" . | while IFS= read -r file; do
    if ! is_allowed_match "${pattern}" "${file}"; then
      printf '%s\n' "${file}" >>/tmp/logimail-secret-scan.txt
    fi
  done && [ -s /tmp/logimail-secret-scan.txt ]; then
    echo "Potential secret/default found for pattern: ${pattern}"
    echo "Matched files only; values are intentionally not printed."
    cat /tmp/logimail-secret-scan.txt
    failed=1
  fi
done

rm -f /tmp/logimail-secret-scan.txt
exit "${failed}"
