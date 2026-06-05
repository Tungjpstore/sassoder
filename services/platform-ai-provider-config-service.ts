import "server-only";

import { decryptPlatformAiSecret, encryptPlatformAiSecret } from "@/lib/ai/platform-ai-secret-crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AiProvider } from "@/lib/ai/router/types";

type PlatformAiProviderRow = {
  provider: AiProvider;
  enabled: boolean;
  api_key_ciphertext: string | null;
  api_key_iv: string | null;
  api_key_tag: string | null;
  key_fingerprint: string | null;
  key_last_four: string | null;
  base_url: string | null;
  chat_model: string | null;
  fast_model: string | null;
  image_model: string | null;
  ocr_model: string | null;
  last_rotated_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type PlatformAiProviderMetadata = {
  provider: AiProvider;
  label: string;
  keyEnvNames: string[];
  baseUrlEnvNames: string[];
  chatModelEnvNames: string[];
  fastModelEnvNames: string[];
  imageModelEnvNames: string[];
  ocrModelEnvNames: string[];
};

export type PlatformAiProviderConfigSummary = {
  provider: AiProvider;
  label: string;
  enabled: boolean;
  managed: boolean;
  configured: boolean;
  keySource: "database" | "environment" | "missing";
  keyFingerprint: string | null;
  keyPreview: string;
  envConfigured: boolean;
  envNames: string[];
  baseUrl: string | null;
  chatModel: string | null;
  fastModel: string | null;
  imageModel: string | null;
  ocrModel: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  lastRotatedAt: string | null;
};

export type ManagedAiProviderRuntimeOverride = {
  provider: AiProvider;
  enabled: boolean;
  managed: true;
  apiKey: string | null;
  keySource: "database" | "none";
  baseUrl: string | null;
  chatModel: string | null;
  fastModel: string | null;
  imageModel: string | null;
  ocrModel: string | null;
  updatedAt: string | null;
  keyFingerprint: string | null;
};

export type UpdatePlatformAiProviderConfigInput = {
  provider: AiProvider;
  enabled: boolean;
  apiKey?: string | null;
  clearApiKey?: boolean;
  baseUrl?: string | null;
  chatModel?: string | null;
  fastModel?: string | null;
  imageModel?: string | null;
  ocrModel?: string | null;
  updatedBy: string;
};

const supportedProviders = ["qwen", "nvidia", "bedrock", "openai", "gemini", "xai", "claude", "vercel_gateway"] as const satisfies AiProvider[];

const providerMetadata: PlatformAiProviderMetadata[] = [
  {
    provider: "qwen",
    label: "Qwen / DashScope",
    keyEnvNames: ["QWEN_API_KEY", "DASHSCOPE_API_KEY"],
    baseUrlEnvNames: ["QWEN_BASE_URL", "DASHSCOPE_BASE_URL", "QWEN_NATIVE_BASE_URL", "DASHSCOPE_NATIVE_BASE_URL"],
    chatModelEnvNames: ["QWEN_MODEL", "QWEN_CHAT_MODEL"],
    fastModelEnvNames: ["QWEN_FAST_MODEL", "QWEN_MODEL"],
    imageModelEnvNames: ["QWEN_IMAGE_MODEL"],
    ocrModelEnvNames: ["QWEN_OCR_MODEL"]
  },
  {
    provider: "nvidia",
    label: "NVIDIA / DSX Air",
    keyEnvNames: ["NVIDIA_AI_API_KEY", "DSX_AIR_API_KEY", "NVIDIA_API_KEY"],
    baseUrlEnvNames: ["NVIDIA_AI_BASE_URL", "DSX_AIR_BASE_URL", "NVIDIA_BASE_URL"],
    chatModelEnvNames: ["NVIDIA_AI_CHAT_MODEL", "NVIDIA_AI_MODEL", "DSX_AIR_CHAT_MODEL", "DSX_AIR_MODEL"],
    fastModelEnvNames: ["NVIDIA_AI_FAST_MODEL", "NVIDIA_AI_CHAT_MODEL", "NVIDIA_AI_MODEL", "DSX_AIR_FAST_MODEL", "DSX_AIR_MODEL"],
    imageModelEnvNames: ["NVIDIA_AI_IMAGE_MODEL", "NVIDIA_AI_VISION_MODEL", "DSX_AIR_IMAGE_MODEL", "DSX_AIR_VISION_MODEL"],
    ocrModelEnvNames: ["NVIDIA_AI_OCR_MODEL", "NVIDIA_AI_VISION_MODEL", "DSX_AIR_OCR_MODEL", "DSX_AIR_VISION_MODEL"]
  },
  {
    provider: "bedrock",
    label: "Amazon Bedrock",
    keyEnvNames: ["AWS_BEARER_TOKEN_BEDROCK", "BEDROCK_API_KEY"],
    baseUrlEnvNames: ["BEDROCK_BASE_URL", "AWS_BEDROCK_BASE_URL"],
    chatModelEnvNames: ["BEDROCK_MODEL", "BEDROCK_CHAT_MODEL", "AWS_BEDROCK_MODEL"],
    fastModelEnvNames: ["BEDROCK_FAST_MODEL", "BEDROCK_MODEL", "AWS_BEDROCK_MODEL"],
    imageModelEnvNames: ["BEDROCK_IMAGE_MODEL"],
    ocrModelEnvNames: ["BEDROCK_OCR_MODEL"]
  },
  {
    provider: "openai",
    label: "OpenAI",
    keyEnvNames: ["OPENAI_API_KEY"],
    baseUrlEnvNames: ["OPENAI_BASE_URL"],
    chatModelEnvNames: ["OPENAI_MODEL", "OPENAI_CHAT_MODEL"],
    fastModelEnvNames: ["OPENAI_FAST_MODEL", "OPENAI_MODEL"],
    imageModelEnvNames: ["OPENAI_IMAGE_MODEL"],
    ocrModelEnvNames: ["OPENAI_OCR_MODEL", "OPENAI_FAST_MODEL", "OPENAI_MODEL"]
  },
  {
    provider: "gemini",
    label: "Gemini",
    keyEnvNames: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
    baseUrlEnvNames: ["GEMINI_BASE_URL"],
    chatModelEnvNames: ["GEMINI_MODEL", "GEMINI_CHAT_MODEL"],
    fastModelEnvNames: ["GEMINI_FAST_MODEL", "GEMINI_MODEL"],
    imageModelEnvNames: ["GEMINI_IMAGE_MODEL"],
    ocrModelEnvNames: ["GEMINI_OCR_MODEL", "GEMINI_FAST_MODEL", "GEMINI_MODEL"]
  },
  {
    provider: "xai",
    label: "xAI Grok",
    keyEnvNames: ["XAI_API_KEY"],
    baseUrlEnvNames: ["XAI_BASE_URL", "XAI_NATIVE_BASE_URL"],
    chatModelEnvNames: ["XAI_MODEL", "XAI_CHAT_MODEL"],
    fastModelEnvNames: ["XAI_FAST_MODEL", "XAI_MODEL", "XAI_CHAT_MODEL"],
    imageModelEnvNames: ["XAI_IMAGE_MODEL"],
    ocrModelEnvNames: ["XAI_OCR_MODEL", "XAI_MODEL"]
  },
  {
    provider: "claude",
    label: "Claude",
    keyEnvNames: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    baseUrlEnvNames: ["ANTHROPIC_BASE_URL", "CLAUDE_BASE_URL"],
    chatModelEnvNames: ["ANTHROPIC_MODEL", "CLAUDE_MODEL"],
    fastModelEnvNames: ["ANTHROPIC_FAST_MODEL", "CLAUDE_FAST_MODEL", "ANTHROPIC_MODEL", "CLAUDE_MODEL"],
    imageModelEnvNames: ["ANTHROPIC_IMAGE_MODEL", "CLAUDE_IMAGE_MODEL"],
    ocrModelEnvNames: ["ANTHROPIC_OCR_MODEL", "CLAUDE_OCR_MODEL", "ANTHROPIC_FAST_MODEL", "CLAUDE_FAST_MODEL"]
  },
  {
    provider: "vercel_gateway",
    label: "Vercel AI Gateway",
    keyEnvNames: ["VERCEL_AI_GATEWAY_API_KEY", "AI_GATEWAY_API_KEY"],
    baseUrlEnvNames: ["VERCEL_AI_GATEWAY_BASE_URL", "AI_GATEWAY_BASE_URL"],
    chatModelEnvNames: ["VERCEL_AI_GATEWAY_MODEL", "AI_GATEWAY_MODEL"],
    fastModelEnvNames: ["VERCEL_AI_GATEWAY_FAST_MODEL", "AI_GATEWAY_FAST_MODEL", "VERCEL_AI_GATEWAY_MODEL", "AI_GATEWAY_MODEL"],
    imageModelEnvNames: ["VERCEL_AI_GATEWAY_IMAGE_MODEL", "AI_GATEWAY_IMAGE_MODEL"],
    ocrModelEnvNames: ["VERCEL_AI_GATEWAY_OCR_MODEL", "AI_GATEWAY_OCR_MODEL", "VERCEL_AI_GATEWAY_FAST_MODEL", "AI_GATEWAY_FAST_MODEL"]
  }
];

const providerConfigCacheTtlMs = 30_000;
let providerConfigCache: { rows: PlatformAiProviderRow[]; expiresAt: number } | null = null;

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

function readEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function cleanOptionalText(value?: string | null, maxLength = 240) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function metadataForProvider(provider: AiProvider) {
  const metadata = providerMetadata.find((item) => item.provider === provider);
  if (!metadata) throw new AppError(`Provider AI ${provider} chưa được admin.logivn.com hỗ trợ.`, 400);
  return metadata;
}

function assertSupportedProvider(provider: AiProvider) {
  if (!supportedProviders.includes(provider as (typeof supportedProviders)[number])) {
    throw new AppError(`Provider AI ${provider} chưa được hỗ trợ.`, 400);
  }
}

function rowHasEncryptedKey(row: PlatformAiProviderRow | undefined) {
  return Boolean(row?.api_key_ciphertext && row.api_key_iv && row.api_key_tag && row.key_fingerprint);
}

async function readPlatformAiProviderRows({ required = false } = {}) {
  if (providerConfigCache && providerConfigCache.expiresAt > Date.now()) return providerConfigCache.rows;

  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("platform_ai_provider_configs")
    .select("provider,enabled,api_key_ciphertext,api_key_iv,api_key_tag,key_fingerprint,key_last_four,base_url,chat_model,fast_model,image_model,ocr_model,last_rotated_at,created_at,updated_at,updated_by")
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingSchemaError(error)) {
      if (required) throw new AppError("Cần chạy migration platform_ai_provider_configs trước khi chỉnh khoá AI từ UI.", 500);
      return [];
    }
    throw error;
  }

  const rows = (data ?? []).filter((row: { provider?: unknown }) => typeof row.provider === "string") as PlatformAiProviderRow[];
  providerConfigCache = { rows, expiresAt: Date.now() + providerConfigCacheTtlMs };
  return rows;
}

export function invalidatePlatformAiProviderConfigCache() {
  providerConfigCache = null;
}

async function rowsByProvider(required = false) {
  const rows = await readPlatformAiProviderRows({ required });
  return new Map(rows.map((row) => [row.provider, row]));
}

export async function listPlatformAiProviderConfigs(): Promise<PlatformAiProviderConfigSummary[]> {
  const rows = await rowsByProvider(false);

  return providerMetadata.map((metadata) => {
    const row = rows.get(metadata.provider);
    const envKey = readEnv(metadata.keyEnvNames);
    const envConfigured = Boolean(envKey);
    const hasManagedKey = rowHasEncryptedKey(row);
    const enabled = row?.enabled ?? true;
    const keySource = hasManagedKey ? "database" : envConfigured ? "environment" : "missing";
    const configured = enabled && (hasManagedKey || envConfigured);

    return {
      provider: metadata.provider,
      label: metadata.label,
      enabled,
      managed: Boolean(row),
      configured,
      keySource,
      keyFingerprint: row?.key_fingerprint ?? null,
      keyPreview: hasManagedKey ? `•••• ${row?.key_last_four ?? "****"}` : envConfigured ? "ENV" : "Chưa có key",
      envConfigured,
      envNames: metadata.keyEnvNames,
      baseUrl: row?.base_url ?? (readEnv(metadata.baseUrlEnvNames) || null),
      chatModel: row?.chat_model ?? (readEnv(metadata.chatModelEnvNames) || null),
      fastModel: row?.fast_model ?? (readEnv(metadata.fastModelEnvNames) || null),
      imageModel: row?.image_model ?? (readEnv(metadata.imageModelEnvNames) || null),
      ocrModel: row?.ocr_model ?? (readEnv(metadata.ocrModelEnvNames) || null),
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
      lastRotatedAt: row?.last_rotated_at ?? null
    };
  });
}

export async function getManagedAiProviderRuntimeOverride(provider: AiProvider): Promise<ManagedAiProviderRuntimeOverride | null> {
  assertSupportedProvider(provider);
  const row = (await rowsByProvider(false)).get(provider);
  if (!row) return null;

  if (!row.enabled) {
    return {
      provider,
      enabled: false,
      managed: true,
      apiKey: null,
      keySource: "none",
      baseUrl: row.base_url,
      chatModel: row.chat_model,
      fastModel: row.fast_model,
      imageModel: row.image_model,
      ocrModel: row.ocr_model,
      updatedAt: row.updated_at,
      keyFingerprint: row.key_fingerprint
    };
  }

  const apiKey = rowHasEncryptedKey(row)
    ? decryptPlatformAiSecret({ ciphertext: row.api_key_ciphertext!, iv: row.api_key_iv!, tag: row.api_key_tag! })
    : null;

  return {
    provider,
    enabled: true,
    managed: true,
    apiKey,
    keySource: apiKey ? "database" : "none",
    baseUrl: row.base_url,
    chatModel: row.chat_model,
    fastModel: row.fast_model,
    imageModel: row.image_model,
    ocrModel: row.ocr_model,
    updatedAt: row.updated_at,
    keyFingerprint: row.key_fingerprint
  };
}

async function writePlatformAiAuditLog(input: {
  actor: string;
  provider: AiProvider;
  changedKey: boolean;
  clearedKey: boolean;
  enabled: boolean;
  metadata: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("platform_audit_logs").insert({
    actor: input.actor,
    action: "platform_ai_provider_config_updated",
    target_type: "platform_ai_provider_config",
    target_id: input.provider,
    metadata: {
      provider: input.provider,
      changedKey: input.changedKey,
      clearedKey: input.clearedKey,
      enabled: input.enabled,
      ...input.metadata
    }
  });

  if (error && !isMissingSchemaError(error)) throw error;
}

export async function updatePlatformAiProviderConfig(input: UpdatePlatformAiProviderConfigInput) {
  assertSupportedProvider(input.provider);
  metadataForProvider(input.provider);
  const apiKey = input.apiKey?.trim() ?? "";
  const changedKey = Boolean(apiKey);
  const clearedKey = input.clearApiKey === true;
  if (changedKey && clearedKey) throw new AppError("Không thể vừa thay key mới vừa xoá key hiện tại.", 400);

  const now = new Date().toISOString();
  const encrypted = changedKey ? encryptPlatformAiSecret(apiKey) : null;
  const payload: Record<string, unknown> = {
    provider: input.provider,
    enabled: input.enabled,
    base_url: cleanOptionalText(input.baseUrl, 500),
    chat_model: cleanOptionalText(input.chatModel, 180),
    fast_model: cleanOptionalText(input.fastModel, 180),
    image_model: cleanOptionalText(input.imageModel, 180),
    ocr_model: cleanOptionalText(input.ocrModel, 180),
    updated_at: now,
    updated_by: input.updatedBy
  };

  if (encrypted) {
    payload.api_key_ciphertext = encrypted.ciphertext;
    payload.api_key_iv = encrypted.iv;
    payload.api_key_tag = encrypted.tag;
    payload.key_fingerprint = encrypted.fingerprint;
    payload.key_last_four = encrypted.lastFour;
    payload.last_rotated_at = now;
  } else if (clearedKey) {
    payload.api_key_ciphertext = null;
    payload.api_key_iv = null;
    payload.api_key_tag = null;
    payload.key_fingerprint = null;
    payload.key_last_four = null;
    payload.last_rotated_at = null;
  }

  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("platform_ai_provider_configs").upsert(payload, { onConflict: "provider" });
  if (error) {
    if (isMissingSchemaError(error)) throw new AppError("Cần chạy migration platform_ai_provider_configs trước khi chỉnh khoá AI từ UI.", 500);
    throw error;
  }

  await writePlatformAiAuditLog({
    actor: input.updatedBy,
    provider: input.provider,
    changedKey,
    clearedKey,
    enabled: input.enabled,
    metadata: {
      keyFingerprint: encrypted?.fingerprint ?? null,
      hasBaseUrlOverride: Boolean(payload.base_url),
      modelOverrides: ["chat_model", "fast_model", "image_model", "ocr_model"].filter((key) => Boolean(payload[key]))
    }
  });
  invalidatePlatformAiProviderConfigCache();
}
