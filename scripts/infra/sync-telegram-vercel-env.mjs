import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const environment = readArg("--environment") || "production";
const envFile = path.resolve(rootDir, readArg("--env-file") || "infra/vps/.env");

const vercelTelegramKeys = [
  "LOGIVN_API_PUBLIC_URL",
  "LOGIVN_INTERNAL_API_KEY",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_CONNECT_TOKEN_SECRET",
  "TELEGRAM_CALLBACK_SECRET",
  "TELEGRAM_CONNECT_TOKEN_TTL_SECONDS"
];

const env = parseEnvFile(envFile);
const missing = vercelTelegramKeys.filter((key) => !env.get(key));
if (missing.length > 0) {
  throw new Error(`Missing required values in ${path.relative(rootDir, envFile)}: ${missing.join(", ")}`);
}

const publicApiUrl = env.get("LOGIVN_API_PUBLIC_URL") || "";
if (!/^https:\/\/api\.logivn\.com\/?$/.test(publicApiUrl)) {
  throw new Error("LOGIVN_API_PUBLIC_URL must be the public HTTPS gateway URL for Vercel runtime.");
}

const before = listVercelEnvNames(environment);
const action = apply ? "sync" : "dry-run";
console.log(`[logivn-telegram-env] ${action} ${vercelTelegramKeys.length} keys to Vercel ${environment}`);
console.table(
  vercelTelegramKeys.map((key) => ({
    key,
    present: before.has(key),
    action: apply ? "upsert" : before.has(key) ? "would update" : "would add"
  }))
);

if (!apply) {
  console.log("[logivn-telegram-env] dry-run only. Re-run with --apply to update Vercel.");
  process.exit(0);
}

for (const key of vercelTelegramKeys) {
  runVercel(["env", "add", key, environment, "--yes", "--force", "--sensitive"], `${env.get(key)}\n`);
}

const after = listVercelEnvNames(environment);
const stillMissing = vercelTelegramKeys.filter((key) => !after.has(key));
if (stillMissing.length > 0) {
  throw new Error(`Vercel env sync incomplete. Missing after sync: ${stillMissing.join(", ")}`);
}

console.log("[logivn-telegram-env] Vercel Telegram env sync complete.");

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
  const result = runVercel(["env", "ls", targetEnvironment, "--format", "json"]);
  const parsed = JSON.parse(result.stdout || "{}");
  const envs = Array.isArray(parsed) ? parsed : parsed.envs || [];
  return new Set(envs.map((item) => item.name || item.key).filter(Boolean));
}

function runVercel(vercelArgs, input = undefined) {
  const result = spawnSync("npx", ["vercel", ...vercelArgs], {
    cwd: rootDir,
    encoding: "utf8",
    input,
    env: process.env
  });

  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.replace(/(bot\d+:)[A-Za-z0-9_-]+/g, "$1[redacted]");
    throw new Error(`vercel ${vercelArgs.join(" ")} failed:\n${output.trim()}`);
  }

  return result;
}
