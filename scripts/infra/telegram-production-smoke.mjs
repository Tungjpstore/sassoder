import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = new Set(process.argv.slice(2));
const envFile = path.resolve(rootDir, readArg("--env-file") || "infra/vps/.env");
const environment = readArg("--environment") || "production";
const sshTarget = readArg("--ssh-target") || "deploy@api.logivn.com";
const sshKey = expandHome(readArg("--ssh-key") || "~/.ssh/logivn_greencloud");
const skipSsh = args.has("--skip-ssh");
const skipVercel = args.has("--skip-vercel");

const env = parseEnvFile(envFile);
const checks = [];

await check("env contract", async () => {
  const required = [
    "LOGIVN_API_PUBLIC_URL",
    "LOGIVN_INTERNAL_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_BOT_USERNAME",
    "TELEGRAM_CALLBACK_SECRET",
    "TELEGRAM_CONNECT_TOKEN_SECRET",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_WEBHOOK_URL"
  ];
  const missing = required.filter((key) => !env.get(key));
  assert(missing.length === 0, `missing ${missing.join(", ")}`);
  assert(
    (env.get("TELEGRAM_WEBHOOK_URL") || "").endsWith(`/webhooks/telegram/${env.get("TELEGRAM_WEBHOOK_SECRET")}`),
    "TELEGRAM_WEBHOOK_URL does not end with the configured webhook secret"
  );
});

await check("telegram getMe", async () => {
  const data = await telegramApi("getMe");
  const username = String(data.result?.username || "");
  assert(username.toLowerCase() === String(env.get("TELEGRAM_BOT_USERNAME")).replace(/^@/, "").toLowerCase(), "bot username mismatch");
});

await check("telegram webhook", async () => {
  const data = await telegramApi("getWebhookInfo");
  const result = data.result || {};
  const url = String(result.url || "");
  assert(url.endsWith(`/webhooks/telegram/${env.get("TELEGRAM_WEBHOOK_SECRET")}`), "webhook URL is not the configured LogiVN webhook");
  assert(Array.isArray(result.allowed_updates), "allowed_updates missing");
  assert(result.allowed_updates.includes("message"), "message updates not enabled");
  assert(result.allowed_updates.includes("callback_query"), "callback_query updates not enabled");
  assert(Number(result.pending_update_count ?? 0) < 25, "Telegram webhook backlog is too high");
  assert(
    !result.last_error_message || Number(result.pending_update_count ?? 0) === 0,
    "Telegram reports a webhook delivery error with pending updates"
  );
});

await check("Supabase telegram tables", async () => {
  const tables = [
    ["telegram_connection_tokens", "token_hash"],
    ["telegram_connections", "id"],
    ["telegram_devices", "id"],
    ["telegram_sessions", "id"],
    ["telegram_notifications", "id"],
    ["telegram_callback_actions", "id"],
    ["telegram_audit_logs", "id"],
    ["telegram_rate_limits", "id"],
    ["operational_event_outbox", "id"]
  ];
  for (const [table, column] of tables) {
    await checkSupabaseRestTable(table, column);
  }
});

if (!skipVercel) {
  await check("Vercel env names", async () => {
    const names = listVercelEnvNames(environment);
    const requiredNames = [
      "LOGIVN_API_PUBLIC_URL",
      "LOGIVN_INTERNAL_API_KEY",
      "TELEGRAM_BOT_USERNAME",
      "TELEGRAM_CONNECT_TOKEN_SECRET",
      "TELEGRAM_CALLBACK_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY"
    ];
    const missing = requiredNames.filter((key) => !names.has(key));
    assert(missing.length === 0, `missing ${missing.join(", ")}`);
  });
}

await check("public gateway health", async () => {
  const response = await fetch(new URL("/health", required("LOGIVN_API_PUBLIC_URL")), {
    signal: AbortSignal.timeout(10_000)
  });
  assert(response.ok, `gateway health returned ${response.status}`);
  const body = await response.json();
  assert(body.ok === true, "gateway health did not return ok=true");
});

if (!skipSsh) {
  await check("VPS telegram readiness", async () => {
    const result = runSsh("curl -fsS http://127.0.0.1:3600/ready");
    const ready = JSON.parse(result.stdout);
    assert(ready.ok === true, "telegram ready did not return ok=true");
    assert(ready.configured === true, "telegram service is not configured");
    assert(ready.worker?.running === true, "telegram worker is not running");
  });
}

const failed = checks.filter((item) => !item.ok);
console.table(checks.map(({ name, ok, ms, error }) => ({ check: name, status: ok ? "PASS" : "FAIL", ms, error: error || "" })));
if (failed.length > 0) {
  console.error(`[logivn-telegram-smoke] ${failed.length} check(s) failed.`);
  process.exit(1);
}
console.log("[logivn-telegram-smoke] all checks passed.");

async function telegramApi(method) {
  const response = await fetch(`https://api.telegram.org/bot${required("TELEGRAM_BOT_TOKEN")}/${method}`, {
    signal: AbortSignal.timeout(10_000)
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok && body.ok === true, `${method} failed`);
  return body;
}

async function checkSupabaseRestTable(table, column) {
  const url = new URL(`/rest/v1/${table}`, required("NEXT_PUBLIC_SUPABASE_URL"));
  url.searchParams.set("select", column);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: {
      apikey: required("SUPABASE_SERVICE_ROLE_KEY"),
      authorization: `Bearer ${required("SUPABASE_SERVICE_ROLE_KEY")}`
    },
    signal: AbortSignal.timeout(10_000)
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${table}: REST ${response.status} ${sanitizeOutput(body).slice(0, 240)}`);
  }
}

async function check(name, fn) {
  const startedAt = performance.now();
  try {
    await fn();
    checks.push({ name, ok: true, ms: Math.round(performance.now() - startedAt) });
  } catch (error) {
    checks.push({ name, ok: false, ms: Math.round(performance.now() - startedAt), error: error instanceof Error ? error.message : String(error) });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function required(key) {
  const value = env.get(key);
  if (!value) throw new Error(`missing ${key}`);
  return value;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function parseEnvFile(filePath) {
  const values = new Map();
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function listVercelEnvNames(targetEnvironment) {
  const result = spawnSync("npx", ["vercel", "env", "ls", targetEnvironment, "--format", "json"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(sanitizeOutput(`${result.stdout}\n${result.stderr}`));
  const parsed = JSON.parse(result.stdout || "{}");
  const envs = Array.isArray(parsed) ? parsed : parsed.envs || [];
  return new Set(envs.map((item) => item.name || item.key).filter(Boolean));
}

function runSsh(command) {
  const result = spawnSync("ssh", ["-i", sshKey, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", sshTarget, command], {
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(sanitizeOutput(`${result.stdout}\n${result.stderr}`));
  return result;
}

function expandHome(value) {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function sanitizeOutput(value) {
  return String(value)
    .replace(/(bot\d+:)[A-Za-z0-9_-]+/g, "$1[redacted]")
    .replace(/\/webhooks\/telegram\/[^/?#\s]+/g, "/webhooks/telegram/[redacted]");
}
