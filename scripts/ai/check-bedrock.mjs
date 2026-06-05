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

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 1000) };
  }
}

function bearerToken() {
  return (process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.BEDROCK_API_KEY || "").trim();
}

function summarizeError(body) {
  const message = body?.message || body?.error?.message || body?.Error?.Message || JSON.stringify(body).slice(0, 500);
  if (/Operation not allowed/i.test(message)) {
    return `${message} (account verification/model invocation is not open yet)`;
  }
  return message;
}

async function bedrockGet(region, pathName, token) {
  const response = await fetch(`https://bedrock.${region}.amazonaws.com${pathName}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  });
  return { response, body: await readJsonResponse(response) };
}

async function converse(region, model, token) {
  const response = await fetch(`https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: [{ text: "Reply with exactly: LogiVN Bedrock OK" }]
        }
      ],
      inferenceConfig: {
        maxTokens: 32,
        temperature: 0
      }
    })
  });
  return { response, body: await readJsonResponse(response) };
}

await loadEnvFile(".env.local");
await loadEnvFile(".env");

const region = readArg("region", process.env.AWS_REGION || process.env.BEDROCK_REGION || "us-east-1");
const model = readArg("model", process.env.BEDROCK_MODEL || process.env.BEDROCK_CHAT_MODEL || "us.amazon.nova-2-lite-v1:0");
const token = bearerToken();

if (!token) {
  console.error("Bedrock API key is missing. Set AWS_BEARER_TOKEN_BEDROCK or BEDROCK_API_KEY in .env.local.");
  process.exit(1);
}

console.log(`Bedrock readiness check`);
console.log(`- region: ${region}`);
console.log(`- model: ${model}`);
console.log(`- token: present (${token.length} chars, redacted)`);

const listStarted = Date.now();
const list = await bedrockGet(region, "/foundation-models", token);
console.log(`- ListFoundationModels: ${list.response.status} (${Date.now() - listStarted}ms)`);
if (!list.response.ok) {
  console.error(`  ${summarizeError(list.body)}`);
  process.exit(2);
}
console.log(`  models visible: ${list.body?.modelSummaries?.length ?? 0}`);

const converseStarted = Date.now();
const result = await converse(region, model, token);
console.log(`- Converse: ${result.response.status} (${Date.now() - converseStarted}ms)`);
if (!result.response.ok) {
  console.error(`  ${summarizeError(result.body)}`);
  process.exit(3);
}

const text = result.body?.output?.message?.content?.map((part) => part.text || "").join("\n").trim();
console.log(`  output: ${text || "(empty)"}`);
console.log(`  input tokens: ${result.body?.usage?.inputTokens ?? "unknown"}`);
console.log(`  output tokens: ${result.body?.usage?.outputTokens ?? "unknown"}`);
