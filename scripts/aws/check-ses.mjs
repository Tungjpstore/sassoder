import { createHash, createHmac } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [match[1], value.replace(/\\n/g, "\n")];
}

async function loadEnvFile(filename) {
  try {
    const content = await fs.readFile(path.join(projectRoot, filename), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function clean(value) {
  return value?.trim() || "";
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secret, date, region) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "ses");
  return hmac(serviceKey, "aws4_request");
}

function amzTimestamp(now) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(searchParams) {
  return [...searchParams.entries()]
    .sort(([keyA, valueA], [keyB, valueB]) => (keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB)))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function signedHeaders({ accessKeyId, secretAccessKey, sessionToken, region }, url, method, now) {
  const amzDate = amzTimestamp(now);
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256Hex("");
  const baseHeaders = {
    accept: "application/json",
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(sessionToken ? { "x-amz-security-token": sessionToken } : {})
  };
  const signedHeaderNames = Object.keys(baseHeaders).sort().join(";");
  const canonicalHeaders = Object.keys(baseHeaders)
    .sort()
    .map((key) => `${key}:${baseHeaders[key]}\n`)
    .join("");
  const canonicalRequest = [method, url.pathname, canonicalQuery(url.searchParams), canonicalHeaders, signedHeaderNames, payloadHash].join("\n");
  const scope = `${date}/${region}/ses/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(secretAccessKey, date, region)).update(stringToSign, "utf8").digest("hex");

  return {
    ...baseHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 1000) };
  }
}

function summarizeError(body) {
  return body?.message || body?.Message || body?.Error?.Message || JSON.stringify(body).slice(0, 500);
}

async function sesGet(config, pathName, params = {}) {
  const url = new URL(`${config.endpoint}${pathName}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: "GET",
    headers: signedHeaders(config, url, "GET", new Date())
  });
  return { response, body: await readJsonResponse(response) };
}

function readConfig() {
  const region = clean(readArg("region", process.env.AWS_SES_REGION || process.env.SES_REGION || process.env.AWS_REGION)) || "us-east-1";
  const endpoint = clean(process.env.AWS_SES_ENDPOINT || process.env.SES_ENDPOINT) || `https://email.${region}.amazonaws.com`;
  const accessKeyId = clean(process.env.AWS_SES_ACCESS_KEY_ID || process.env.SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = clean(process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.SES_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY);
  const sessionToken = clean(process.env.AWS_SESSION_TOKEN || process.env.AWS_SES_SESSION_TOKEN || process.env.SES_SESSION_TOKEN) || undefined;
  return { region, endpoint, accessKeyId, secretAccessKey, sessionToken };
}

await loadEnvFile(".env.local");
await loadEnvFile(".env");

const config = readConfig();
const identity = clean(readArg("identity", process.env.AWS_SES_IDENTITY || process.env.SES_IDENTITY));

console.log("AWS SES readiness check");
console.log(`- region: ${config.region}`);
console.log(`- endpoint: ${config.endpoint}`);
console.log(`- access key: ${config.accessKeyId ? `present (${config.accessKeyId.length} chars, redacted)` : "missing"}`);
console.log(`- secret key: ${config.secretAccessKey ? "present (redacted)" : "missing"}`);

if (!config.accessKeyId || !config.secretAccessKey) {
  console.error("Missing AWS SES credentials. Set AWS_SES_ACCESS_KEY_ID/AWS_SES_SECRET_ACCESS_KEY or standard AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.");
  process.exit(1);
}

const accountStarted = Date.now();
const account = await sesGet(config, "/v2/email/account");
console.log(`- GetAccount: ${account.response.status} (${Date.now() - accountStarted}ms)`);
if (!account.response.ok) {
  console.error(`  ${summarizeError(account.body)}`);
  process.exit(2);
}

console.log(`  production access: ${account.body.ProductionAccessEnabled ? "enabled" : "sandbox"}`);
console.log(`  sending: ${account.body.SendingEnabled ? "enabled" : "disabled"}`);
console.log(`  enforcement: ${account.body.EnforcementStatus || "unknown"}`);
console.log(`  max 24h send: ${account.body.SendQuota?.Max24HourSend ?? "unknown"}`);
console.log(`  sent last 24h: ${account.body.SendQuota?.SentLast24Hours ?? "unknown"}`);
console.log(`  max send rate: ${account.body.SendQuota?.MaxSendRate ?? "unknown"}`);

const identitiesStarted = Date.now();
const identities = await sesGet(config, "/v2/email/identities", { PageSize: 1000 });
console.log(`- ListEmailIdentities: ${identities.response.status} (${Date.now() - identitiesStarted}ms)`);
if (!identities.response.ok) {
  console.error(`  ${summarizeError(identities.body)}`);
  process.exit(3);
}

const rows = Array.isArray(identities.body.EmailIdentities) ? identities.body.EmailIdentities : [];
console.log(`  identities: ${rows.length}`);
for (const row of rows.slice(0, 20)) {
  console.log(`  - ${row.IdentityName}: ${row.IdentityType || "unknown"}, ${row.VerificationStatus || "unknown"}`);
}
if (rows.length > 20) console.log(`  ... ${rows.length - 20} more omitted`);

if (identity) {
  const identityStarted = Date.now();
  const detail = await sesGet(config, `/v2/email/identities/${encodeURIComponent(identity)}`);
  console.log(`- GetEmailIdentity(${identity}): ${detail.response.status} (${Date.now() - identityStarted}ms)`);
  if (!detail.response.ok) {
    console.error(`  ${summarizeError(detail.body)}`);
    process.exit(4);
  }
  console.log(`  verified for sending: ${detail.body.VerifiedForSendingStatus ? "yes" : "no"}`);
  console.log(`  DKIM status: ${detail.body.DkimAttributes?.Status || "unknown"}`);
  console.log(`  mail-from status: ${detail.body.MailFromAttributes?.MailFromDomainStatus || "not configured"}`);
}

if (!account.body.ProductionAccessEnabled) {
  console.log("- next: SES is in sandbox; verify sender/recipient identities or request production access before using it for customer email.");
} else if (!account.body.SendingEnabled) {
  console.log("- next: sending is disabled; open an AWS Support/SES case before switching EMAIL_PROVIDER=ses.");
} else {
  console.log("- next: SES account is ready; set EMAIL_PROVIDER=ses and verified sender envs, then run an app email smoke test.");
}
