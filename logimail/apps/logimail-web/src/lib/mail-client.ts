import { Readable } from 'node:stream';
import { ImapFlow, type FetchMessageObject, type ListResponse, type MessageAddressObject, type SearchObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type StreamTransport from 'nodemailer/lib/stream-transport';
import type { AuthorizedMailbox } from '@/lib/mail-access';
import type { MailSession } from '@/lib/mail-session';

export type MailFolderKey = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash' | 'archive';

export type MailFolder = {
  key: MailFolderKey;
  path: string;
  label: string;
  total: number | null;
  unseen: number | null;
};

export type MailMessageSummary = {
  id: string;
  uid: number;
  folder: MailFolderKey;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  unread: boolean;
  flagged: boolean;
  size: number | null;
};

export type MailMessageDetail = MailMessageSummary & {
  cc: string;
  bodyText: string;
  bodyHtml: string | null;
  messageId: string | null;
  references: string | null;
  attachments: Array<{ index: number; filename: string; contentType: string; size: number | null }>;
};

export type SendMailAttachment = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

export type SendMailInput = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
  attachments?: SendMailAttachment[];
};

export type QuotaCommitResult = { status: 'reserved' };

const MAX_ATTACHMENT_COUNT = 10;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_NAME = 180;

const FOLDER_LABELS: Record<MailFolderKey, string> = {
  inbox: 'Hộp thư đến',
  sent: 'Đã gửi',
  drafts: 'Thư nháp',
  spam: 'Thư rác',
  trash: 'Thùng rác',
  archive: 'Lưu trữ',
};

const FOLDER_FALLBACKS: Record<MailFolderKey, string[]> = {
  inbox: ['INBOX'],
  sent: ['Sent', 'Sent Messages', 'Sent Mail'],
  drafts: ['Drafts'],
  spam: ['Junk', 'Spam'],
  trash: ['Trash', 'Deleted Messages'],
  archive: ['Archive', 'Archives'],
};

function mailHost(mailbox?: AuthorizedMailbox | null) {
  return mailbox?.mailHostname || process.env.LOGIMAIL_MAIL_HOSTNAME || process.env.BILLIONMAIL_HOSTNAME || 'mail.logivn.com';
}

function imapConfig(mailbox?: AuthorizedMailbox | null) {
  return {
    host: process.env.LOGIMAIL_IMAP_HOST || mailHost(mailbox),
    port: Number(process.env.LOGIMAIL_IMAP_PORT || 993),
    secure: (process.env.LOGIMAIL_IMAP_SECURE ?? 'true') !== 'false',
  };
}

function smtpConfig(mailbox?: AuthorizedMailbox | null) {
  return {
    host: process.env.LOGIMAIL_SMTP_HOST || mailHost(mailbox),
    port: Number(process.env.LOGIMAIL_SMTP_PORT || 587),
    secure: (process.env.LOGIMAIL_SMTP_SECURE ?? 'false') === 'true',
    requireTLS: (process.env.LOGIMAIL_SMTP_REQUIRE_TLS ?? 'true') !== 'false',
  };
}

function createImapClient(session: Pick<MailSession, 'email' | 'password'>, mailbox?: AuthorizedMailbox | null) {
  const config = imapConfig(mailbox);
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    servername: mailHost(mailbox),
    auth: { user: session.email, pass: session.password },
    clientInfo: { name: 'LogiMail', vendor: 'LogiVN' },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 45000,
    maxLiteralSize: 12 * 1024 * 1024,
  });
  // ImapFlow emits idle socket failures asynchronously; always consume the
  // event so an expired pooled connection cannot become an uncaught exception.
  client.on('error', () => {
    discardPooledClient(client);
    closeQuietly(client);
  });
  return client;
}

async function withImap<T>(session: Pick<MailSession, 'email' | 'password'>, mailbox: AuthorizedMailbox | null, action: (client: ImapFlow) => Promise<T>) {
  const client = await acquireImapClient(session, mailbox);
  try {
    const result = await action(client);
    releaseImapClient(session, mailbox, client);
    return result;
  } catch (error) {
    // Never return a connection that errored mid-command to the pool.
    try {
      if (client.usable) await client.logout().catch(() => client.close());
      else client.close();
    } catch {
      // ignore teardown failures
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// IMAP connection pool
//
// Reuses authenticated IMAP connections across requests instead of opening a
// fresh TLS + LOGIN handshake on every operation. Each pooled connection is
// health-checked with NOOP before reuse and evicted when idle, unusable, or
// when an operation fails. Callers always re-open the target mailbox, so a
// reused connection carries no stale folder state.
// ---------------------------------------------------------------------------

type PooledImapClient = { client: ImapFlow; lastUsed: number };

const POOL_MAX_PER_KEY = 3;
const POOL_IDLE_TTL_MS = 60_000;
const imapPool = new Map<string, PooledImapClient[]>();
let poolSweepTimer: ReturnType<typeof setInterval> | null = null;

function poolKey(session: Pick<MailSession, 'email'>, mailbox?: AuthorizedMailbox | null) {
  const config = imapConfig(mailbox);
  return `${config.host}:${config.port}:${session.email.toLowerCase()}`;
}

function closeQuietly(client: ImapFlow) {
  try {
    client.close();
  } catch {
    // ignore
  }
}

function discardPooledClient(client: ImapFlow) {
  for (const [key, list] of imapPool) {
    const remaining = list.filter((pooled) => pooled.client !== client);
    if (remaining.length > 0) imapPool.set(key, remaining);
    else imapPool.delete(key);
  }
}

function schedulePoolSweep() {
  if (poolSweepTimer) return;
  poolSweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, list] of imapPool) {
      const fresh = list.filter((pooled) => {
        if (now - pooled.lastUsed > POOL_IDLE_TTL_MS || !pooled.client.usable) {
          closeQuietly(pooled.client);
          return false;
        }
        return true;
      });
      if (fresh.length) imapPool.set(key, fresh);
      else imapPool.delete(key);
    }
    if (imapPool.size === 0 && poolSweepTimer) {
      clearInterval(poolSweepTimer);
      poolSweepTimer = null;
    }
  }, POOL_IDLE_TTL_MS);
  // Do not keep the event loop alive solely for the sweep timer.
  (poolSweepTimer as unknown as { unref?: () => void }).unref?.();
}

async function acquireImapClient(session: Pick<MailSession, 'email' | 'password'>, mailbox?: AuthorizedMailbox | null) {
  const key = poolKey(session, mailbox);
  const list = imapPool.get(key);
  while (list && list.length) {
    const pooled = list.pop();
    if (!pooled) break;
    if (Date.now() - pooled.lastUsed > POOL_IDLE_TTL_MS || !pooled.client.usable) {
      closeQuietly(pooled.client);
      continue;
    }
    try {
      await pooled.client.noop();
      return pooled.client;
    } catch {
      closeQuietly(pooled.client);
    }
  }
  const client = createImapClient(session, mailbox);
  await client.connect();
  return client;
}

function releaseImapClient(session: Pick<MailSession, 'email' | 'password'>, mailbox: AuthorizedMailbox | null, client: ImapFlow) {
  if (!client.usable) {
    closeQuietly(client);
    return;
  }
  const key = poolKey(session, mailbox);
  const list = imapPool.get(key) ?? [];
  if (list.length >= POOL_MAX_PER_KEY) {
    void client.logout().catch(() => closeQuietly(client));
    return;
  }
  list.push({ client, lastUsed: Date.now() });
  imapPool.set(key, list);
  schedulePoolSweep();
}

function addressLine(addresses?: MessageAddressObject[]) {
  return (addresses ?? [])
    .map((address) => [address.name, address.address ? `<${address.address}>` : null].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');
}

function parsedAddressText(value: unknown): string {
  if (!value) return '';
  if (Array.isArray(value)) return value.map((item) => parsedAddressText(item)).filter(Boolean).join(', ');
  if (typeof value === 'object' && 'text' in value && typeof (value as { text?: unknown }).text === 'string') {
    return (value as { text: string }).text;
  }
  return '';
}

function isSelectableFolder(folder: ListResponse) {
  const flags = Array.from(folder.flags ?? []).map((flag) => flag.toLowerCase());
  return !flags.includes('\\noselect') && !flags.includes('\\nonexistent');
}

function folderPathMatchesName(folder: ListResponse, name: string) {
  const path = folder.path.toLowerCase();
  const target = name.toLowerCase();
  const nestedSuffix = folder.delimiter ? `${folder.delimiter}${target}` : null;
  return folder.name.toLowerCase() === target || path === target || Boolean(nestedSuffix && path.endsWith(nestedSuffix));
}

function folderKeyFromList(folder: ListResponse): MailFolderKey | null {
  if (!isSelectableFolder(folder)) return null;
  const special = folder.specialUse?.toLowerCase();
  if (special === '\\inbox') return 'inbox';
  if (special === '\\sent') return 'sent';
  if (special === '\\drafts') return 'drafts';
  if (special === '\\junk') return 'spam';
  if (special === '\\trash') return 'trash';
  // IMAP \\All is an aggregate view (often read-only), not an archive target.
  // Archive must resolve to a dedicated folder so move semantics stay safe.
  if (special === '\\archive') return 'archive';

  if (folderPathMatchesName(folder, 'INBOX')) return 'inbox';
  for (const [key, names] of Object.entries(FOLDER_FALLBACKS) as Array<[MailFolderKey, string[]]>) {
    if (names.some((name) => folderPathMatchesName(folder, name))) return key;
  }
  return null;
}

function existingFolderPathFor(key: MailFolderKey, folders: ListResponse[]) {
  const bySpecial = folders.find((folder) => folderKeyFromList(folder) === key);
  if (bySpecial) return bySpecial.path;
  const fallback = FOLDER_FALLBACKS[key];
  const byName = folders.find((folder) => {
    if (isSelectableFolder(folder)) return fallback.some((name) => folderPathMatchesName(folder, name));
    return false;
  });
  return byName?.path ?? null;
}

function folderPathFor(key: MailFolderKey, folders: ListResponse[]) {
  return existingFolderPathFor(key, folders) ?? FOLDER_FALLBACKS[key][0];
}

/** Create Archive only when an archive action needs a real move target. */
async function ensureArchiveFolderPath(client: ImapFlow, folders: ListResponse[]) {
  const existing = existingFolderPathFor('archive', folders);
  if (existing) return existing;

  const requestedPath = FOLDER_FALLBACKS.archive[0];
  try {
    await client.mailboxCreate(requestedPath);
    const refreshed = await client.list();
    const createdEntry = existingFolderPathFor('archive', refreshed);
    if (createdEntry) return createdEntry;
    throw new Error('archive_not_selectable');
  } catch (error) {
    // Another request may have created Archive between LIST and CREATE.
    const refreshed = await client.list();
    const createdByPeer = existingFolderPathFor('archive', refreshed);
    if (createdByPeer) return createdByPeer;
    throw error;
  }
}

async function moveMessagesSafely(client: ImapFlow, uids: number[], destination: string) {
  if (client.capabilities.has('MOVE')) {
    const moved = await client.messageMove(uids, destination, { uid: true });
    if (!moved) throw new Error('imap_move_failed');
    return;
  }

  // ImapFlow's MOVE fallback deletes the source even when COPY returns false.
  // Reimplement the fallback so a failed copy can never remove the source.
  if (!client.capabilities.has('UIDPLUS')) throw new Error('imap_move_unsupported');
  const copied = await client.messageCopy(uids, destination, { uid: true });
  if (!copied) throw new Error('imap_copy_failed');
  const deleted = await client.messageDelete(uids, { uid: true });
  if (!deleted) {
    await client.messageFlagsRemove(uids, ['\\Deleted'], { uid: true }).catch(() => undefined);
    throw new Error('imap_move_cleanup_failed');
  }
}

function encodeMessageId(folder: MailFolderKey, uid: number) {
  return `${folder}-${uid}`;
}

export function parseMessageRouteId(value: string): { folder: MailFolderKey; uid: number } | null {
  const match = /^(inbox|sent|drafts|spam|trash|archive)-(\d+)$/.exec(value);
  if (!match) return null;
  return { folder: match[1] as MailFolderKey, uid: Number(match[2]) };
}

function messageSummary(folder: MailFolderKey, message: FetchMessageObject): MailMessageSummary {
  const flags = message.flags ?? new Set<string>();
  return {
    id: encodeMessageId(folder, message.uid),
    uid: message.uid,
    folder,
    subject: message.envelope?.subject?.trim() || '(Không có tiêu đề)',
    from: addressLine(message.envelope?.from) || '(Không rõ người gửi)',
    to: addressLine(message.envelope?.to),
    date: message.internalDate ? new Date(message.internalDate).toISOString() : null,
    unread: !flags.has('\\Seen'),
    flagged: flags.has('\\Flagged'),
    size: typeof message.size === 'number' ? message.size : null,
  };
}

function htmlToText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function splitRecipients(value: string | undefined) {
  return (value ?? '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const MAX_HTML_BYTES = 1.5 * 1024 * 1024;

// Server-side defense-in-depth scrub. The browser renders this inside a
// sandboxed iframe (no script execution), so this is a second layer that
// strips active content, event handlers and dangerous URL schemes before the
// markup ever reaches the client.
function sanitizeEmailHtml(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null;
  let html = value.slice(0, MAX_HTML_BYTES);
  html = html
    .replace(/<\s*(script|iframe|object|embed|noscript|template|base)[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*(script|iframe|object|embed|link|meta|base)\b[^>]*>/gi, ' ')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2')
    .replace(/(href|src|xlink:href)\s*=\s*("|')\s*data:text\/html[^"']*\2/gi, '$1=$2#$2')
    .replace(/<\s*style[\s\S]*?expression\s*\([\s\S]*?<\s*\/\s*style\s*>/gi, ' ');
  return html.trim() || null;
}

function cleanMailHeaderValue(value: string | undefined, max = 4000) {
  return value?.replace(/[\r\n]/g, ' ').trim().slice(0, max) || undefined;
}

function referencesLine(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(' ') || null;
  return String(value).trim() || null;
}

function cleanAttachmentFilename(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ATTACHMENT_NAME) || 'attachment';
}

function validateAttachments(input: SendMailAttachment[] | undefined) {
  const attachments = input ?? [];
  if (attachments.length > MAX_ATTACHMENT_COUNT) throw new Error('too_many_attachments');
  let totalBytes = 0;
  return attachments.map((attachment) => {
    const filename = cleanAttachmentFilename(attachment.filename);
    const contentType = cleanMailHeaderValue(attachment.contentType, 120) || 'application/octet-stream';
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) throw new Error('invalid_attachment_type');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.contentBase64)) throw new Error('invalid_attachment');
    const content = Buffer.from(attachment.contentBase64, 'base64');
    if (!content.length) throw new Error('invalid_attachment');
    totalBytes += content.byteLength;
    if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error('attachments_too_large');
    return { filename, contentType, content };
  });
}

export function validateSendInput(input: SendMailInput) {
  const to = splitRecipients(input.to);
  const cc = splitRecipients(input.cc);
  const bcc = splitRecipients(input.bcc);
  if (to.length + cc.length + bcc.length === 0) throw new Error('missing_recipients');
  for (const recipient of [...to, ...cc, ...bcc]) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 254) throw new Error('invalid_recipient');
  }
  const subject = input.subject.trim().slice(0, 180) || '(Không có tiêu đề)';
  const text = input.text.trim();
  if (!text) throw new Error('missing_body');
  if (text.length > 200_000) throw new Error('body_too_large');
  const attachments = validateAttachments(input.attachments);
  return {
    to,
    cc,
    bcc,
    subject,
    text,
    inReplyTo: cleanMailHeaderValue(input.inReplyTo),
    references: cleanMailHeaderValue(input.references),
    attachments,
  };
}

async function bufferFrom(value: Buffer | Readable) {
  if (Buffer.isBuffer(value)) return value;
  const chunks: Buffer[] = [];
  for await (const chunk of value) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function verifyMailCredentials(email: string, password: string, mailbox: AuthorizedMailbox | null) {
  // Always use a fresh, non-pooled connection so the supplied password is truly
  // authenticated against the server (a pooled connection is keyed by email and
  // could otherwise validate a wrong password).
  const client = createImapClient({ email, password }, mailbox);
  await client.connect();
  try {
    await client.noop();
  } finally {
    if (client.usable) await client.logout().catch(() => client.close());
    else client.close();
  }
}

export async function listMailFolders(session: Pick<MailSession, 'email' | 'password'>, mailbox: AuthorizedMailbox) {
  return withImap(session, mailbox, async (client) => {
    const listed = await client.list({ statusQuery: { messages: true, unseen: true } });
    const mapped = new Map<MailFolderKey, MailFolder>();
    for (const folder of listed) {
      const key = folderKeyFromList(folder);
      if (!key || mapped.has(key)) continue;
      mapped.set(key, {
        key,
        path: folder.path,
        label: FOLDER_LABELS[key],
        total: typeof folder.status?.messages === 'number' ? folder.status.messages : null,
        unseen: typeof folder.status?.unseen === 'number' ? folder.status.unseen : null,
      });
    }
    for (const key of Object.keys(FOLDER_LABELS) as MailFolderKey[]) {
      if (!mapped.has(key)) {
        mapped.set(key, { key, path: folderPathFor(key, listed), label: FOLDER_LABELS[key], total: null, unseen: null });
      }
    }
    return Array.from(mapped.values());
  });
}

export type MailListFilter = 'all' | 'unread' | 'starred';

export type ListMailOptions = { limit?: number; page?: number; query?: string; filter?: MailListFilter; afterUid?: number };

export type ListMailResult = {
  folderPath: string;
  uidValidity: string | null;
  messages: MailMessageSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

function searchCriteria(query: string, filter: MailListFilter): SearchObject {
  const criteria: SearchObject = {};
  if (filter === 'unread') criteria.seen = false;
  if (filter === 'starred') criteria.flagged = true;
  const q = query.trim().slice(0, 120);
  if (q) criteria.or = [{ subject: q }, { from: q }, { to: q }];
  if (!q && filter === 'all') criteria.all = true;
  return criteria;
}

export async function listMailMessages(
  session: Pick<MailSession, 'email' | 'password'>,
  mailbox: AuthorizedMailbox,
  folder: MailFolderKey,
  limit = 40,
  opts: ListMailOptions = {},
): Promise<ListMailResult> {
  const pageSize = Math.min(100, Math.max(1, opts.limit ?? limit));
  const page = Math.max(0, Math.floor(opts.page ?? 0));
  const query = opts.query?.trim() ?? '';
  const filter = opts.filter ?? 'all';

  return withImap(session, mailbox, async (client) => {
    const folders = await client.list();
    const folderPath = existingFolderPathFor(folder, folders);
    // Archive is optional on IMAP providers. Treat a missing dedicated folder
    // as an empty view instead of opening a path that does not exist.
    if (!folderPath && folder === 'archive') {
      return {
        folderPath: FOLDER_FALLBACKS.archive[0],
        uidValidity: null,
        messages: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
    const targetPath = folderPath ?? folderPathFor(folder, folders);
    const mailboxInfo = await client.mailboxOpen(targetPath, { readOnly: true });
    const exists = typeof mailboxInfo.exists === 'number' ? mailboxInfo.exists : 0;

    const uidValidity = typeof mailboxInfo.uidValidity === 'bigint' ? mailboxInfo.uidValidity.toString() : null;
    const empty: ListMailResult = { folderPath: targetPath, uidValidity, messages: [], total: 0, page, pageSize, hasMore: false };
    if (exists === 0) return empty;

    let targetUids: number[];
    let total: number;

    if (typeof opts.afterUid === 'number' && Number.isSafeInteger(opts.afterUid) && opts.afterUid >= 0) {
      const matched = (await client.search({ uid: `${opts.afterUid + 1}:*` }, { uid: true })) || [];
      const sorted = matched.filter((uid) => uid > opts.afterUid!).sort((left, right) => left - right);
      total = sorted.length;
      targetUids = sorted.slice(0, pageSize);
    } else if (query || filter !== 'all') {
      // Server-side IMAP SEARCH across subject/from/to, newest first, paginated.
      const matched = (await client.search(searchCriteria(query, filter), { uid: true })) || [];
      total = matched.length;
      if (total === 0) return empty;
      const sorted = [...matched].sort((left, right) => right - left);
      targetUids = sorted.slice(page * pageSize, page * pageSize + pageSize);
    } else {
      // Sequence-range window of the newest messages — avoids scanning all UIDs.
      total = exists;
      const hi = exists - page * pageSize;
      if (hi < 1) return { ...empty, total };
      const lo = Math.max(1, hi - pageSize + 1);
      const range = `${lo}:${hi}`;
      const messages: MailMessageSummary[] = [];
      for await (const message of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true, size: true })) {
        messages.push(messageSummary(folder, message));
      }
      messages.sort((left, right) => right.uid - left.uid);
      return { folderPath: targetPath, uidValidity, messages, total, page, pageSize, hasMore: (page + 1) * pageSize < total };
    }

    if (targetUids.length === 0) return { ...empty, total };
    const messages: MailMessageSummary[] = [];
    for await (const message of client.fetch(targetUids, { uid: true, envelope: true, flags: true, internalDate: true, size: true }, { uid: true })) {
      messages.push(messageSummary(folder, message));
    }
    messages.sort((left, right) => right.uid - left.uid);
    return { folderPath: targetPath, uidValidity, messages, total, page, pageSize, hasMore: (page + 1) * pageSize < total };
  });
}

export type MailActionKind =
  | 'read'
  | 'unread'
  | 'flag'
  | 'unflag'
  | 'trash'
  | 'archive'
  | 'spam'
  | 'restore'
  | 'delete_permanently';

export async function applyMailAction(
  session: Pick<MailSession, 'email' | 'password'>,
  mailbox: AuthorizedMailbox,
  folder: MailFolderKey,
  uids: number[],
  action: MailActionKind,
) {
  if (uids.length === 0) return { affected: 0 };
  return withImap(session, mailbox, async (client) => {
    const folders = await client.list();
    const folderPath = folderPathFor(folder, folders);
    await client.mailboxOpen(folderPath, { readOnly: false });

    if (action === 'read') {
      if (!(await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }))) throw new Error('imap_flag_failed');
    } else if (action === 'unread') {
      if (!(await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true }))) throw new Error('imap_flag_failed');
    } else if (action === 'flag') {
      if (!(await client.messageFlagsAdd(uids, ['\\Flagged'], { uid: true }))) throw new Error('imap_flag_failed');
    } else if (action === 'unflag') {
      if (!(await client.messageFlagsRemove(uids, ['\\Flagged'], { uid: true }))) throw new Error('imap_flag_failed');
    }
    else if (action === 'restore') {
      if (!['trash', 'spam', 'archive'].includes(folder)) throw new Error('invalid_restore_source');
      await moveMessagesSafely(client, uids, folderPathFor('inbox', folders));
    } else if (action === 'delete_permanently') {
      if (folder !== 'trash') throw new Error('invalid_permanent_delete_source');
      // Without UIDPLUS, IMAP EXPUNGE removes every message marked Deleted in
      // the mailbox, including messages deleted by another session.
      if (!client.capabilities.has('UIDPLUS')) throw new Error('imap_permanent_delete_unsupported');
      const deleted = await client.messageDelete(uids, { uid: true });
      if (!deleted) throw new Error('imap_permanent_delete_failed');
    } else {
      const targetKey: MailFolderKey = action === 'trash' ? 'trash' : action === 'archive' ? 'archive' : 'spam';
      if (folder === targetKey) throw new Error('invalid_move_target');
      const targetPath = action === 'archive' ? await ensureArchiveFolderPath(client, folders) : folderPathFor(targetKey, folders);
      await moveMessagesSafely(client, uids, targetPath);
    }
    return { affected: uids.length };
  });
}

export async function getMailMessage(session: MailSession, mailbox: AuthorizedMailbox, folder: MailFolderKey, uid: number, options: { markRead?: boolean } = {}) {
  const markRead = options.markRead ?? true;
  return withImap(session, mailbox, async (client) => {
    const folders = await client.list();
    const folderPath = folderPathFor(folder, folders);
    await client.mailboxOpen(folderPath, { readOnly: !markRead });
    const message = await client.fetchOne(String(uid), { uid: true, envelope: true, flags: true, internalDate: true, size: true, source: { maxLength: 8 * 1024 * 1024 } }, { uid: true });
    if (!message) return null;
    if (markRead) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => undefined);
    const parsed = message.source ? await simpleParser(message.source) : null;
    return {
      ...messageSummary(folder, message),
      cc: parsedAddressText(parsed?.cc) || addressLine(message.envelope?.cc),
      bodyText: parsed?.text?.trim() || (typeof parsed?.html === 'string' ? htmlToText(parsed.html) : '') || '(Email này chưa có nội dung text an toàn để hiển thị.)',
      bodyHtml: sanitizeEmailHtml(typeof parsed?.html === 'string' ? parsed.html : null),
      messageId: parsed?.messageId?.trim() || null,
      references: referencesLine(parsed?.references),
      attachments: (parsed?.attachments ?? []).map((attachment, index) => ({
        index,
        filename: attachment.filename ?? 'attachment',
        contentType: attachment.contentType,
        size: typeof attachment.size === 'number' ? attachment.size : null,
      })),
    } satisfies MailMessageDetail;
  });
}

export async function getMailAttachment(
  session: Pick<MailSession, 'email' | 'password'>,
  mailbox: AuthorizedMailbox,
  folder: MailFolderKey,
  uid: number,
  index: number,
) {
  return withImap(session, mailbox, async (client) => {
    const folders = await client.list();
    const folderPath = folderPathFor(folder, folders);
    await client.mailboxOpen(folderPath, { readOnly: true });
    const message = await client.fetchOne(String(uid), { uid: true, source: { maxLength: 25 * 1024 * 1024 } }, { uid: true });
    if (!message || !message.source) return null;
    const parsed = await simpleParser(message.source);
    const attachment = parsed.attachments?.[index];
    if (!attachment) return null;
    return {
      filename: cleanAttachmentFilename(attachment.filename ?? 'attachment'),
      contentType: cleanMailHeaderValue(attachment.contentType, 120) || 'application/octet-stream',
      content: await bufferFrom(attachment.content as Buffer),
    };
  });
}

export async function sendMailThroughMailbox(session: MailSession, mailbox: AuthorizedMailbox, input: SendMailInput) {
  const sanitized = validateSendInput(input);
  const [{ enforceSendingQuota }, { findSuppressedRecipients }] = await Promise.all([
    import('@/lib/deliverability/quota'),
    import('@/lib/deliverability/bounce'),
  ]);

  // Reserve a bounded Sending_Domain quota before SMTP accepts the message.
  const quota = await enforceSendingQuota(session.email);
  if (!quota.allowed) throw new Error(quota.reason ?? 'quota_exceeded');

  // Block sends to suppressed recipients (R5.4).
  if (quota.workspaceId) {
    const recipients = [...sanitized.to, ...sanitized.cc, ...sanitized.bcc];
    const suppressed = await findSuppressedRecipients(quota.workspaceId, recipients);
    if (suppressed.length > 0) throw new Error('suppressed');
  }

  const localPart = session.email.split('@')[0];
  const mailboxName = mailbox.displayName?.trim();
  const profileName = mailbox.profileFullName?.trim();
  const fromName = (mailboxName && mailboxName.toLowerCase() !== localPart.toLowerCase() ? mailboxName : profileName) || mailboxName || localPart;
  const from = { name: fromName, address: session.email };
  const mailOptions: Mail.Options = {
    from,
    to: sanitized.to,
    cc: sanitized.cc.length ? sanitized.cc : undefined,
    bcc: sanitized.bcc.length ? sanitized.bcc : undefined,
    subject: sanitized.subject,
    text: sanitized.text,
    inReplyTo: sanitized.inReplyTo,
    references: sanitized.references,
    attachments: sanitized.attachments,
  };

  const streamOptions: StreamTransport.Options = {
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  };
  const streamTransport = nodemailer.createTransport(streamOptions);
  const compiled = await streamTransport.sendMail(mailOptions);
  const raw = await bufferFrom((compiled as StreamTransport.SentMessageInfo).message);

  const smtp = smtpConfig(mailbox);
  const smtpOptions: SMTPTransport.Options = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTLS,
    auth: { user: session.email, pass: session.password },
    tls: { servername: mailHost(mailbox) },
  };
  const smtpTransport = nodemailer.createTransport(smtpOptions);

  let sent: SMTPTransport.SentMessageInfo;
  try {
    sent = await smtpTransport.sendMail({ envelope: compiled.envelope, raw });
  } finally {
    smtpTransport.close();
  }

  let sentCopyStatus: 'saved' | 'failed' = 'saved';
  await withImap(session, mailbox, async (client) => {
    const folders = await client.list();
    const sentPath = folderPathFor('sent', folders);
    await client.append(sentPath, raw, ['\\Seen'], new Date());
  }).catch(() => {
    sentCopyStatus = 'failed';
  });

  return {
    messageId: sent.messageId || compiled.messageId,
    accepted: sent.accepted.map(String),
    rejected: sent.rejected.map(String),
    response: sent.response,
    sentCopy: { status: sentCopyStatus },
    subject: sanitized.subject,
    recipientCount: sanitized.to.length + sanitized.cc.length + sanitized.bcc.length,
    attachmentCount: sanitized.attachments.length,
    quotaCommit: { status: 'reserved' } satisfies QuotaCommitResult,
  };
}
