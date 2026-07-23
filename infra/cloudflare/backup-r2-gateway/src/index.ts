interface R2Object {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

interface R2Bucket {
  put(
    key: string,
    value: ReadableStream,
    options?: {
      httpMetadata?: Record<string, string>;
      customMetadata?: Record<string, string>;
    }
  ): Promise<R2Object>;
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ objects: R2Object[]; truncated: boolean; cursor?: string }>;
}

export interface Env {
  BACKUP_BUCKET: R2Bucket;
  BACKUP_R2_GATEWAY_TOKEN: string;
  BACKUP_R2_ALLOWED_PREFIX?: string;
}

const OBJECTS_PREFIX = "/objects";
const DEFAULT_ALLOWED_PREFIX = "logivn/";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function unauthorized() {
  return jsonResponse({ error: "unauthorized" }, { status: 401 });
}

function notFound() {
  return jsonResponse({ error: "not_found" }, { status: 404 });
}

function forbidden() {
  return jsonResponse({ error: "object_scope_forbidden" }, { status: 403 });
}

async function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
}

async function isAuthorized(request: Request, env: Env) {
  const configuredToken = env.BACKUP_R2_GATEWAY_TOKEN || "";
  const header = request.headers.get("authorization") || "";
  const [scheme, ...rest] = header.split(" ");
  const suppliedToken = scheme.toLowerCase() === "bearer" ? rest.join(" ") : "";

  if (!configuredToken || !suppliedToken) return false;
  return timingSafeEqual(configuredToken, suppliedToken);
}

function allowedPrefix(env: Env) {
  const configured = String(env.BACKUP_R2_ALLOWED_PREFIX || DEFAULT_ALLOWED_PREFIX).trim();
  const normalized = configured.replace(/^\/+/, "");
  return normalized ? `${normalized.replace(/\/+$/, "")}/` : DEFAULT_ALLOWED_PREFIX;
}

function objectKeyFromPath(pathname: string, env: Env) {
  if (!pathname.startsWith(`${OBJECTS_PREFIX}/`)) return null;
  const rawKey = pathname.slice(OBJECTS_PREFIX.length + 1);
  if (!rawKey) return null;
  let key: string;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    return null;
  }
  return key.startsWith(allowedPrefix(env)) ? key : null;
}

function customMetadataFromHeaders(headers: Headers) {
  const metadata: Record<string, string> = {};
  const knownHeaders = [
    ["sha256", "x-backup-sha256"],
    ["backup-job-id", "x-backup-job-id"],
    ["artifact-type", "x-backup-artifact-type"],
    ["metadata-signature", "x-backup-metadata-signature"]
  ] as const;

  for (const [metadataKey, headerName] of knownHeaders) {
    const value = headers.get(headerName);
    if (value) metadata[metadataKey] = value;
  }

  return metadata;
}

async function putObject(request: Request, env: Env, key: string) {
  if (!request.body) {
    return jsonResponse({ error: "empty_body" }, { status: 400 });
  }

  const object = await env.BACKUP_BUCKET.put(key, request.body, {
    httpMetadata: {
      contentType: request.headers.get("content-type") || "application/octet-stream"
    },
    customMetadata: customMetadataFromHeaders(request.headers)
  });

  return jsonResponse({ key, etag: object.etag, uploaded: object.uploaded.toISOString() });
}

async function headObject(env: Env, key: string) {
  const object = await env.BACKUP_BUCKET.head(key);
  if (!object) return notFound();

  return new Response(null, {
    headers: {
      "content-length": String(object.size),
      "etag": object.etag,
      "last-modified": object.uploaded.toUTCString(),
      "x-object-key": key
    }
  });
}

async function getObject(env: Env, key: string) {
  const object = await env.BACKUP_BUCKET.get(key);
  if (!object) return notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("content-length", String(object.size));
  headers.set("last-modified", object.uploaded.toUTCString());
  headers.set("x-object-key", key);
  return new Response(object.body, { headers });
}

async function deleteObject(env: Env, key: string) {
  await env.BACKUP_BUCKET.delete(key);
  return jsonResponse({ key, deleted: true });
}

async function listObjects(request: Request, env: Env) {
  const url = new URL(request.url);
  const scope = allowedPrefix(env);
  const requestedPrefix = url.searchParams.get("prefix") || scope;
  if (!requestedPrefix.startsWith(scope)) return forbidden();
  const prefix = requestedPrefix;
  const cursor = url.searchParams.get("cursor") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") || "1000") || 1000, 1000);
  const listed = await env.BACKUP_BUCKET.list({ prefix, cursor, limit });

  return jsonResponse({
    objects: listed.objects.map((object) => ({
      key: object.key,
      size: object.size,
      etag: object.etag,
      uploaded: object.uploaded.toISOString()
    })),
    truncated: listed.truncated,
    cursor: listed.truncated ? listed.cursor : null
  });
}

const worker = {
  async fetch(request: Request, env: Env) {
    if (!(await isAuthorized(request, env))) return unauthorized();

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "logivn-backup-r2-gateway" });
    }

    if (url.pathname === OBJECTS_PREFIX && request.method === "GET") {
      return listObjects(request, env);
    }

    const key = objectKeyFromPath(url.pathname, env);
    if (!key) return url.pathname.startsWith(`${OBJECTS_PREFIX}/`) ? forbidden() : notFound();

    if (request.method === "PUT") return putObject(request, env, key);
    if (request.method === "HEAD") return headObject(env, key);
    if (request.method === "GET") return getObject(env, key);
    if (request.method === "DELETE") return deleteObject(env, key);

    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
};

export default worker;
