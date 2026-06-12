#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

run_step() {
  local name="$1"
  shift
  printf '\n[check] %s\n' "${name}"
  "$@"
}

restore_dry_run_sample() {
  (
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "${tmp_dir}"' EXIT

    mkdir -p "${tmp_dir}/sample"
    printf '%s\n' 'logimail restore dry-run sample' > "${tmp_dir}/sample/README.txt"
    tar -czf "${tmp_dir}/sample.tar.gz" -C "${tmp_dir}" sample
    sha256sum "${tmp_dir}/sample.tar.gz" > "${tmp_dir}/sample.tar.gz.sha256"

    LOGIMAIL_RESTORE_ARCHIVE="${tmp_dir}/sample.tar.gz" infra/vps/restore-dry-run.sh >/dev/null

    if command -v openssl >/dev/null 2>&1; then
      local restore_key
      restore_key='logimail-check-restore-key-not-secret'
      LOGIMAIL_BACKUP_ENCRYPTION_KEY="${restore_key}" \
        openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
        -pass env:LOGIMAIL_BACKUP_ENCRYPTION_KEY \
        -in "${tmp_dir}/sample.tar.gz" \
        -out "${tmp_dir}/sample.tar.gz.enc"
      sha256sum "${tmp_dir}/sample.tar.gz.enc" > "${tmp_dir}/sample.tar.gz.enc.sha256"

      LOGIMAIL_RESTORE_ARCHIVE="${tmp_dir}/sample.tar.gz.enc" \
        LOGIMAIL_BACKUP_ENCRYPTION_KEY="${restore_key}" \
        infra/vps/restore-dry-run.sh >/dev/null
    else
      printf '[check] openssl not found; skipped encrypted restore dry-run sample.\n'
    fi
  )
}

run_step 'web typecheck' npm run typecheck:web
run_step 'api typecheck' npm run typecheck:api
run_step 'web API smoke tests' npm run smoke:api:web
run_step 'shell syntax' sh -c "find . -path './node_modules' -prune -o -name '*.sh' -print0 | xargs -0 -n1 bash -n"
run_step 'secret scan' bash scripts/check-secrets.sh
run_step 'restore dry-run sample' restore_dry_run_sample
run_step 'npm audit' npm audit --audit-level=moderate

printf '\n[check] all LogiMail checks passed.\n'
