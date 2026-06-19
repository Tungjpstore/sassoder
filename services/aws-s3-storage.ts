import { createHash, createHmac } from "crypto";

export type AwsS3StorageEnv = Record<string, string | undefined>;

export type AwsS3StorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
  keyPrefix: string;
  forcePathStyle: boolean;
};

type UploadAwsS3AssetOptions = {
  env?: AwsS3StorageEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function enabledProvider(env: AwsS3StorageEnv) {
  return clean(env.MENU_IMAGE_STORAGE_PROVIDER || env.ASSET_STORAGE_PROVIDER || env.STORAGE_PROVIDER).toLowerCase();
}

function bool(value: string | undefined) {
  return ["1", "true", "yes"].includes(clean(value).toLowerCase());
}

function normalizePrefix(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

export function resolveAwsS3StorageConfig(env: AwsS3StorageEnv = process.env): AwsS3StorageConfig | null {
  if (enabledProvider(env) !== "s3") return null;

  const accessKeyId = clean(env.AWS_S3_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = clean(env.AWS_S3_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY);
  const bucket = clean(env.AWS_S3_BUCKET || env.S3_BUCKET);
  if (!accessKeyId || !secretAccessKey || !bucket) return null;

  const region = clean(env.AWS_S3_REGION || env.S3_REGION || env.AWS_REGION) || "us-east-1";
  const endpoint = clean(env.AWS_S3_ENDPOINT || env.S3_ENDPOINT) || `https://${bucket}.s3.${region}.amazonaws.com`;
  const publicBaseUrl = clean(env.AWS_S3_PUBLIC_BASE_URL || env.AWS_CLOUDFRONT_URL || env.CLOUDFRONT_URL) || endpoint;

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: clean(env.AWS_SESSION_TOKEN || env.AWS_S3_SESSION_TOKEN || env.S3_SESSION_TOKEN) || undefined,
    region,
    bucket,
    endpoint: endpoint.replace(/\/+$/, ""),
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    keyPrefix: normalizePrefix(clean(env.AWS_S3_KEY_PREFIX || env.S3_KEY_PREFIX || "logivn-assets")),
    forcePathStyle: bool(env.AWS_S3_FORCE_PATH_STYLE || env.S3_FORCE_PATH_STYLE)
  };
}

export function isAwsS3AssetStorageConfigured(env: AwsS3StorageEnv = process.env) {
  return Boolean(resolveAwsS3StorageConfig(env));
}

export function isAwsS3AssetUrl(url: string, env: AwsS3StorageEnv = process.env) {
  const config = resolveAwsS3StorageConfig(env);
  if (!config) return false;
  try {
    const parsed = new URL(url);
    const publicBase = new URL(config.publicBaseUrl);
    return parsed.origin === publicBase.origin && parsed.pathname.startsWith(`${publicBase.pathname.replace(/\/$/, "")}/`);
  } catch {
    return false;
  }
}

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secret: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function amzTimestamp(now: Date) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKeyPath(key: string) {
  return key.split("/").map(encodePathSegment).join("/");
}

function objectUrl(config: AwsS3StorageConfig, key: string) {
  const endpoint = new URL(config.endpoint);
  if (config.forcePathStyle) return new URL(`/${encodePathSegment(config.bucket)}/${encodeKeyPath(key)}`, endpoint.origin);
  return new URL(`/${encodeKeyPath(key)}`, endpoint.origin);
}

function publicUrl(config: AwsS3StorageConfig, key: string) {
  return `${config.publicBaseUrl}/${encodeKeyPath(key)}`;
}

function signedPutHeaders(config: AwsS3StorageConfig, url: URL, body: Buffer, contentType: string, cacheControl: string, now: Date) {
  const amzDate = amzTimestamp(now);
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const baseHeaders: Record<string, string> = {
    "cache-control": cacheControl,
    "content-type": contentType,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(config.sessionToken ? { "x-amz-security-token": config.sessionToken } : {})
  };
  const signedHeaders = Object.keys(baseHeaders).sort().join(";");
  const canonicalHeaders = Object.keys(baseHeaders)
    .sort()
    .map((key) => `${key}:${baseHeaders[key]}\n`)
    .join("");
  const canonicalRequest = ["PUT", url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, date, config.region)).update(stringToSign, "utf8").digest("hex");

  return {
    ...baseHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

function safeKeyPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._/-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

export function buildAwsS3AssetKey(parts: string[], env: AwsS3StorageEnv = process.env) {
  const config = resolveAwsS3StorageConfig(env);
  const keyPrefix = config?.keyPrefix ?? normalizePrefix(clean(env.AWS_S3_KEY_PREFIX || env.S3_KEY_PREFIX || "logivn-assets"));
  const key = parts.map(safeKeyPart).filter(Boolean).join("/");
  return [keyPrefix, key].filter(Boolean).join("/");
}

export async function uploadAwsS3Asset({
  key,
  bytes,
  contentType,
  cacheControl = "public, max-age=31536000, immutable"
}: {
  key: string;
  bytes: Buffer;
  contentType: string;
  cacheControl?: string;
}, options: UploadAwsS3AssetOptions = {}) {
  const config = resolveAwsS3StorageConfig(options.env ?? process.env);
  if (!config) throw new Error("AWS S3 asset storage is not configured.");

  const url = objectUrl(config, key);
  const uploadBody = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(uploadBody).set(bytes);
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "PUT",
    headers: signedPutHeaders(config, url, bytes, contentType, cacheControl, options.now ?? new Date()),
    body: uploadBody
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message.slice(0, 500) || `S3 upload failed with status ${response.status}.`);
  }

  return {
    key,
    publicUrl: publicUrl(config, key)
  };
}
