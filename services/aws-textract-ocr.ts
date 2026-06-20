import { createHash, createHmac } from "crypto";
import { isIP } from "net";

export type AwsTextractEnv = Record<string, string | undefined>;

type AwsTextractConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  endpoint: string;
};

type TextractOptions = {
  env?: AwsTextractEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
};

type TextractBlock = {
  BlockType?: string;
  Text?: string;
  Confidence?: number;
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

const maxTextractImageBytes = 5 * 1024 * 1024;
const defaultTextractFetchTimeoutMs = 15_000;

function usesTextractProvider(env: AwsTextractEnv) {
  const rawProvider = clean(env.OCR_PROVIDER_ORDER || env.OCR_IMAGE_PROVIDER_ORDER || env.OCR_PROVIDER || env.AI_OCR_PROVIDER);
  if (!rawProvider) return true;

  return rawProvider
    .split(/[,|]/)
    .map((provider) => provider.trim().toLowerCase())
    .some((provider) => ["textract", "aws", "aws-textract", "aws_textract"].includes(provider));
}

export function resolveAwsTextractConfig(env: AwsTextractEnv = process.env): AwsTextractConfig | null {
  if (!usesTextractProvider(env)) return null;
  const accessKeyId = clean(env.AWS_TEXTRACT_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = clean(env.AWS_TEXTRACT_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY);
  if (!accessKeyId || !secretAccessKey) return null;

  const region = clean(env.AWS_TEXTRACT_REGION || env.TEXTRACT_REGION || env.AWS_REGION) || "us-east-1";
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: clean(env.AWS_SESSION_TOKEN || env.AWS_TEXTRACT_SESSION_TOKEN || env.TEXTRACT_SESSION_TOKEN) || undefined,
    region,
    endpoint: clean(env.AWS_TEXTRACT_ENDPOINT || env.TEXTRACT_ENDPOINT) || `https://textract.${region}.amazonaws.com`
  };
}

export function isAwsTextractConfigured(env: AwsTextractEnv = process.env) {
  return Boolean(resolveAwsTextractConfig(env));
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secret: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "textract");
  return hmac(serviceKey, "aws4_request");
}

function amzTimestamp(now: Date) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signedHeaders(config: AwsTextractConfig, payload: string, now: Date) {
  const endpoint = new URL(config.endpoint);
  const amzDate = amzTimestamp(now);
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);
  const baseHeaders: Record<string, string> = {
    "content-type": "application/x-amz-json-1.1",
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "x-amz-target": "Textract.DetectDocumentText",
    ...(config.sessionToken ? { "x-amz-security-token": config.sessionToken } : {})
  };
  const signedHeaderNames = Object.keys(baseHeaders).sort().join(";");
  const canonicalHeaders = Object.keys(baseHeaders)
    .sort()
    .map((key) => `${key}:${baseHeaders[key]}\n`)
    .join("");
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaderNames, payloadHash].join("\n");
  const scope = `${date}/${config.region}/textract/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, date, config.region)).update(stringToSign, "utf8").digest("hex");

  return {
    ...baseHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`
  };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text.slice(0, 1000) };
  }
}

function base64Payload(input: { imageBase64?: string; bytes?: Buffer }) {
  if (input.bytes) return input.bytes.toString("base64");
  const raw = clean(input.imageBase64);
  return (raw.includes(",") ? raw.split(",").pop() || "" : raw).replace(/\s+/g, "");
}

function assertPublicImageUrl(imageUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error("Invalid image URL for Textract OCR.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Textract OCR image URL must use HTTP or HTTPS.");

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") throw new Error("Textract OCR image URL must be public.");
  if (isPrivateIp(host)) throw new Error("Textract OCR image URL must not target private network addresses.");
}

function isPrivateIp(host: string) {
  const family = isIP(host);
  if (family === 4) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
  }
  if (family === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  }
  return false;
}

function assertImageSize(size: number, label: string) {
  if (size > maxTextractImageBytes) throw new Error(`${label} exceeds the 5MB OCR limit.`);
}

async function imageUrlToBytes(imageUrl: string, fetchImpl: typeof fetch, timeoutMs: number) {
  assertPublicImageUrl(imageUrl);
  const response = await fetchImpl(imageUrl, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Image fetch failed with status ${response.status}.`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 0) assertImageSize(contentLength, "Textract OCR image");
  const bytes = Buffer.from(await response.arrayBuffer());
  assertImageSize(bytes.byteLength, "Textract OCR image");
  return bytes;
}

function extractLines(body: Record<string, unknown>) {
  const blocks = Array.isArray(body.Blocks) ? (body.Blocks as TextractBlock[]) : [];
  return blocks
    .filter((block) => block.BlockType === "LINE" && block.Text?.trim())
    .map((block) => ({ text: block.Text!.trim(), confidence: typeof block.Confidence === "number" ? block.Confidence : null }));
}

export async function detectDocumentTextWithAwsTextract(input: { imageBase64?: string; imageUrl?: string; bytes?: Buffer }, options: TextractOptions = {}) {
  const config = resolveAwsTextractConfig(options.env ?? process.env);
  if (!config) throw new Error("AWS Textract OCR is not configured.");

  const fetchImpl = options.fetchImpl ?? fetch;
  const bytes = input.bytes ?? (input.imageUrl ? await imageUrlToBytes(input.imageUrl, fetchImpl, options.timeoutMs ?? defaultTextractFetchTimeoutMs) : undefined);
  if (bytes) assertImageSize(bytes.byteLength, "Textract OCR image");
  const documentBytes = base64Payload({ imageBase64: input.imageBase64, bytes });
  if (!documentBytes) throw new Error("Missing image bytes for Textract OCR.");
  assertImageSize(Buffer.byteLength(documentBytes, "base64"), "Textract OCR image");

  const payload = JSON.stringify({ Document: { Bytes: documentBytes } });
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers: signedHeaders(config, payload, options.now ?? new Date()),
    body: payload,
    signal: AbortSignal.timeout(options.timeoutMs ?? defaultTextractFetchTimeoutMs)
  });
  const json = await readJsonResponse(response);
  if (!response.ok) {
    const message = json.message || json.Message || JSON.stringify(json).slice(0, 500);
    throw new Error(String(message));
  }

  const lines = extractLines(json);
  return {
    text: lines.map((line) => line.text).join("\n"),
    lines,
    raw: json
  };
}
