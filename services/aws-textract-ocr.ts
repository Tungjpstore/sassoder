import { createHash, createHmac } from "crypto";

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
};

type TextractBlock = {
  BlockType?: string;
  Text?: string;
  Confidence?: number;
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function provider(env: AwsTextractEnv) {
  return clean(env.OCR_PROVIDER || env.AI_OCR_PROVIDER).toLowerCase();
}

function usesTextractProvider(env: AwsTextractEnv) {
  return ["textract", "aws", "aws-textract", "aws_textract"].includes(provider(env));
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
  return raw.includes(",") ? raw.split(",").pop() || "" : raw;
}

async function imageUrlToBytes(imageUrl: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Image fetch failed with status ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
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
  const bytes = input.bytes ?? (input.imageUrl ? await imageUrlToBytes(input.imageUrl, fetchImpl) : undefined);
  const documentBytes = base64Payload({ imageBase64: input.imageBase64, bytes });
  if (!documentBytes) throw new Error("Missing image bytes for Textract OCR.");

  const payload = JSON.stringify({ Document: { Bytes: documentBytes } });
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers: signedHeaders(config, payload, options.now ?? new Date()),
    body: payload
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
