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
run_step 'API health tests' node --import tsx --test apps/logimail-api/src/services/ops-agent-service.test.ts
run_step 'web lint' npm --workspace @logivn/logimail-web run lint
run_step 'web API smoke tests' npm run smoke:api:web
run_step 'browser auth persistence tests' npm --workspace @logivn/logimail-web exec -- node --import tsx --test src/lib/auth-login-client.test.mjs
run_step 'Google auth and SSO flow tests' npm --workspace @logivn/logimail-web exec -- node --import tsx --test src/lib/sso-handoff.test.mjs src/lib/sso-browser-flow.test.mjs src/lib/security/auth-sso-contract.test.mjs
run_step 'auth redirect and logout tests' npm --workspace @logivn/logimail-web exec -- node --import tsx --test src/lib/safe-next-path.test.mjs src/lib/security/auth-logout-contract.test.mjs
run_step 'auth domain and UX tests' npm --workspace @logivn/logimail-web exec -- node --test src/lib/security/auth-domain-reset-contract.test.mjs src/lib/security/auth-ux-contract.test.mjs
run_step 'mail compose and mailbox safety contract tests' node --test apps/logimail-web/src/lib/mail-compose-contract.test.mjs apps/logimail-web/src/lib/mailbox-safety-contract.test.mjs
run_step 'compose draft cache tests' npm --workspace @logivn/logimail-web exec -- node --import tsx --test src/lib/compose-draft-cache.test.mjs
run_step 'admin UI truthfulness tests' node --test apps/logimail-web/src/lib/admin-ui-truthfulness-contract.test.mjs
run_step 'admin MFA step-up tests' npm --workspace @logivn/logimail-web exec -- node --import tsx --test src/lib/admin-mfa-step-up.test.mjs
run_step 'admin action dialog tests' node --test apps/logimail-web/src/lib/control-action-dialog-contract.test.mjs
run_step 'account deletion security tests' node --test apps/logimail-web/src/lib/security/account-deletion-contract.test.mjs
run_step 'P0 security contract tests' node --test apps/logimail-web/src/lib/security/p0-security-contract.test.mjs supabase/p0-security-hardening-migration.test.mjs
run_step 'audit actor detach migration test' node --test supabase/audit-actor-detach-migration.test.mjs
run_step 'atomic send quota contract tests' node --test supabase/atomic-send-quota-migration.test.mjs apps/logimail-web/src/lib/ops/mailops-hardening-contract.test.mjs
run_step 'workspace invite contract tests' node --test apps/logimail-web/src/lib/security/workspace-invites-contract.test.mjs
run_step 'invite journal migration tests' node --test supabase/invite-operation-journal-migration.test.mjs
run_step 'session activity migration tests' node --test supabase/session-activity-migration.test.mjs
run_step 'SSO handoff migration tests' node --test supabase/sso-handoffs-migration.test.mjs
run_step 'shell syntax' sh -c "find . -path './node_modules' -prune -o -name '*.sh' -print0 | xargs -0 -n1 bash -n"
run_step 'operational asset contracts' bash scripts/test-ops-assets.sh
run_step 'secret scan' bash scripts/check-secrets.sh
run_step 'restore dry-run sample' restore_dry_run_sample
run_step 'npm audit' npm audit --audit-level=moderate

printf '\n[check] all LogiMail checks passed.\n'
