#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="$REPO_ROOT/infra/vps"
APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
BACKUP_ROOT=${BACKUP_ROOT:-$APP_ROOT/backups}
LOCAL_ONLY=false

if [ "${1:-}" = "--local-only" ]; then
  LOCAL_ONLY=true
fi

log() {
  printf '[logivn-readiness] %s\n' "$*"
}

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    printf 'Env file not found: %s\n' "$ENV_FILE" >&2
    exit 2
  fi

  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" "$@"
}

check_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing command: %s\n' "$1" >&2
    exit 1
  }
}

wait_for_url() {
  local url="$1"
  local label="$2"

  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      log "$label OK"
      return
    fi
    sleep 2
  done

  printf 'Timed out waiting for %s at %s\n' "$label" "$url" >&2
  compose ps >&2 || true
  exit 1
}

check_http_status() {
  local expected="$1"
  local label="$2"
  shift 2

  local actual
  actual="$(curl -sS -o /tmp/logivn-readiness-http.out -w '%{http_code}' --max-time 10 "$@")"
  if [ "$actual" != "$expected" ]; then
    printf '%s expected HTTP %s, got %s\n' "$label" "$expected" "$actual" >&2
    sed -n '1,120p' /tmp/logivn-readiness-http.out >&2 || true
    exit 1
  fi
  log "$label HTTP $actual"
}

check_redis_runtime() {
  log "Checking Redis durability and memory policy"

  local info
  info="$(compose exec -T redis redis-cli --no-auth-warning -a "$REDIS_PASSWORD" INFO persistence memory)"

  printf '%s\n' "$info" | grep -q '^aof_enabled:1' || {
    printf 'Redis AOF is not enabled\n' >&2
    exit 1
  }

  printf '%s\n' "$info" | grep -q '^maxmemory_policy:noeviction' || {
    printf 'Redis maxmemory_policy is not noeviction\n' >&2
    exit 1
  }

  local maxmemory
  maxmemory="$(printf '%s\n' "$info" | awk -F: '/^maxmemory:/ { gsub(/\r/, "", $2); print $2 }')"
  if [ -z "$maxmemory" ] || [ "$maxmemory" -le 0 ]; then
    printf 'Redis maxmemory must be greater than zero\n' >&2
    exit 1
  fi

  log "Redis AOF/noeviction/maxmemory OK"
}

check_prometheus_and_grafana() {
  log "Checking Prometheus, Alertmanager, and Grafana"

  compose exec -T prometheus promtool check config /etc/prometheus/prometheus.yml >/dev/null
  compose exec -T alertmanager amtool check-config /etc/alertmanager/alertmanager.yml >/dev/null

  wait_for_url "http://127.0.0.1:9090/-/ready" prometheus
  wait_for_url "http://127.0.0.1:9093/-/ready" alertmanager
  wait_for_url "http://127.0.0.1:3002/grafana/api/health" grafana

  check_http_status 200 "Grafana Prometheus datasource" \
    -u "${GF_SECURITY_ADMIN_USER:-logivn-admin}:$GF_SECURITY_ADMIN_PASSWORD" \
    "http://127.0.0.1:3002/grafana/api/datasources/uid/logivn-prometheus"
  check_http_status 200 "Grafana Redis/BullMQ dashboard" \
    -u "${GF_SECURITY_ADMIN_USER:-logivn-admin}:$GF_SECURITY_ADMIN_PASSWORD" \
    "http://127.0.0.1:3002/grafana/api/dashboards/uid/logivn-redis-bullmq"

  for _ in $(seq 1 20); do
    if node <<'NODE'
const response = await fetch("http://127.0.0.1:9090/api/v1/targets?state=active");
if (!response.ok) throw new Error(`Prometheus targets API failed ${response.status}`);
const body = await response.json();
const required = new Set([
  "gateway:3100",
  "socket:3200",
  "ai-service:3300",
  "image-service:3400",
  "worker:3500",
  "telegram-bot:3600",
  "redis-exporter:9121"
]);
const unhealthy = [];
for (const target of body.data.activeTargets || []) {
  const address = target.discoveredLabels?.__address__;
  if (required.has(address) && target.health !== "up") {
    unhealthy.push(`${address}:${target.health}`);
  }
  required.delete(address);
}
if (required.size || unhealthy.length) {
  throw new Error(`Prometheus target check failed; missing=${[...required].join(",") || "none"} unhealthy=${unhealthy.join(",") || "none"}`);
}
NODE
    then
      log "Prometheus targets OK"
      return
    fi
    sleep 3
  done

  printf 'Prometheus targets did not become healthy in time\n' >&2
  exit 1
}

check_gateway_operations() {
  local gateway_url="http://127.0.0.1:${GATEWAY_PORT:-3100}"

  log "Checking event backbone, queues, locks, rate limits, and realtime state"
  SMOKE_BASE_URL="$gateway_url" node <<'NODE'
const base = process.env.SMOKE_BASE_URL;
const key = process.env.LOGIVN_INTERNAL_API_KEY;
if (!key) throw new Error("LOGIVN_INTERNAL_API_KEY is required");

const tenantId = "tenant-readiness";
const eventId = `readiness-${Date.now()}`;
const headers = { "content-type": "application/json", "x-logivn-internal-key": key };

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 429 && response.status !== 423) {
    throw new Error(`${path} failed ${response.status}: ${JSON.stringify(json)}`);
  }
  return { status: response.status, json };
}

await request("/redis/health");
await request("/events", {
  method: "POST",
  body: JSON.stringify({ type: "order.confirmed", eventId, tenantId, orderId: "order-readiness" })
});
await new Promise((resolve) => setTimeout(resolve, 1200));

const recent = await request(`/events/recent?tenantId=${tenantId}&limit=10`);
const lock = await request("/locks/acquire", {
  method: "POST",
  body: JSON.stringify({ tenantId, key: `lock:tenant:${tenantId}:payment:invoice-readiness`, ttlMs: 10000 })
});
const released = await request("/locks/release", {
  method: "POST",
  body: JSON.stringify({ key: `lock:tenant:${tenantId}:payment:invoice-readiness`, token: lock.json.token })
});
const rate1 = await request("/rate-limits/check", {
  method: "POST",
  body: JSON.stringify({ tenantId, scope: "qr", identifier: eventId, limit: 1, windowMs: 60000 })
});
const rate2 = await request("/rate-limits/check", {
  method: "POST",
  body: JSON.stringify({ tenantId, scope: "qr", identifier: eventId, limit: 1, windowMs: 60000 })
});
await request("/realtime/state", {
  method: "POST",
  body: JSON.stringify({
    tenantId,
    scope: "tables",
    identifier: "table-readiness",
    value: { status: "occupied", orderId: "order-readiness" },
    ttlSeconds: 60
  })
});
const state = await request(`/realtime/state?tenantId=${tenantId}&scope=tables&identifier=table-readiness`);
const queues = await request("/queues");

const summary = {
  eventRecorded: recent.json.events.some((item) => item.eventId === eventId),
  lockAcquired: lock.json.acquired === true,
  lockReleased: released.json.released === true,
  firstRateLimitAllowed: rate1.json.allowed === true,
  secondRateLimitBlocked: rate2.status === 429 && rate2.json.allowed === false,
  realtimeStateRoundTrip: state.json.state?.status === "occupied",
  queueInventory: Object.keys(queues.json.queues || {}).length
};

console.log(JSON.stringify(summary, null, 2));
if (!Object.entries(summary).every(([key, value]) => key === "queueInventory" ? value >= 42 : value === true)) {
  process.exit(1);
}
NODE
  log "Gateway operational smoke OK"
}

check_bull_board() {
  if [ "${BULL_BOARD_ENABLED:-false}" != "true" ]; then
    log "Bull Board disabled; skipping dashboard auth check"
    return
  fi

  local gateway_url="http://127.0.0.1:${GATEWAY_PORT:-3100}"
  check_http_status 401 "Bull Board without credentials" "$gateway_url${BULL_BOARD_BASE_PATH:-/queues/board}/"
  check_http_status 200 "Bull Board with credentials" \
    -u "${BULL_BOARD_USERNAME:-logivn-ops}:$BULL_BOARD_PASSWORD" \
    "$gateway_url${BULL_BOARD_BASE_PATH:-/queues/board}/"
}

check_latest_backup() {
  local latest
  latest="$(find "$BACKUP_ROOT" -maxdepth 1 -type f -name '*.tgz' -print 2>/dev/null | sort | tail -1 || true)"
  if [ -z "$latest" ]; then
    log "No backup archive found under $BACKUP_ROOT yet"
    return
  fi

  "$VPS_DIR/scripts/restore-redis-backup.sh" --dry-run "$latest" >/dev/null
  log "Latest backup archive is restorable: $latest"
}

check_public_hosts() {
  if [ "$LOCAL_ONLY" = true ]; then
    log "Skipping public DNS/HTTPS checks in --local-only mode"
    return
  fi

  for host in api.logivn.com ws.logivn.com worker.logivn.com monitor.logivn.com; do
    if command -v dig >/dev/null 2>&1; then
      log "$host DNS: $(dig +short "$host" | tr '\n' ' ')"
    fi
  done

  wait_for_url "https://api.logivn.com/health" "api HTTPS"
  wait_for_url "https://ws.logivn.com/health" "ws HTTPS"
  wait_for_url "https://worker.logivn.com/health" "worker HTTPS"
  wait_for_url "https://monitor.logivn.com/health" "monitor HTTPS"
}

main() {
  load_env
  check_command docker
  check_command curl
  check_command node

  "$VPS_DIR/scripts/doctor.sh"
  compose config --quiet
  compose ps

  wait_for_url "http://127.0.0.1:${GATEWAY_PORT:-3100}/health" gateway
  wait_for_url "http://127.0.0.1:${SOCKET_PORT:-3200}/health" socket
  wait_for_url "http://127.0.0.1:${AI_SERVICE_PORT:-3300}/health" ai-service
  wait_for_url "http://127.0.0.1:${IMAGE_SERVICE_PORT:-3400}/health" image-service
  wait_for_url "http://127.0.0.1:${WORKER_PORT:-3500}/health" worker
  wait_for_url "http://127.0.0.1:${TELEGRAM_BOT_PORT:-3600}/health" telegram-bot

  compose exec -T redis redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping | grep -q PONG
  check_redis_runtime
  check_gateway_operations
  check_bull_board
  check_prometheus_and_grafana
  check_latest_backup
  check_public_hosts

  log "Production readiness checks passed"
}

main "$@"
