#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/opt/logivn}
APP_REPO=${APP_REPO:-$APP_ROOT/app}
CRON_FILE=/etc/cron.d/logivn-vps

cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

15 2 * * * root $APP_REPO/infra/vps/scripts/backup.sh >> $APP_ROOT/logs/backup.log 2>&1
0 4 * * * root certbot renew --quiet --post-hook "systemctl reload nginx" >> $APP_ROOT/logs/certbot-renew.log 2>&1
35 4 * * 0 root docker system prune -af --filter "until=168h" >> $APP_ROOT/logs/docker-prune.log 2>&1
*/5 * * * * root $APP_REPO/infra/vps/scripts/validate.sh --local-only >> $APP_ROOT/logs/health.log 2>&1
EOF

chmod 644 "$CRON_FILE"
mkdir -p "$APP_ROOT/logs"
systemctl reload cron || systemctl reload crond || true
printf 'Installed %s\n' "$CRON_FILE"
