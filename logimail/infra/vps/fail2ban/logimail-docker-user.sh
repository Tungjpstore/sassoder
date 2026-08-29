#!/usr/bin/env bash
set -euo pipefail

# Fail2ban action helper. It deliberately owns only f2b-logimail-* chains and
# adds narrow REJECT rules; it never changes a default policy or inserts DROP.
action="${1:-}"
jail="${2:-}"
protocol="${3:-}"
ports="${4:-}"
ip="${5:-}"

usage() {
  echo "Usage: $0 {start|stop|check|ban|unban} {postfix|dovecot} tcp <ports> [ip]" >&2
  exit 2
}

require_root() {
  [ "$(id -u)" -eq 0 ] || { echo "Must run as root." >&2; exit 1; }
}

validate_jail() {
  case "${jail}" in
    postfix)
      [ "${ports}" = "25,465,587" ] || usage
      ;;
    dovecot)
      [ "${ports}" = "110,143,993,995" ] || usage
      ;;
    *) usage ;;
  esac
  [ "${protocol}" = "tcp" ] || usage
}

validate_ip() {
  [ -n "${ip}" ] || usage
  if [[ "${ip}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    local octet
    IFS='.' read -r -a octets <<< "${ip}"
    for octet in "${octets[@]}"; do
      (( 10#${octet} <= 255 )) || usage
    done
    family="ipv4"
  elif [[ "${ip}" =~ ^[0-9A-Fa-f:]+$ ]] && [[ "${ip}" == *:* ]]; then
    family="ipv6"
  else
    usage
  fi
}

chain_for() {
  printf 'f2b-logimail-%s' "${jail}"
}

tool_for_family() {
  case "$1" in
    ipv4) printf 'iptables' ;;
    ipv6) printf 'ip6tables' ;;
    *) return 1 ;;
  esac
}

run_for_available_families() {
  local family tool available=0
  for family in ipv4 ipv6; do
    tool="$(tool_for_family "${family}")"
    command -v "${tool}" >/dev/null 2>&1 || continue
    available=$((available + 1))
    "$@" "${family}" "${tool}"
  done
  [ "${available}" -gt 0 ]
}

ensure_chain() {
  local family="$1" tool="$2" chain
  chain="$(chain_for)"
  "${tool}" -w -nL DOCKER-USER >/dev/null
  "${tool}" -w -nL "${chain}" >/dev/null 2>&1 || "${tool}" -w -N "${chain}"
  "${tool}" -w -C DOCKER-USER -p tcp -m multiport --dports "${ports}" -j "${chain}" >/dev/null 2>&1 || \
    "${tool}" -w -I DOCKER-USER 1 -p tcp -m multiport --dports "${ports}" -j "${chain}"
}

remove_chain() {
  local family="$1" tool="$2" chain
  chain="$(chain_for)"
  "${tool}" -w -nL "${chain}" >/dev/null 2>&1 || return 0
  while "${tool}" -w -C DOCKER-USER -p tcp -m multiport --dports "${ports}" -j "${chain}" >/dev/null 2>&1; do
    "${tool}" -w -D DOCKER-USER -p tcp -m multiport --dports "${ports}" -j "${chain}"
  done
  "${tool}" -w -F "${chain}"
  "${tool}" -w -X "${chain}"
}

check_chain() {
  local family="$1" tool="$2" chain
  chain="$(chain_for)"
  "${tool}" -w -nL DOCKER-USER >/dev/null
  "${tool}" -w -nL "${chain}" >/dev/null
  "${tool}" -w -C DOCKER-USER -p tcp -m multiport --dports "${ports}" -j "${chain}" >/dev/null
}

ban_ip() {
  local family="$1" tool="$2" chain
  chain="$(chain_for)"
  "${tool}" -w -C "${chain}" -s "${ip}" -m conntrack --ctstate NEW -j REJECT --reject-with icmp-port-unreachable >/dev/null 2>&1 || \
    "${tool}" -w -I "${chain}" 1 -s "${ip}" -m conntrack --ctstate NEW -j REJECT --reject-with icmp-port-unreachable
}

unban_ip() {
  local family="$1" tool="$2" chain
  chain="$(chain_for)"
  while "${tool}" -w -C "${chain}" -s "${ip}" -m conntrack --ctstate NEW -j REJECT --reject-with icmp-port-unreachable >/dev/null 2>&1; do
    "${tool}" -w -D "${chain}" -s "${ip}" -m conntrack --ctstate NEW -j REJECT --reject-with icmp-port-unreachable
  done
}

require_root
validate_jail

case "${action}" in
  start) run_for_available_families ensure_chain ;;
  stop) run_for_available_families remove_chain ;;
  check) run_for_available_families check_chain ;;
  ban) validate_ip; tool="$(tool_for_family "${family}")"; command -v "${tool}" >/dev/null; ensure_chain "${family}" "${tool}"; ban_ip "${family}" "${tool}" ;;
  unban) validate_ip; tool="$(tool_for_family "${family}")"; command -v "${tool}" >/dev/null; unban_ip "${family}" "${tool}" ;;
  *) usage ;;
esac
