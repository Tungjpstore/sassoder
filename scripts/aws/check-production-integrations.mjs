#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const envFile = process.argv.find((arg) => arg.startsWith("--env-file="))?.slice("--env-file=".length) || process.env.LOGIVN_ENV_FILE || "/tmp/logivn-production.env";
const env = loadEnvFile(envFile);

const checks = [
  checkTextract(env),
  checkS3(env),
  checkSqs(env),
  checkSes(env),
  checkLambdaCandidate(env)
];

let failed = false;
console.log(`LogiVN AWS production integration check`);
console.log(`env file: ${path.resolve(envFile)}`);
console.log("");

for (const check of checks) {
  const icon = check.status === "ready" ? "OK" : check.status === "blocked" ? "BLOCKED" : "WARN";
  console.log(`[${icon}] ${check.name}: ${check.summary}`);
  for (const line of check.details) console.log(`  - ${line}`);
  if (check.status === "blocked") failed = true;
}

process.exitCode = failed ? 1 : 0;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return process.env;
  const out = { ...process.env };
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    out[key] = unquote(line.slice(index + 1).trim());
  }
  return out;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function clean(env, key) {
  return String(env[key] ?? "").trim();
}

function present(env, key) {
  return clean(env, key).length > 0;
}

function missing(env, keys) {
  return keys.filter((key) => !present(env, key));
}

function providerList(env) {
  return clean(env, "OCR_PROVIDER_ORDER") || clean(env, "OCR_IMAGE_PROVIDER_ORDER") || clean(env, "OCR_PROVIDER") || clean(env, "AI_OCR_PROVIDER");
}

function checkTextract(env) {
  const provider = providerList(env);
  const required = ["AWS_TEXTRACT_REGION", "AWS_TEXTRACT_ACCESS_KEY_ID", "AWS_TEXTRACT_SECRET_ACCESS_KEY"];
  const gaps = missing(env, required);
  const enabled = /(^|,|\s)textract(,|\s|$)/i.test(provider);
  return {
    name: "Textract OCR",
    status: enabled && gaps.length === 0 ? "ready" : "blocked",
    summary: enabled && gaps.length === 0 ? "OCR image provider can call AWS Textract." : "Textract is not production-callable yet.",
    details: [
      `provider order: ${provider || "missing"}`,
      gaps.length ? `missing/empty: ${gaps.join(", ")}` : "required env present (values redacted)"
    ]
  };
}

function checkS3(env) {
  const provider = clean(env, "MENU_IMAGE_STORAGE_PROVIDER");
  const required = ["AWS_S3_REGION", "AWS_S3_BUCKET", "AWS_S3_ACCESS_KEY_ID", "AWS_S3_SECRET_ACCESS_KEY", "AWS_S3_PUBLIC_BASE_URL"];
  const gaps = missing(env, required);
  return {
    name: "S3 menu/media storage",
    status: provider === "s3" && gaps.length === 0 ? "ready" : provider === "s3" ? "blocked" : "warn",
    summary: provider === "s3" && gaps.length === 0 ? "S3 can be used for menu/media storage." : provider === "s3" ? "S3 selected but config is incomplete." : "S3 is not selected; app should stay on Supabase storage.",
    details: [
      `MENU_IMAGE_STORAGE_PROVIDER: ${provider || "missing"}`,
      gaps.length ? `missing/empty: ${gaps.join(", ")}` : "required env present (values redacted)"
    ]
  };
}

function checkSqs(env) {
  const provider = clean(env, "OPERATIONAL_EVENT_QUEUE_PROVIDER");
  const confirmed = clean(env, "OPERATIONAL_EVENT_SQS_CONSUMER_CONFIRMED").toLowerCase() === "true";
  const required = ["OPERATIONAL_EVENT_SQS_QUEUE_URL", "AWS_SQS_REGION", "AWS_SQS_ACCESS_KEY_ID", "AWS_SQS_SECRET_ACCESS_KEY"];
  const gaps = missing(env, required);
  return {
    name: "SQS operational event ingress",
    status: provider === "sqs" && confirmed && gaps.length === 0 ? "ready" : provider === "sqs" ? "blocked" : "warn",
    summary:
      provider === "sqs" && confirmed && gaps.length === 0
        ? "Vercel can publish operational events to SQS."
        : provider === "sqs"
          ? "SQS selected but consumer confirmation or credentials are incomplete."
          : "SQS is not selected; app should use internal gateway ingress.",
    details: [
      `OPERATIONAL_EVENT_QUEUE_PROVIDER: ${provider || "missing"}`,
      `consumer confirmed: ${confirmed}`,
      gaps.length ? `missing/empty: ${gaps.join(", ")}` : "required env present (values redacted)"
    ]
  };
}

function checkSes(env) {
  const provider = clean(env, "EMAIL_PROVIDER") || "resend/default";
  const sesGaps = missing(env, ["AWS_SES_REGION", "AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY", "AWS_SES_IDENTITY"]);
  const productionConfirmed = ["1", "true", "yes"].includes((clean(env, "SES_PRODUCTION_ACCESS_CONFIRMED") || clean(env, "AWS_SES_PRODUCTION_ACCESS_CONFIRMED")).toLowerCase());
  const ready = provider === "ses" && productionConfirmed && sesGaps.length === 0;
  return {
    name: "SES email",
    status: ready ? "ready" : provider === "ses" ? "blocked" : "warn",
    summary: ready ? "SES config and production-access confirmation are present." : "SES is not the safe production email path right now.",
    details: [
      `EMAIL_PROVIDER: ${provider}`,
      `production access confirmed flag: ${productionConfirmed}`,
      sesGaps.length ? `missing/empty: ${sesGaps.join(", ")}` : "SES env present (values redacted)",
      "current AWS Support response denied SES production access; keep Resend/BillionMail until appeal is approved"
    ]
  };
}

function checkLambdaCandidate(env) {
  const required = ["LOGIVN_API_INTERNAL_URL", "LOGIVN_INTERNAL_API_KEY", "OPERATIONAL_EVENT_SQS_QUEUE_URL"];
  const gaps = missing(env, required);
  return {
    name: "Lambda SQS consumer candidate",
    status: gaps.length === 0 ? "ready" : "warn",
    summary: gaps.length === 0 ? "Lambda consumer has the minimum env to forward SQS events to the gateway." : "Lambda can be integrated, but deploy should wait for gateway/SQS env confirmation.",
    details: [gaps.length ? `missing/empty: ${gaps.join(", ")}` : "required env present (values redacted)", "scaffold: infra/aws/lambda/operational-event-consumer"]
  };
}
