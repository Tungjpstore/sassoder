#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

CF_API_BASE="https://api.cloudflare.com/client/v4"

cf_require() {
  require_env CLOUDFLARE_API_TOKEN CLOUDFLARE_ZONE_ID LOGIMAIL_DOMAIN
  require_command curl jq
}

cf_get_records() {
  local type="$1"
  local name="$2"
  curl -fsS -G "${CF_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-urlencode "type=${type}" \
    --data-urlencode "name=${name}"
}

cf_create_record() {
  local type="$1"
  local name="$2"
  local content="$3"
  local proxied="${4:-false}"
  local priority="${5:-}"
  local payload

  if [ "${type}" = "MX" ]; then
    payload="$(jq -n --arg type "${type}" --arg name "${name}" --arg content "${content}" --argjson priority "${priority}" '{type:$type,name:$name,content:$content,priority:$priority,ttl:1}')"
  elif [ "${type}" = "A" ]; then
    payload="$(jq -n --arg type "${type}" --arg name "${name}" --arg content "${content}" --argjson proxied "${proxied}" '{type:$type,name:$name,content:$content,proxied:$proxied,ttl:1}')"
  else
    payload="$(jq -n --arg type "${type}" --arg name "${name}" --arg content "${content}" '{type:$type,name:$name,content:$content,ttl:1}')"
  fi

  curl -fsS "${CF_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${payload}"
}

cf_update_record() {
  local record_id="$1"
  local type="$2"
  local name="$3"
  local content="$4"
  local proxied="${5:-false}"
  local priority="${6:-}"
  local payload

  if [ "${type}" = "MX" ]; then
    payload="$(jq -n --arg type "${type}" --arg name "${name}" --arg content "${content}" --argjson priority "${priority}" '{type:$type,name:$name,content:$content,priority:$priority,ttl:1}')"
  elif [ "${type}" = "A" ]; then
    payload="$(jq -n --arg type "${type}" --arg name "${name}" --arg content "${content}" --argjson proxied "${proxied}" '{type:$type,name:$name,content:$content,proxied:$proxied,ttl:1}')"
  else
    payload="$(jq -n --arg type "${type}" --arg name "${name}" --arg content "${content}" '{type:$type,name:$name,content:$content,ttl:1}')"
  fi

  curl -fsS -X PUT "${CF_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record_id}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "${payload}"
}

safe_dns_plan() {
  require_env LOGIMAIL_VPS_IP
  local domain="${LOGIMAIL_DOMAIN}"
  local ip="${LOGIMAIL_VPS_IP}"
  local mail_host="${LOGIMAIL_MAIL_HOSTNAME:-mail.${domain}}"
  local smtp_host="${LOGIMAIL_SMTP_HOSTNAME:-${mail_host}}"
  local imap_host="${LOGIMAIL_IMAP_HOSTNAME:-${mail_host}}"
  local app_host="${LOGIMAIL_APP_HOSTNAME:-}"
  local api_host="${LOGIMAIL_API_HOSTNAME:-}"
  local app_proxied="${LOGIMAIL_APP_PROXIED:-true}"
  local api_proxied="${LOGIMAIL_API_PROXIED:-true}"

  printf 'A\t%s\t%s\tfalse\t\n' "${mail_host}" "${ip}"
  if [ "${smtp_host}" != "${mail_host}" ]; then
    printf 'A\t%s\t%s\tfalse\t\n' "${smtp_host}" "${ip}"
  fi
  if [ "${imap_host}" != "${mail_host}" ] && [ "${imap_host}" != "${smtp_host}" ]; then
    printf 'A\t%s\t%s\tfalse\t\n' "${imap_host}" "${ip}"
  fi

  printf 'MX\t%s\t%s\tfalse\t10\n' "${domain}" "${mail_host}"
  printf 'TXT\t%s\tv=spf1 mx ip4:%s -all\tfalse\t\n' "${domain}" "${ip}"
  printf 'TXT\t_dmarc.%s\tv=DMARC1; p=none; rua=mailto:postmaster@%s\tfalse\t\n' "${domain}" "${domain}"
  if [ "${LOGIMAIL_APP_ON_VPS:-0}" = "1" ]; then
    if [ -n "${app_host}" ] && [ "${app_host}" != "${mail_host}" ] && [ "${app_host}" != "${smtp_host}" ] && [ "${app_host}" != "${imap_host}" ]; then
      printf 'A\t%s\t%s\t%s\t\n' "${app_host}" "${ip}" "${app_proxied}"
    fi
    if [ -n "${api_host}" ] && [ "${api_host}" != "${mail_host}" ] && [ "${api_host}" != "${smtp_host}" ] && [ "${api_host}" != "${imap_host}" ] && [ "${api_host}" != "${app_host}" ]; then
      printf 'A\t%s\t%s\t%s\t\n' "${api_host}" "${ip}" "${api_proxied}"
    fi
  fi
}

is_mail_transport_name() {
  if [ "$1" = "${LOGIMAIL_MAIL_HOSTNAME:-}" ] || [ "$1" = "${LOGIMAIL_SMTP_HOSTNAME:-}" ] || [ "$1" = "${LOGIMAIL_IMAP_HOSTNAME:-}" ]; then
    return 0
  fi
  case "$1" in
    mail.*|smtp.*|imap.*) return 0 ;;
    *) return 1 ;;
  esac
}
