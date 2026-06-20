import { isIP } from "net";

export type GoogleVisionOcrEnv = Record<string, string | undefined>;

type GoogleVisionOcrOptions = {
  env?: GoogleVisionOcrEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type GoogleVisionTextAnnotation = {
  description?: string;
};

type GoogleVisionResponse = {
  responses?: Array<{
    textAnnotations?: GoogleVisionTextAnnotation[];
    fullTextAnnotation?: { text?: string };
    error?: { message?: string };
  }>;
  error?: { message?: string };
};

const defaultGoogleVisionTimeoutMs = 15_000;

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function isGoogleVisionProvider(value: string) {
  return ["google", "google-vision", "google_vision", "gcv", "vision"].includes(value.toLowerCase());
}

function providerList(env: GoogleVisionOcrEnv) {
  return clean(env.OCR_PROVIDER_ORDER || env.OCR_IMAGE_PROVIDER_ORDER || env.OCR_PROVIDER || env.AI_OCR_PROVIDER)
    .split(/[,|]/)
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveGoogleVisionOcrConfig(env: GoogleVisionOcrEnv = process.env) {
  const providers = providerList(env);
  if (providers.length > 0 && !providers.some(isGoogleVisionProvider)) return null;

  const apiKey = clean(env.GOOGLE_VISION_API_KEY || env.GOOGLE_CLOUD_VISION_API_KEY || env.GCP_VISION_API_KEY);
  if (!apiKey) return null;

  return {
    apiKey,
    endpoint: clean(env.GOOGLE_VISION_ENDPOINT) || "https://vision.googleapis.com/v1/images:annotate"
  };
}

export function isGoogleVisionOcrConfigured(env: GoogleVisionOcrEnv = process.env) {
  return Boolean(resolveGoogleVisionOcrConfig(env));
}

function base64Payload(input: { imageBase64?: string }) {
  const raw = clean(input.imageBase64);
  return (raw.includes(",") ? raw.split(",").pop() || "" : raw).replace(/\s+/g, "");
}

function isPrivateIp(host: string) {
  const family = isIP(host);
  if (family === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
  }
  if (family === 6) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  return false;
}

function assertPublicImageUrl(imageUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error("Invalid image URL for Google Vision OCR.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Google Vision OCR image URL must use HTTP or HTTPS.");

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") throw new Error("Google Vision OCR image URL must be public.");
  if (isPrivateIp(host)) throw new Error("Google Vision OCR image URL must not target private network addresses.");
}

function extractText(body: GoogleVisionResponse) {
  const response = body.responses?.[0];
  if (body.error?.message) throw new Error(body.error.message);
  if (response?.error?.message) throw new Error(response.error.message);

  const text = response?.fullTextAnnotation?.text || response?.textAnnotations?.[0]?.description || "";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line, confidence: null }));
  return { text: lines.map((line) => line.text).join("\n"), lines };
}

async function readGoogleVisionResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as GoogleVisionResponse;
  } catch {
    return { error: { message: text.slice(0, 1000) } } satisfies GoogleVisionResponse;
  }
}

export async function detectDocumentTextWithGoogleVision(input: { imageBase64?: string; imageUrl?: string }, options: GoogleVisionOcrOptions = {}) {
  const config = resolveGoogleVisionOcrConfig(options.env ?? process.env);
  if (!config) throw new Error("Google Vision OCR is not configured.");

  const image = input.imageUrl?.trim()
    ? (assertPublicImageUrl(input.imageUrl.trim()), { source: { imageUri: input.imageUrl.trim() } })
    : { content: base64Payload({ imageBase64: input.imageBase64 }) };
  if (!("source" in image) && !image.content) throw new Error("Missing image bytes for Google Vision OCR.");

  const response = await (options.fetchImpl ?? fetch)(`${config.endpoint}?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests: [{ image, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }] }),
    signal: AbortSignal.timeout(options.timeoutMs ?? defaultGoogleVisionTimeoutMs)
  });
  const json = await readGoogleVisionResponse(response);
  if (!response.ok) throw new Error(json.error?.message || `Google Vision OCR failed with status ${response.status}.`);

  const result = extractText(json);
  return { ...result, raw: json };
}
