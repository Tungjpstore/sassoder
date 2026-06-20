import { detectDocumentTextWithAwsTextract, isAwsTextractConfigured } from "@/services/aws-textract-ocr";
import { detectDocumentTextWithGoogleVision, isGoogleVisionOcrConfigured } from "@/services/google-vision-ocr";
import { detectDocumentTextWithOcrSpace, isOcrSpaceConfigured } from "@/services/ocr-space-ocr";

export type OcrExtractionProvider = "textract" | "google_vision" | "ocrspace";
export type OcrExtractionEnv = Record<string, string | undefined>;

type OcrExtractionInput = {
  imageBase64?: string;
  imageUrl?: string;
};

type OcrExtractionOptions = {
  env?: OcrExtractionEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
};

type OcrProviderResult = {
  text: string;
  lines: Array<{ text: string; confidence: number | null }>;
  raw?: unknown;
};

const defaultProviderOrder: OcrExtractionProvider[] = ["textract", "google_vision", "ocrspace"];

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function normalizeProvider(value: string): OcrExtractionProvider | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (["textract", "aws", "aws_textract", "aws-textract"].includes(normalized)) return "textract";
  if (["google", "google_vision", "google-vision", "gcv", "vision"].includes(normalized)) return "google_vision";
  if (["ocrspace", "ocr_space", "ocr-space", "ocr.space"].includes(normalized)) return "ocrspace";
  return null;
}

export function resolveOcrProviderOrder(env: OcrExtractionEnv = process.env) {
  const raw = clean(env.OCR_PROVIDER_ORDER || env.OCR_IMAGE_PROVIDER_ORDER || env.OCR_PROVIDER || env.AI_OCR_PROVIDER);
  const providers = raw
    ? raw
        .split(/[,|]/)
        .map(normalizeProvider)
        .filter((provider): provider is OcrExtractionProvider => Boolean(provider))
    : defaultProviderOrder;

  return [...new Set(providers)];
}

function isProviderConfigured(provider: OcrExtractionProvider, env: OcrExtractionEnv) {
  if (provider === "textract") return isAwsTextractConfigured(env);
  if (provider === "google_vision") return isGoogleVisionOcrConfigured(env);
  return isOcrSpaceConfigured(env);
}

export function hasConfiguredOcrImageProvider(env: OcrExtractionEnv = process.env) {
  return resolveOcrProviderOrder(env).some((provider) => isProviderConfigured(provider, env));
}

async function runProvider(provider: OcrExtractionProvider, input: OcrExtractionInput, options: OcrExtractionOptions): Promise<OcrProviderResult> {
  if (provider === "textract") return detectDocumentTextWithAwsTextract(input, options);
  if (provider === "google_vision") return detectDocumentTextWithGoogleVision(input, options);
  return detectDocumentTextWithOcrSpace(input, options);
}

function publicProviderName(provider: OcrExtractionProvider) {
  if (provider === "textract") return "AWS Textract";
  if (provider === "google_vision") return "Google Vision";
  return "OCR.space";
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
}

export async function extractOcrTextWithProviders(input: OcrExtractionInput, options: OcrExtractionOptions = {}) {
  const env = options.env ?? process.env;
  const order = resolveOcrProviderOrder(env);
  const failures: string[] = [];
  let configuredCount = 0;

  for (const provider of order) {
    if (!isProviderConfigured(provider, env)) continue;
    configuredCount += 1;

    try {
      const result = await runProvider(provider, input, { ...options, env });
      const text = result.text.trim();
      if (!text) {
        failures.push(`${publicProviderName(provider)}: empty text`);
        continue;
      }

      return {
        provider,
        text,
        lines: result.lines,
        raw: result.raw,
        warnings: [`OCR ảnh được đọc bằng ${publicProviderName(provider)}.`]
      };
    } catch (error) {
      failures.push(`${publicProviderName(provider)}: ${safeErrorMessage(error)}`);
    }
  }

  if (configuredCount === 0) {
    throw new Error("No OCR image provider is configured. Set OCR_PROVIDER_ORDER with textract, google_vision, or ocrspace and add the matching server-side key.");
  }

  throw new Error(`All OCR image providers failed: ${failures.join(" | ")}`);
}
