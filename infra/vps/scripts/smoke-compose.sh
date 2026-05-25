#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="$REPO_ROOT/infra/vps"
COMPOSE_FILE="$VPS_DIR/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$VPS_DIR/.env.example}"
PROJECT_NAME="${PROJECT_NAME:-logivn-smoke}"

export REDIS_PASSWORD="${REDIS_PASSWORD:-local-smoke-redis-password-not-production}"
export LOGIVN_INTERNAL_API_KEY="${LOGIVN_INTERNAL_API_KEY:-local-smoke-internal-key-not-production}"
export GF_SECURITY_ADMIN_PASSWORD="${GF_SECURITY_ADMIN_PASSWORD:-local-smoke-grafana-password-not-production}"
export GF_SERVER_ROOT_URL="${GF_SERVER_ROOT_URL:-http://127.0.0.1:3002/grafana/}"
export BULL_BOARD_ENABLED="${BULL_BOARD_ENABLED:-true}"
export BULL_BOARD_USERNAME="${BULL_BOARD_USERNAME:-logivn-ops}"
export BULL_BOARD_PASSWORD="${BULL_BOARD_PASSWORD:-local-smoke-board-password}"
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://localhost}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-local-smoke-anon}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-local-smoke-service-role}"
export GATEWAY_PORT="${GATEWAY_PORT:-43100}"
export WORKER_PORT="${WORKER_PORT:-43500}"
export QUEUE_CONCURRENCY="${QUEUE_CONCURRENCY:-2}"
export WORKER_CONCURRENCY="${WORKER_CONCURRENCY:-2}"

compose() {
  docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

log() {
  printf '[logivn-smoke] %s\n' "$*"
}

cleanup() {
  if [ "${KEEP_SMOKE_STACK:-false}" != "true" ]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
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
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      log "$label OK"
      return
    fi
    sleep 1
  done

  printf 'Timed out waiting for %s at %s\n' "$label" "$url" >&2
  compose logs --tail=120 gateway worker redis >&2 || true
  exit 1
}

check_http_status() {
  local expected="$1"
  local label="$2"
  shift 2

  local actual
  actual="$(curl -sS -o /tmp/logivn-smoke-http.out -w '%{http_code}' --max-time 8 "$@")"
  if [ "$actual" != "$expected" ]; then
    printf '%s expected HTTP %s, got %s\n' "$label" "$expected" "$actual" >&2
    sed -n '1,80p' /tmp/logivn-smoke-http.out >&2 || true
    exit 1
  fi
  log "$label HTTP $actual"
}

main() {
  check_command docker
  check_command curl
  check_command node

  trap cleanup EXIT

  log "Validating compose config"
  compose config --quiet

  log "Starting Redis, gateway, and worker"
  compose up -d --build redis gateway worker

  local gateway_url="http://127.0.0.1:$GATEWAY_PORT"
  wait_for_url "$gateway_url/health" gateway
  wait_for_url "http://127.0.0.1:$WORKER_PORT/health" worker

  check_http_status 401 "Bull Board without credentials" "$gateway_url/queues/board/"
  check_http_status 200 "Bull Board with credentials" -u "$BULL_BOARD_USERNAME:$BULL_BOARD_PASSWORD" "$gateway_url/queues/board/"

  SMOKE_BASE_URL="$gateway_url" node <<'NODE'
const base = process.env.SMOKE_BASE_URL;
const key = process.env.LOGIVN_INTERNAL_API_KEY;
const tenantId = "00000000-0000-4000-8000-000000000202";
const restaurantId = tenantId;
const eventId = `order.confirmed:smoke:${Date.now()}`;
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

await request("/events", {
  method: "POST",
  body: JSON.stringify({
    type: "order.confirmed",
    eventId,
    tenantId,
    restaurantId,
    order: {
      id: "00000000-0000-4000-8000-000000000102",
      displayCode: "SMOKE-01",
      itemCount: 2,
      total: 120000,
      tableName: "Bàn smoke",
      fulfillmentType: "DINE_IN",
      customerName: "Smoke Ops",
      status: "ordering",
      paymentStatus: "pending"
    }
  })
});

await new Promise((resolve) => setTimeout(resolve, 1200));

const recent = await request(`/events/recent?tenantId=${tenantId}&limit=10`);
const lock = await request("/locks/acquire", {
  method: "POST",
  body: JSON.stringify({ tenantId, key: "lock:tenant:tenant-smoke:payment:invoice-smoke", ttlMs: 10000 })
});
const released = await request("/locks/release", {
  method: "POST",
  body: JSON.stringify({ key: "lock:tenant:tenant-smoke:payment:invoice-smoke", token: lock.json.token })
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
    identifier: "table-smoke",
    value: { status: "occupied", orderId: "order-smoke" },
    ttlSeconds: 60
  })
});
const state = await request(`/realtime/state?tenantId=${tenantId}&scope=tables&identifier=table-smoke`);
const queues = await request("/queues");

const summary = {
  eventRecorded: recent.json.events.some((item) => item.eventId === eventId),
  orderQueueCompleted: queues.json.queues["orders.processing"].completed >= 1,
  lockAcquired: lock.json.acquired === true,
  lockReleased: released.json.released === true,
  firstRateLimitAllowed: rate1.json.allowed === true,
  secondRateLimitBlocked: rate2.status === 429 && rate2.json.allowed === false,
  realtimeStateRoundTrip: state.json.state?.status === "occupied",
  queueInventory: Object.keys(queues.json.queues).length
};

console.log(JSON.stringify(summary, null, 2));
if (!Object.entries(summary).every(([key, value]) => key === "queueInventory" ? value >= 42 : value === true)) {
  process.exit(1);
}
NODE

  if [ "${SMOKE_MONITORING:-false}" = "true" ]; then
    log "Starting Prometheus and Grafana provisioning smoke"
    compose up -d prometheus grafana
    wait_for_url "http://127.0.0.1:3002/grafana/api/health" grafana
    check_http_status 200 "Grafana Prometheus datasource" \
      -u "${GF_SECURITY_ADMIN_USER:-logivn-admin}:$GF_SECURITY_ADMIN_PASSWORD" \
      "http://127.0.0.1:3002/grafana/api/datasources/uid/logivn-prometheus"
    check_http_status 200 "Grafana Redis/BullMQ dashboard" \
      -u "${GF_SECURITY_ADMIN_USER:-logivn-admin}:$GF_SECURITY_ADMIN_PASSWORD" \
      "http://127.0.0.1:3002/grafana/api/dashboards/uid/logivn-redis-bullmq"
  fi

  log "Smoke validation complete"
}

main "$@"
