#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  printf '[ops-test] %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local needle="$1" file="$2"
  grep -Fq -- "${needle}" "${file}" || fail "Expected ${file} to contain: ${needle}"
}

assert_nginx_proxy_header_inheritance() {
  local file="$1"
  local header
  for header in \
    'proxy_set_header Host $host;' \
    'proxy_set_header X-Forwarded-Host $host;' \
    'proxy_set_header X-Forwarded-Port 443;' \
    'proxy_set_header X-Forwarded-Proto https;'
  do
    assert_contains "${header}" "${file}"
  done

  if awk '
    /^[[:space:]]+location[[:space:]].*\{/ { in_location = 1 }
    in_location && /proxy_set_header/ { found = 1 }
    in_location && /^  }/ { in_location = 0 }
    END { exit found ? 0 : 1 }
  ' "${file}"; then
    fail "${file} defines proxy_set_header inside a location and disables server-level inheritance."
  fi
}

assert_contains 'WorkingDirectory=/opt/logimail/current' infra/vps/logimail-web.service.example
assert_contains 'WorkingDirectory=/opt/logimail/current' infra/vps/logimail-api.service.example
assert_contains 'WorkingDirectory=/opt/logimail/current' infra/vps/logimail-push-worker.service.example
assert_contains 'server_name mta-sts.logivn.com' infra/vps/nginx-mta-sts-logivn.conf.example
assert_contains 'server_name domain.logivn.com' infra/vps/nginx-domain-logivn.conf.example
assert_contains 'proxy_pass http://logimail_web' infra/vps/nginx-domain-logivn.conf.example
assert_contains 'return 302 /mail/inbox' infra/vps/nginx-mail-logivn.conf.example
assert_nginx_proxy_header_inheritance infra/vps/nginx-mail-logivn.conf.example
assert_nginx_proxy_header_inheritance infra/vps/nginx-domain-logivn.conf.example
assert_contains 'server_name mta-sts.logivn.com' infra/vps/nginx-mta-sts-bootstrap.conf.example
assert_contains 'location = /.well-known/mta-sts.txt' infra/vps/nginx-mta-sts-logivn.conf.example
assert_contains 'alias /opt/logimail/current/apps/logimail-web/public/.well-known/mta-sts.txt' infra/vps/nginx-mta-sts-logivn.conf.example
assert_contains 'Persistent=true' infra/vps/logimail-backup.timer.example
assert_contains 'RandomizedDelaySec=' infra/vps/logimail-backup.timer.example
assert_contains 'ReadWritePaths=-/var/backups/logimail /opt/logimail-backups/billionmail' infra/vps/logimail-backup.service.example
assert_contains 'flock -n 9' infra/vps/backup-billionmail.sh
assert_contains 'LOGIMAIL_BACKUP_RETENTION_DAYS' infra/vps/backup-billionmail.sh
assert_contains 'apps/logimail-web/node_modules/next' infra/vps/release-logimail.sh
assert_contains 'load_public_build_env' infra/vps/release-logimail.sh
assert_contains 'require_env NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY' infra/vps/release-logimail.sh
assert_contains 'LOGIMAIL_RELEASE_MAX_COUNT' infra/vps/release-logimail.sh
assert_contains 'LOGIMAIL_RELEASE_MIN_FREE_MB' infra/vps/release-logimail.sh
assert_contains 'flock -n 9' infra/vps/release-logimail.sh
assert_contains 'cd "${source_dir}"' infra/vps/release-logimail.sh
assert_contains 'REJECT --reject-with icmp-port-unreachable' infra/vps/fail2ban/logimail-docker-user.sh

if grep -REn -- '-P (DROP|drop)|-j (DROP|drop)' infra/vps/fail2ban >/dev/null; then
  fail 'Fail2ban Docker action must not introduce a DROP rule.'
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
mkdir -p "${tmp_dir}/bin"
cat >"${tmp_dir}/bin/iptables" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${LOGIMAIL_TEST_IPTABLES_LOG}"
case " $* " in
  *' -C '*) exit 1 ;;
  *) exit 0 ;;
esac
EOF
chmod 0755 "${tmp_dir}/bin/iptables"
ln -s iptables "${tmp_dir}/bin/ip6tables"
cat >"${tmp_dir}/bin/id" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "-u" ]; then
  printf '0\n'
  exit 0
fi
exec /usr/bin/id "$@"
EOF
chmod 0755 "${tmp_dir}/bin/id"

LOGIMAIL_TEST_IPTABLES_LOG="${tmp_dir}/iptables.log" \
PATH="${tmp_dir}/bin:${PATH}" \
  bash infra/vps/fail2ban/logimail-docker-user.sh ban postfix tcp 25,465,587 203.0.113.7
assert_contains 'DOCKER-USER 1 -p tcp -m multiport --dports 25,465,587 -j f2b-logimail-postfix' "${tmp_dir}/iptables.log"
assert_contains '-s 203.0.113.7 -m conntrack --ctstate NEW -j REJECT --reject-with icmp-port-unreachable' "${tmp_dir}/iptables.log"

release_help="$(bash infra/vps/release-logimail.sh --help)"
case "${release_help}" in
  *'current/rollback'*'symlinks'*) ;;
  *) fail 'Release helper help text is incomplete.' ;;
esac
case "${release_help}" in
  *'LOGIMAIL_RELEASE_MAX_COUNT'*'LOGIMAIL_RELEASE_MIN_FREE_MB'*) ;;
  *) fail 'Release helper retention guard help is incomplete.' ;;
esac

printf '[ops-test] operational asset checks passed.\n'
