#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient } from "@supabase/supabase-js";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, "true");
  }
}

const outputDir = args.get("out");
const manifestPath = args.get("manifest");
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const limit = positiveInteger(process.env.BACKUP_STORAGE_LIST_LIMIT, 1000);
const maxObjects = positiveInteger(process.env.BACKUP_STORAGE_MAX_OBJECTS, 50000);
const maxBytes = nonNegativeInteger(process.env.BACKUP_STORAGE_MAX_BYTES, 0);
const includeBuckets = csvSet(process.env.BACKUP_STORAGE_BUCKETS);
const excludeBuckets = csvSet(process.env.BACKUP_STORAGE_EXCLUDE_BUCKETS);

if (!outputDir || !manifestPath) {
  throw new Error("Usage: supabase-storage-export.mjs --out <dir> --manifest <file>");
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const manifest = {
  schemaVersion: "logivn.supabase-storage-export.v1",
  capturedAt: new Date().toISOString(),
  source: "supabase-storage",
  outputLayout: "buckets/<encoded bucket>/<encoded object path>",
  buckets: [],
  totals: {
    buckets: 0,
    objects: 0,
    bytes: 0,
    skippedObjects: 0,
    failedObjects: 0
  },
  limits: {
    maxObjects,
    maxBytes,
    listLimit: limit,
    includeBuckets: [...includeBuckets],
    excludeBuckets: [...excludeBuckets]
  }
};

await mkdir(outputDir, { recursive: true });

const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) throw bucketError;

for (const bucket of buckets ?? []) {
  if (includeBuckets.size && !includeBuckets.has(bucket.name)) continue;
  if (excludeBuckets.has(bucket.name)) continue;

  const bucketManifest = {
    id: bucket.id,
    name: bucket.name,
    public: Boolean(bucket.public),
    fileSizeLimit: bucket.file_size_limit ?? null,
    allowedMimeTypes: bucket.allowed_mime_types ?? null,
    objects: [],
    skipped: [],
    errors: []
  };
  manifest.buckets.push(bucketManifest);
  manifest.totals.buckets += 1;

  await exportFolder({ bucketName: bucket.name, prefix: "", bucketManifest });
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
process.stdout.write(JSON.stringify(manifest.totals));

async function exportFolder({ bucketName, prefix, bucketManifest }) {
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucketName).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" }
    });

    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) return;

    for (const item of rows) {
      if (!item?.name || item.name === ".emptyFolderPlaceholder") continue;
      const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
      const isFolder = !item.id && !item.metadata?.size && !item.updated_at;

      if (isFolder) {
        await exportFolder({ bucketName, prefix: objectPath, bucketManifest });
        continue;
      }

      await exportObject({ bucketName, objectPath, item, bucketManifest });
    }

    offset += rows.length;
    if (rows.length < limit) return;
  }
}

async function exportObject({ bucketName, objectPath, item, bucketManifest }) {
  if (manifest.totals.objects >= maxObjects) {
    manifest.totals.skippedObjects += 1;
    bucketManifest.skipped.push({ path: objectPath, reason: "max_objects" });
    return;
  }

  const expectedSize = Number(item.metadata?.size ?? 0);
  if (maxBytes > 0 && expectedSize > 0 && manifest.totals.bytes + expectedSize > maxBytes) {
    manifest.totals.skippedObjects += 1;
    bucketManifest.skipped.push({ path: objectPath, reason: "max_bytes", size: expectedSize });
    return;
  }

  const relativePath = join("buckets", safeSegment(bucketName), ...objectPath.split("/").map(safeSegment));
  const destination = join(outputDir, relativePath);

  try {
    await mkdir(dirname(destination), { recursive: true });
    const response = await fetch(storageObjectUrl(bucketName, objectPath), {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`
      }
    });

    if (!response.ok || !response.body) {
      throw new Error(`download failed ${response.status} ${response.statusText}`);
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { flags: "wx" }));
    const written = await stat(destination);
    manifest.totals.objects += 1;
    manifest.totals.bytes += written.size;
    bucketManifest.objects.push({
      path: objectPath,
      localPath: relativePath,
      size: written.size,
      expectedSize: expectedSize || null,
      mimeType: item.metadata?.mimetype ?? item.metadata?.mimeType ?? null,
      updatedAt: item.updated_at ?? null,
      createdAt: item.created_at ?? null,
      lastAccessedAt: item.last_accessed_at ?? null
    });
  } catch (error) {
    manifest.totals.failedObjects += 1;
    bucketManifest.errors.push({
      path: objectPath,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function csvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function safeSegment(value) {
  const encoded = encodeURIComponent(String(value || "object"));
  return encoded.replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`) || "object";
}

function storageObjectUrl(bucketName, objectPath) {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucketName)}/${encodedPath}`;
}
