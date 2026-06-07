#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/opt/logivn}
APP_REPO=${APP_REPO:-$APP_ROOT/app}
CRON_FILE=/etc/cron.d/logivn-vps
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
BACKUP_TIMEZONE=${BACKUP_TIMEZONE:-Asia/Ho_Chi_Minh}
SYSTEMD_DIR=${SYSTEMD_DIR:-/etc/systemd/system}
DAILY_BACKUP_SERVICE=logivn-backup-daily.service
DAILY_BACKUP_TIMER=logivn-backup-daily.timer
MANUAL_CLAIM_SERVICE=logivn-backup-manual-claim.service
MANUAL_CLAIM_TIMER=logivn-backup-manual-claim.timer

if [ -f "$ENV_FILE" ]; then
  configured_timezone=$(awk -F= '
    /^[[:space:]]*BACKUP_TIMEZONE[[:space:]]*=/ {
      value = $0
      sub(/^[[:space:]]*BACKUP_TIMEZONE[[:space:]]*=/, "", value)
      gsub(/^[[:space:]\"'"'"']+|[[:space:]\"'"'"']+$/, "", value)
      print value
    }
  ' "$ENV_FILE" | tail -n 1)
  if [ -n "$configured_timezone" ]; then
    BACKUP_TIMEZONE=$configured_timezone
  fi
fi

systemd_calendar_or_fallback() {
  local calendar=$1
  local fallback=${2:-}

  if ! command -v systemd-analyze >/dev/null 2>&1; then
    printf '%s' "$calendar"
    return 0
  fi

  if systemd-analyze calendar "$calendar" >/dev/null 2>&1; then
    printf '%s' "$calendar"
    return 0
  fi

  if [ -n "$fallback" ] && systemd-analyze calendar "$fallback" >/dev/null 2>&1; then
    printf 'Warning: systemd does not accept calendar %s; using %s instead.\n' "$calendar" "$fallback" >&2
    printf '%s' "$fallback"
    return 0
  fi

  printf 'Warning: systemd does not accept calendar %s; skipping related timer.\n' "$calendar" >&2
  return 1
}

install_systemd_timers() {
  if ! command -v systemctl >/dev/null 2>&1; then
    printf 'Warning: systemctl not found; skipping systemd backup timers.\n' >&2
    return 0
  fi
  if [ ! -d "$SYSTEMD_DIR" ]; then
    printf 'Warning: %s not found; skipping systemd backup timers.\n' "$SYSTEMD_DIR" >&2
    return 0
  fi

  local daily_calendar
  local manual_calendar
  daily_calendar=$(systemd_calendar_or_fallback "*-*-* 02:10:00 $BACKUP_TIMEZONE" "*-*-* 19:10:00 UTC") || return 0
  manual_calendar=$(systemd_calendar_or_fallback "*:0/5") || return 0

  cat > "$SYSTEMD_DIR/$DAILY_BACKUP_SERVICE" <<EOF
[Unit]
Description=LogiVN daily backup
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
User=root
Environment="APP_ROOT=$APP_ROOT"
Environment="ENV_FILE=$ENV_FILE"
Environment="BACKUP_DAILY_SKIP_IF_COMPLETED=true"
WorkingDirectory=$APP_REPO
ExecStart=/bin/bash -lc 'APP_ROOT="$APP_ROOT" ENV_FILE="$ENV_FILE" BACKUP_DAILY_SKIP_IF_COMPLETED=true "$APP_REPO/infra/vps/scripts/backup.sh" --daily >> "$APP_ROOT/logs/backup.log" 2>&1'
TimeoutStartSec=6h
EOF

  cat > "$SYSTEMD_DIR/$DAILY_BACKUP_TIMER" <<EOF
[Unit]
Description=Run LogiVN daily backup fallback after the cron window

[Timer]
OnCalendar=$daily_calendar
Persistent=true
AccuracySec=1min
RandomizedDelaySec=30s
Unit=$DAILY_BACKUP_SERVICE

[Install]
WantedBy=timers.target
EOF

  cat > "$SYSTEMD_DIR/$MANUAL_CLAIM_SERVICE" <<EOF
[Unit]
Description=LogiVN manual backup queue claim
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
User=root
Environment="APP_ROOT=$APP_ROOT"
Environment="ENV_FILE=$ENV_FILE"
WorkingDirectory=$APP_REPO
ExecStart=/bin/bash -lc 'APP_ROOT="$APP_ROOT" ENV_FILE="$ENV_FILE" "$APP_REPO/infra/vps/scripts/backup.sh" --claim-manual >> "$APP_ROOT/logs/backup-manual.log" 2>&1'
TimeoutStartSec=2h
EOF

  cat > "$SYSTEMD_DIR/$MANUAL_CLAIM_TIMER" <<EOF
[Unit]
Description=Claim queued LogiVN manual backups every 5 minutes

[Timer]
OnCalendar=$manual_calendar
Persistent=true
AccuracySec=1min
RandomizedDelaySec=20s
Unit=$MANUAL_CLAIM_SERVICE

[Install]
WantedBy=timers.target
EOF

  chmod 644 \
    "$SYSTEMD_DIR/$DAILY_BACKUP_SERVICE" \
    "$SYSTEMD_DIR/$DAILY_BACKUP_TIMER" \
    "$SYSTEMD_DIR/$MANUAL_CLAIM_SERVICE" \
    "$SYSTEMD_DIR/$MANUAL_CLAIM_TIMER"

  systemctl daemon-reload
  systemctl enable --now "$DAILY_BACKUP_TIMER" "$MANUAL_CLAIM_TIMER"
  printf 'Installed systemd timers: %s, %s\n' "$DAILY_BACKUP_TIMER" "$MANUAL_CLAIM_TIMER"
  systemctl list-timers "$DAILY_BACKUP_TIMER" "$MANUAL_CLAIM_TIMER" --no-pager || true
}

cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
CRON_TZ=$BACKUP_TIMEZONE
TZ=$BACKUP_TIMEZONE

0 2 * * * root BACKUP_DAILY_SKIP_IF_COMPLETED=true $APP_REPO/infra/vps/scripts/backup.sh --daily >> $APP_ROOT/logs/backup.log 2>&1
0 3 * * 0 root $APP_REPO/infra/vps/scripts/backup.sh --weekly >> $APP_ROOT/logs/backup.log 2>&1
0 4 1 * * root $APP_REPO/infra/vps/scripts/backup.sh --monthly >> $APP_ROOT/logs/backup.log 2>&1
20 4 1 * * root $APP_REPO/infra/vps/scripts/backup.sh --restore-test >> $APP_ROOT/logs/backup-restore-test.log 2>&1
*/5 * * * * root $APP_REPO/infra/vps/scripts/backup.sh --claim-manual >> $APP_ROOT/logs/backup-manual.log 2>&1
0 4 * * * root certbot renew --quiet --post-hook "systemctl reload nginx" >> $APP_ROOT/logs/certbot-renew.log 2>&1
35 4 * * 0 root docker system prune -af --filter "until=168h" >> $APP_ROOT/logs/docker-prune.log 2>&1
*/5 * * * * root $APP_REPO/infra/vps/scripts/validate.sh --local-only >> $APP_ROOT/logs/health.log 2>&1

# App-level cron handoff. These no-op until LOGIVN_VPS_APP_CRONS_ENABLED=true is set in $APP_ROOT/.env.
0 1 * * * root $APP_REPO/infra/vps/scripts/run-app-crons.sh reports >> $APP_ROOT/logs/app-crons.log 2>&1
30 1 * * * root $APP_REPO/infra/vps/scripts/run-app-crons.sh ai-ops >> $APP_ROOT/logs/app-crons.log 2>&1
*/15 * * * * root $APP_REPO/infra/vps/scripts/run-app-crons.sh reservations-expire >> $APP_ROOT/logs/app-crons.log 2>&1
15 2 * * * root $APP_REPO/infra/vps/scripts/run-app-crons.sh subscriptions >> $APP_ROOT/logs/app-crons.log 2>&1
EOF

chmod 644 "$CRON_FILE"
mkdir -p "$APP_ROOT/logs"
if systemctl reload cron >/dev/null 2>&1; then
  :
elif systemctl restart cron >/dev/null 2>&1; then
  :
elif systemctl reload crond >/dev/null 2>&1; then
  :
elif systemctl restart crond >/dev/null 2>&1; then
  :
else
  printf 'Warning: could not reload or restart cron service; verify cron daemon manually.\n' >&2
fi
printf 'Installed %s\n' "$CRON_FILE"
install_systemd_timers
