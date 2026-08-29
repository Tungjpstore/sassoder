export const COMPOSE_DRAFT_CACHE_VERSION = 2;

export type ComposeDraftAttachmentMetadata = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
};

export type ComposeDraftCache = {
  version: typeof COMPOSE_DRAFT_CACHE_VERSION;
  userId: string;
  draftId: string | null;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string | null;
  attachments: ComposeDraftAttachmentMetadata[];
  updatedAt: number;
};

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const MAX_ATTACHMENT_COUNT = 10;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, max: number, trim = true) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
  return trim ? cleaned.trim() : cleaned;
}

function optionalText(value: unknown, max: number) {
  const cleaned = cleanText(value, max);
  return cleaned || null;
}

function attachmentMetadata(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENT_COUNT) return null;
  let totalBytes = 0;
  const attachments: ComposeDraftAttachmentMetadata[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const source = item as Record<string, unknown>;
    const id = cleanText(source.id, 240);
    const filename = cleanText(source.filename, 180);
    const contentType = cleanText(source.contentType, 120) || 'application/octet-stream';
    const size = typeof source.size === 'number' ? source.size : Number(source.size);
    if (!id || !filename || !Number.isInteger(size) || size < 0) return null;
    totalBytes += size;
    if (totalBytes > MAX_ATTACHMENT_BYTES) return null;
    attachments.push({ id, filename, contentType, size });
  }
  return attachments;
}

export function composeDraftCacheKey(userId: string) {
  return `logimail.composeDraft.v${COMPOSE_DRAFT_CACHE_VERSION}.${userId}`;
}

export function readComposeDraftCache(storage: DraftStorage, userId: string, allowedFrom: string[]) {
  const raw = storage.getItem(composeDraftCacheKey(userId));
  if (!raw) return null;
  try {
    const source = JSON.parse(raw) as Record<string, unknown>;
    if (source.version !== COMPOSE_DRAFT_CACHE_VERSION || source.userId !== userId) return null;
    const attachments = attachmentMetadata(source.attachments);
    if (!attachments) return null;
    const cachedFrom = cleanText(source.from, 254).toLowerCase();
    const cachedFromAllowed = allowedFrom.includes(cachedFrom);
    const from = cachedFromAllowed ? cachedFrom : allowedFrom[0] ?? '';
    if (!from) return null;
    const draftIdRaw = cleanText(source.draftId, 64);
    // A draft persisted for a mailbox that is no longer authorized must not be
    // reassigned to the fallback mailbox during hydration.
    const draftId = cachedFromAllowed && draftIdRaw && UUID_PATTERN.test(draftIdRaw) ? draftIdRaw : null;
    const updatedAt = typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt) && Math.abs(source.updatedAt) <= 8.64e15
      ? source.updatedAt
      : Date.now();
    return {
      version: COMPOSE_DRAFT_CACHE_VERSION,
      userId,
      draftId,
      from,
      to: cleanText(source.to, 2000),
      cc: cleanText(source.cc, 2000),
      bcc: cleanText(source.bcc, 2000),
      subject: cleanText(source.subject, 180, false),
      text: cleanText(source.text, 200000, false),
      inReplyTo: optionalText(source.inReplyTo, 4000),
      references: optionalText(source.references, 4000),
      attachments,
      updatedAt,
    } satisfies ComposeDraftCache;
  } catch {
    return null;
  }
}

export function writeComposeDraftCache(storage: DraftStorage, snapshot: ComposeDraftCache) {
  try {
    storage.setItem(composeDraftCacheKey(snapshot.userId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearComposeDraftCache(storage: DraftStorage, userId: string) {
  try {
    storage.removeItem(composeDraftCacheKey(userId));
  } catch {
    // Storage cleanup is best effort; the user-visible draft is still cleared.
  }
}
