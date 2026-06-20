import { isIP } from "net";

export type OcrSpaceEnv = Record<string, string | undefined>;

type OcrSpaceOptions = {
  env?: OcrSpaceEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type OcrSpaceParsedResult = {
  ParsedText?: string;
  TextOverlay?: {
    Lines?: Array<{ LineText?: string; MaxHeight?: number; MinTop?: number }>;
  };
};

type OcrSpaceResponse = {
  ParsedResults?: OcrSpaceParsedResult[];
  OCRExitCode?: number;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string;
  ProcessingTimeInMilliseconds?: string;
};

const defaultOcrSpaceTimeoutMs = 20_000;

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function providerList(env: OcrSpaceEnv) {
  return clean(env.OCR_PROVIDER_ORDER || env.OCR_IMAGE_PROVIDER_ORDER || env.OCR_PROVIDER || env.AI_OCR_PROVIDER)
    .split(/[,|]/)
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
}

function isOcrSpaceProvider(value: string) {
  return ["ocrspace", "ocr-space", "ocr.space"].includes(value.toLowerCase());
}

export function resolveOcrSpaceConfig(env: OcrSpaceEnv = process.env) {
  const providers = providerList(env);
  if (providers.length > 0 && !providers.some(isOcrSpaceProvider)) return null;

  const apiKey = clean(env.OCR_SPACE_API_KEY || env.OCRSPACE_API_KEY);
  if (!apiKey) return null;

  return {
    apiKey,
    endpoint: clean(env.OCR_SPACE_ENDPOINT || env.OCRSPACE_ENDPOINT) || "https://api.ocr.space/parse/image",
    language: clean(env.OCR_SPACE_LANGUAGE || env.OCRSPACE_LANGUAGE) || "eng",
    engine: clean(env.OCR_SPACE_ENGINE || env.OCRSPACE_ENGINE) || "2"
  };
}

export function isOcrSpaceConfigured(env: OcrSpaceEnv = process.env) {
  return Boolean(resolveOcrSpaceConfig(env));
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
    throw new Error("Invalid image URL for OCR.space.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("OCR.space image URL must use HTTP or HTTPS.");

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") throw new Error("OCR.space image URL must be public.");
  if (isPrivateIp(host)) throw new Error("OCR.space image URL must not target private network addresses.");
}

function normalizeBase64Image(imageBase64: string | undefined) {
  const raw = clean(imageBase64);
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  return `data:image/png;base64,${raw.replace(/\s+/g, "")}`;
}

function errorMessage(body: OcrSpaceResponse) {
  const message = Array.isArray(body.ErrorMessage) ? body.ErrorMessage.join("; ") : body.ErrorMessage;
  return message || body.ErrorDetails || "OCR.space could not process the image.";
}

function extractText(body: OcrSpaceResponse) {
  if (body.IsErroredOnProcessing) throw new Error(errorMessage(body));
  const parsed = body.ParsedResults ?? [];
  const text = parsed.map((result) => result.ParsedText || "").join("\n").trim();
  const overlayLines = parsed.flatMap((result) => result.TextOverlay?.Lines ?? []);
  const lines = (overlayLines.length > 0 ? overlayLines.map((line) => line.LineText || "") : text.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line, confidence: null }));

  return { text: lines.map((line) => line.text).join("\n"), lines };
}

async function readOcrSpaceResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as OcrSpaceResponse;
  } catch {
    return { IsErroredOnProcessing: true, ErrorMessage: text.slice(0, 1000) } satisfies OcrSpaceResponse;
  }
}

export async function detectDocumentTextWithOcrSpace(input: { imageBase64?: string; imageUrl?: string }, options: OcrSpaceOptions = {}) {
  const config = resolveOcrSpaceConfig(options.env ?? process.env);
  if (!config) throw new Error("OCR.space is not configured.");

  const formData = new FormData();
  formData.set("apikey", config.apiKey);
  formData.set("language", config.language);
  formData.set("OCREngine", config.engine);
  formData.set("isOverlayRequired", "true");
  formData.set("scale", "true");

  if (input.imageUrl?.trim()) {
    const imageUrl = input.imageUrl.trim();
    assertPublicImageUrl(imageUrl);
    formData.set("url", imageUrl);
  } else {
    const base64Image = normalizeBase64Image(input.imageBase64);
    if (!base64Image) throw new Error("Missing image bytes for OCR.space.");
    formData.set("base64Image", base64Image);
  }

  const response = await (options.fetchImpl ?? fetch)(config.endpoint, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(options.timeoutMs ?? defaultOcrSpaceTimeoutMs)
  });
  const json = await readOcrSpaceResponse(response);
  if (!response.ok) throw new Error(errorMessage(json) || `OCR.space failed with status ${response.status}.`);

  const result = extractText(json);
  return { ...result, raw: json };
}
