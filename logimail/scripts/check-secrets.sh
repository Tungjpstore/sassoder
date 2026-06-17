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

scan_files() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files -co --exclude-standard -z
  else
    find . -path './node_modules' -prune -o -path './.next' -prune -o -type f -print0
  fi
}

is_scannable_file() {
  local file="${1#./}"
  case "${file}" in
    *.md|.env|.env.*|*/.env|*/.env.*|scripts/check-secrets.sh|*/node_modules/*|*/.next/*)
      return 1
      ;;
  esac
  return 0
}

failed=0
for pattern in "${patterns[@]}"; do
  : >/tmp/logimail-secret-scan.txt
  while IFS= read -r -d '' file; do
    is_scannable_file "${file}" || continue
    grep -IqE "${pattern}" "${file}" || continue
    file="./${file#./}"
    if ! is_allowed_match "${pattern}" "${file}"; then
      printf '%s\n' "${file}" >>/tmp/logimail-secret-scan.txt
    fi
  done < <(scan_files)

  if [ -s /tmp/logimail-secret-scan.txt ]; then
    echo "Potential secret/default found for pattern: ${pattern}"
    echo "Matched files only; values are intentionally not printed."
    cat /tmp/logimail-secret-scan.txt
    failed=1
  fi
done

rm -f /tmp/logimail-secret-scan.txt
exit "${failed}"
