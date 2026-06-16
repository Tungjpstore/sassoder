'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Forward, Inbox, ListTodo, Loader2, LockKeyhole, MailOpen, Paperclip, RefreshCcw, Reply, ReplyAll, Save, Search, Send, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { MailFolder, MailFolderKey, MailMessageDetail, MailMessageSummary, MailUiMailbox } from '@/lib/mail-ui-types';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

type MailActionKind = 'read' | 'unread' | 'flag' | 'unflag' | 'trash' | 'archive' | 'spam';

type ApiError = Error & { code?: string; status?: number };

type SessionData = {
  unlocked: boolean;
  session: { email: string; mailboxId: string; issuedAt: number; expiresAt: number } | null;
  mailbox?: MailUiMailbox | null;
  mailboxes?: MailUiMailbox[];
};

type ComposeAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentBase64: string;
};

type DraftSaveResponse = {
  draft: {
    id: string;
    updated_at: string;
  };
};

export type MailComposeInitialDraft = {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
};

const REPLY_DRAFT_STORAGE_KEY = 'logimail.replyDraft.v1';
const MAX_COMPOSE_ATTACHMENTS = 10;
const MAX_COMPOSE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const folderMeta: Record<MailFolderKey, { label: string; href: string; icon: typeof Inbox }> = {
  inbox: { label: 'Hộp thư đến', href: '/mail/inbox', icon: Inbox },
  sent: { label: 'Đã gửi', href: '/mail/sent', icon: Send },
  drafts: { label: 'Thư nháp', href: '/mail/drafts', icon: MailOpen },
  spam: { label: 'Thư rác', href: '/mail/spam', icon: ShieldCheck },
  trash: { label: 'Thùng rác', href: '/mail/trash', icon: Trash2 },
  archive: { label: 'Lưu trữ', href: '/mail', icon: Archive },
};

async function authToken() {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn.');
  return data.session.access_token;
}

async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const token = await authToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
      authorization: `Bearer ${token}`,
    },
  });
  const body = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !body.ok) {
    const error = new Error(body.ok ? 'Không gọi được API LogiMail.' : body.error.message) as ApiError;
    error.code = body.ok ? 'api_failed' : body.error.code;
    error.status = response.status;
    throw error;
  }
  return body.data;
}

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatSize(value: number | null) {
  if (!value) return '';
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB`;
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.onerror = () => reject(new Error('Không đọc được tệp.'));
    reader.readAsDataURL(file);
  });
}

function cleanDraftValue(value: unknown, max = 2000) {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return text ? text.slice(0, max) : undefined;
}

function firstEmailAddress(value: string) {
  const bracketMatch = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  if (bracketMatch?.[1]) return bracketMatch[1].trim();
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(value)?.[0] ?? value.trim();
}

function replySubject(subject: string) {
  const cleanSubject = subject.trim() || '(Không có tiêu đề)';
  return /^re\s*:/i.test(cleanSubject) ? cleanSubject : `Re: ${cleanSubject}`;
}

function forwardSubject(subject: string) {
  const cleanSubject = subject.trim() || '(Không có tiêu đề)';
  return /^fwd?\s*:/i.test(cleanSubject) ? cleanSubject : `Fwd: ${cleanSubject}`;
}

function replyDate(value: string | null) {
  if (!value) return 'email trước';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function replyText(message: MailMessageDetail) {
  const source = message.bodyText.trim().slice(0, 16000);
  const quoted = source.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n');
  return `\n\nVào ${replyDate(message.date)}, ${message.from} đã viết:\n\n${quoted}`;
}

function forwardText(message: MailMessageDetail) {
  return `\n\n---------- Forwarded message ---------\nFrom: ${message.from}\nDate: ${replyDate(message.date)}\nSubject: ${message.subject}\nTo: ${message.to || '-'}\n\n${message.bodyText.trim().slice(0, 16000)}`;
}

function uniqueEmailList(values: string[]) {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const value of values) {
    for (const item of value.split(',')) {
      const email = firstEmailAddress(item).toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      emails.push(email);
    }
  }
  return emails.join(', ');
}

function buildReplyDraft(message: MailMessageDetail, from?: string | null): MailComposeInitialDraft {
  return {
    from: from ?? undefined,
    to: firstEmailAddress(message.from),
    subject: replySubject(message.subject),
    text: replyText(message),
    inReplyTo: cleanDraftValue(message.messageId),
    references: cleanDraftValue([message.references, message.messageId].filter(Boolean).join(' '), 4000),
  };
}

function buildReplyAllDraft(message: MailMessageDetail, from?: string | null): MailComposeInitialDraft {
  const reply = buildReplyDraft(message, from);
  return {
    ...reply,
    to: uniqueEmailList([message.from, message.to, message.cc].filter(Boolean)),
  };
}

function buildForwardDraft(message: MailMessageDetail, from?: string | null): MailComposeInitialDraft {
  return {
    from: from ?? undefined,
    subject: forwardSubject(message.subject),
    text: forwardText(message),
    references: cleanDraftValue([message.references, message.messageId].filter(Boolean).join(' '), 4000),
  };
}

function storedReplyDraft() {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(REPLY_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(REPLY_DRAFT_STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      from: cleanDraftValue(parsed.from),
      to: cleanDraftValue(parsed.to),
      subject: cleanDraftValue(parsed.subject),
      text: cleanDraftValue(parsed.text, 200000),
      inReplyTo: cleanDraftValue(parsed.inReplyTo),
      references: cleanDraftValue(parsed.references, 4000),
    } satisfies MailComposeInitialDraft;
  } catch {
    return null;
  }
}

function queryReplyDraft(searchParams: ReturnType<typeof useSearchParams>) {
  const draft = {
    from: cleanDraftValue(searchParams.get('from')),
    to: cleanDraftValue(searchParams.get('to')),
    subject: cleanDraftValue(searchParams.get('subject')),
    text: cleanDraftValue(searchParams.get('body'), 200000),
    inReplyTo: cleanDraftValue(searchParams.get('inReplyTo')),
    references: cleanDraftValue(searchParams.get('references'), 4000),
  } satisfies MailComposeInitialDraft;
  return Object.values(draft).some(Boolean) ? draft : null;
}

function publicMailboxes(mailboxes: MailUiMailbox[]) {
  return mailboxes.map((mailbox) => ({
    id: mailbox.id,
    emailAddress: mailbox.emailAddress,
    displayName: mailbox.displayName,
    permission: mailbox.permission,
    aliases: mailbox.aliases ?? [],
  }));
}

function MailUnlockPanel({
  mailboxes,
  selectedEmail,
  onUnlocked,
}: Readonly<{
  mailboxes: MailUiMailbox[];
  selectedEmail?: string | null;
  onUnlocked: (session: SessionData) => void;
}>) {
  const [email, setEmail] = useState(selectedEmail ?? mailboxes[0]?.emailAddress ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedEmail && selectedEmail !== email) setEmail(selectedEmail);
  }, [email, selectedEmail]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SessionData>('/api/logimail/mail/session', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setPassword('');
      onUnlocked(data);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Không mở khóa được hộp thư.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mail-unlock-panel">
      <div className="mail-unlock-icon"><LockKeyhole size={20} aria-hidden="true" /></div>
      <form className="stack-form" onSubmit={submit}>
        <h2>Mở khóa hộp thư</h2>
        {error ? <p className="form-alert danger">{error}</p> : null}
        <label className="form-field">
          <span>Email</span>
          <select value={email} onChange={(event) => setEmail(event.target.value)} required>
            {mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.emailAddress}>{mailbox.emailAddress}</option>)}
          </select>
        </label>
        <label className="form-field">
          <span>Mật khẩu</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
        </label>
        <button className="button-link button-reset primary" type="submit" disabled={loading || !email || !password}>
          {loading ? <Loader2 size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}
          <span>{loading ? 'Đang mở khóa' : 'Mở hộp thư'}</span>
        </button>
      </form>
    </section>
  );
}

function FolderPanel({ folders, active }: Readonly<{ folders: MailFolder[]; active: MailFolderKey }>) {
  const byKey = new Map(folders.map((folder) => [folder.key, folder]));
  return (
    <aside className="folder-panel">
      {(Object.keys(folderMeta) as MailFolderKey[]).map((key) => {
        const meta = folderMeta[key];
        const Icon = meta.icon;
        const folder = byKey.get(key);
        return (
          <Link className={active === key ? 'active' : ''} href={meta.href} key={key}>
            <Icon size={15} aria-hidden="true" />
            <span>{folder?.label ?? meta.label}</span>
            <strong>{folder?.unseen ?? folder?.total ?? ''}</strong>
          </Link>
        );
      })}
    </aside>
  );
}

function MessageRows({
  messages,
  folder,
  activeId,
  selectedUids,
  onOpen,
  onToggleSelect,
}: Readonly<{
  messages: MailMessageSummary[];
  folder: MailFolderKey;
  activeId: string | null;
  selectedUids: Set<number>;
  onOpen: (message: MailMessageSummary) => void;
  onToggleSelect: (uid: number) => void;
}>) {
  if (!messages.length) return <div className="message-list"><p className="muted-copy">Không có email trong thư mục này.</p></div>;
  return (
    <section className="message-list" aria-label="Danh sách email">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`message-row selectable ${message.unread ? 'unread' : ''} ${activeId === message.id ? 'active' : ''}`.trim()}
        >
          <input
            type="checkbox"
            className="message-select"
            aria-label="Chọn email"
            checked={selectedUids.has(message.uid)}
            onChange={() => onToggleSelect(message.uid)}
          />
          <button type="button" className="message-open button-reset" onClick={() => onOpen(message)}>
            <div className="message-open-line">
              <strong>{folder === 'sent' ? message.to || message.from : message.from}</strong>
              <time>{formatDate(message.date)}</time>
            </div>
            <h2>{message.subject}</h2>
            <div className="message-open-foot">
              <span>{formatSize(message.size)}</span>
              {message.flagged ? <span className="mail-flag"><Star size={12} aria-hidden="true" /> Đánh dấu</span> : null}
            </div>
          </button>
        </div>
      ))}
    </section>
  );
}

function MessageSkeleton() {
  return (
    <section className="message-list" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="message-row skeleton" key={index}>
          <div className="skeleton-line w-60" />
          <div className="skeleton-line w-90" />
          <div className="skeleton-line w-30" />
        </div>
      ))}
    </section>
  );
}

const BULK_ACTIONS: Array<{ key: MailActionKind; label: string; icon: typeof Inbox }> = [
  { key: 'read', label: 'Đã đọc', icon: MailOpen },
  { key: 'unread', label: 'Chưa đọc', icon: Inbox },
  { key: 'flag', label: 'Gắn sao', icon: Star },
  { key: 'archive', label: 'Lưu trữ', icon: Archive },
  { key: 'spam', label: 'Spam', icon: ShieldCheck },
  { key: 'trash', label: 'Xoá', icon: Trash2 },
];

export function MailInboxClient({
  folder,
  mailboxes,
  showFolderPanel = true,
}: Readonly<{ folder: MailFolderKey; mailboxes: MailUiMailbox[]; showFolderPanel?: boolean }>) {
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [messages, setMessages] = useState<MailMessageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const pageSize = 50;

  const load = useCallback(async (nextPage: number, query: string) => {
    if (!mailboxes.length) return;
    setLoading(true);
    setError(null);
    try {
      const sessionData = await apiFetch<SessionData>('/api/logimail/mail/session');
      setSession(sessionData);
      if (!sessionData.unlocked) {
        setNeedsUnlock(true);
        return;
      }
      const params = new URLSearchParams({ folder, limit: String(pageSize), page: String(nextPage) });
      if (query) params.set('q', query);
      const [folderData, messageData] = await Promise.all([
        apiFetch<{ folders: MailFolder[] }>('/api/logimail/mail/folders'),
        apiFetch<{ messages: MailMessageSummary[]; total: number; hasMore: boolean }>(`/api/logimail/mail/messages?${params.toString()}`),
      ]);
      setFolders(folderData.folders);
      setMessages(messageData.messages);
      setTotal(messageData.total ?? messageData.messages.length);
      setHasMore(Boolean(messageData.hasMore));
      setPage(nextPage);
      setNeedsUnlock(false);
    } catch (apiError) {
      const errorCode = (apiError as ApiError).code;
      if (errorCode === 'mail_session_required') setNeedsUnlock(true);
      else setError(apiError instanceof Error ? apiError.message : 'Không tải được hộp thư.');
    } finally {
      setLoading(false);
    }
  }, [folder, mailboxes.length]);

  useEffect(() => { void load(0, ''); }, [load]);

  // Debounced server-side search.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = queryInput.trim();
      if (trimmed !== activeQuery) {
        setActiveQuery(trimmed);
        setSelected(new Set());
        void load(0, trimmed);
      }
    }, 450);
    return () => window.clearTimeout(handle);
  }, [queryInput, activeQuery, load]);

  const toggleSelect = useCallback((uid: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const allSelected = messages.length > 0 && selected.size === messages.length;
  const toggleSelectAll = useCallback(() => {
    setSelected((current) => (current.size === messages.length ? new Set() : new Set(messages.map((message) => message.uid))));
  }, [messages]);

  const runBulk = useCallback(async (action: MailActionKind) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await apiFetch('/api/logimail/mail/messages/actions', {
        method: 'POST',
        body: JSON.stringify({ folder, action, uids: Array.from(selected) }),
      });
      const clearedActive = activeId ? messages.find((m) => m.id === activeId && selected.has(m.uid)) : null;
      setSelected(new Set());
      if (clearedActive) setActiveId(null);
      await load(page, activeQuery);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Không thực hiện được thao tác.');
    } finally {
      setBulkBusy(false);
    }
  }, [activeId, activeQuery, folder, load, messages, page, selected]);

  if (!mailboxes.length) return <p className="muted-copy">Chưa có mailbox được cấp quyền.</p>;
  if (needsUnlock) return <MailUnlockPanel mailboxes={mailboxes} selectedEmail={session?.session?.email} onUnlocked={() => { setNeedsUnlock(false); void load(0, activeQuery); }} />;

  return (
    <div className="mail-native-stack">
      <div className="toolbar mail-toolbar">
        <label className="mail-inline-search">
          <Search size={15} aria-hidden="true" />
          <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Tìm theo người gửi / tiêu đề (toàn hộp thư)" aria-label="Tìm trong hộp thư" />
        </label>
        <button className="icon-text-button" type="button" onClick={() => void load(page, activeQuery)} disabled={loading}>
          <RefreshCcw size={15} aria-hidden="true" />
          {loading ? 'Đang tải' : 'Làm mới'}
        </button>
        {session?.session ? <span className="status-badge success">{session.session.email}</span> : null}
        <span className="status-badge info">{messages.length}/{total}{activeQuery ? ' (tìm)' : ''}</span>
        {error ? <span className="status-badge danger">{error}</span> : null}
      </div>

      {selected.size > 0 ? (
        <div className="mail-bulk-bar" role="toolbar" aria-label="Thao tác hàng loạt">
          <span>{selected.size} đã chọn</span>
          {BULK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.key} type="button" className={`icon-text-button ${action.key === 'trash' ? 'danger' : ''}`.trim()} disabled={bulkBusy} onClick={() => void runBulk(action.key)}>
                <Icon size={14} aria-hidden="true" />{action.label}
              </button>
            );
          })}
          <button type="button" className="icon-text-button" onClick={() => setSelected(new Set())}><X size={14} aria-hidden="true" />Bỏ chọn</button>
        </div>
      ) : null}

      <div className={`inbox-layout native ${showFolderPanel ? '' : 'mail-list-only'} ${activeId ? 'has-active' : ''}`.trim()}>
        {showFolderPanel ? <FolderPanel folders={folders} active={folder} /> : null}
        <div className="message-column">
          {messages.length > 0 ? (
            <div className="message-list-head">
              <label className="message-select-all">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Chọn tất cả" />
                <span>Chọn tất cả</span>
              </label>
              <div className="message-pager">
                <button type="button" className="icon-text-button" disabled={page === 0 || loading} onClick={() => void load(page - 1, activeQuery)}>Trước</button>
                <span>Trang {page + 1}</span>
                <button type="button" className="icon-text-button" disabled={!hasMore || loading} onClick={() => void load(page + 1, activeQuery)}>Sau</button>
              </div>
            </div>
          ) : null}
          {loading ? <MessageSkeleton /> : <MessageRows messages={messages} folder={folder} activeId={activeId} selectedUids={selected} onOpen={(message) => setActiveId(message.id)} onToggleSelect={toggleSelect} />}
        </div>
        {activeId ? (
          <MailReadingPane
            messageId={activeId}
            sessionEmail={session?.session?.email ?? null}
            sessionMailboxId={session?.session?.mailboxId ?? null}
            onClose={() => setActiveId(null)}
            onNeedUnlock={() => setNeedsUnlock(true)}
            onChanged={() => void load(page, activeQuery)}
          />
        ) : (
          <aside className="reading-pane empty-reading-pane">
            <MailOpen size={22} aria-hidden="true" />
            <h2>{folderMeta[folder].label}</h2>
            <p>{messages.length ? 'Chọn một email để đọc' : 'Thư mục trống'}</p>
          </aside>
        )}
      </div>
    </div>
  );
}

function MailHtmlBody({ html, fallbackText }: Readonly<{ html: string; fallbackText: string }>) {
  const [showImages, setShowImages] = useState(false);
  const [showPlain, setShowPlain] = useState(false);

  const srcDoc = useMemo(() => {
    const imgSrc = showImages ? 'img-src data: https:;' : "img-src data:;";
    const csp = `default-src 'none'; style-src 'unsafe-inline'; ${imgSrc} font-src data: https:; media-src data:;`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html,body{margin:0;padding:12px;font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#2B2B2B;word-break:break-word;}img{max-width:100%;height:auto;}a{color:#0F4D3A;}table{max-width:100%;}</style></head><body>${html}</body></html>`;
  }, [html, showImages]);

  if (showPlain) {
    return (
      <div className="mail-html-wrap">
        <div className="mail-html-toolbar">
          <button type="button" className="icon-text-button" onClick={() => setShowPlain(false)}>Xem bản HTML</button>
        </div>
        <pre className="mail-body-text">{fallbackText}</pre>
      </div>
    );
  }

  return (
    <div className="mail-html-wrap">
      <div className="mail-html-toolbar">
        {!showImages ? (
          <button type="button" className="icon-text-button" onClick={() => setShowImages(true)}>Hiển thị ảnh từ xa</button>
        ) : (
          <span className="status-badge info">Đang tải ảnh từ xa</span>
        )}
        <button type="button" className="icon-text-button" onClick={() => setShowPlain(true)}>Xem bản chữ</button>
      </div>
      <iframe
        className="mail-html-frame"
        title="Nội dung email"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
      />
    </div>
  );
}

function MailReadingPane({
  messageId,
  sessionEmail,
  sessionMailboxId,
  onClose,
  onNeedUnlock,
  onChanged,
}: Readonly<{
  messageId: string;
  sessionEmail: string | null;
  sessionMailboxId: string | null;
  onClose?: () => void;
  onNeedUnlock?: () => void;
  onChanged?: () => void;
}>) {
  const router = useRouter();
  const [message, setMessage] = useState<MailMessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTaskMessage(null);
    try {
      const data = await apiFetch<{ message: MailMessageDetail }>(`/api/logimail/mail/messages/${messageId}`);
      setMessage(data.message);
      onChanged?.();
    } catch (apiError) {
      const errorCode = (apiError as ApiError).code;
      if (errorCode === 'mail_session_required') onNeedUnlock?.();
      else setError(apiError instanceof Error ? apiError.message : 'Không mở được email.');
    } finally {
      setLoading(false);
    }
    // onChanged/onNeedUnlock intentionally excluded to avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  useEffect(() => { void load(); }, [load]);

  const downloadAttachment = useCallback(async (index: number, filename: string) => {
    setDownloadingIndex(index);
    setError(null);
    try {
      const token = await authToken();
      const response = await fetch(`/api/logimail/mail/messages/${messageId}/attachments/${index}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'Không tải được tệp đính kèm.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename || 'attachment';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Không tải được tệp đính kèm.');
    } finally {
      setDownloadingIndex(null);
    }
  }, [messageId]);

  const navigateCompose = useCallback((draft: MailComposeInitialDraft, marker: Record<string, string>) => {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(REPLY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    const params = new URLSearchParams({ ...marker, subject: draft.subject ?? '' });
    if (draft.to) params.set('to', draft.to);
    if (draft.from) params.set('from', draft.from);
    router.push(`/mail/compose?${params.toString()}`);
  }, [router]);

  const startReply = useCallback(() => { if (message) navigateCompose(buildReplyDraft(message, sessionEmail), { reply: '1' }); }, [message, navigateCompose, sessionEmail]);
  const startReplyAll = useCallback(() => { if (message) navigateCompose(buildReplyAllDraft(message, sessionEmail), { replyAll: '1' }); }, [message, navigateCompose, sessionEmail]);
  const startForward = useCallback(() => { if (message) navigateCompose(buildForwardDraft(message, sessionEmail), { forward: '1' }); }, [message, navigateCompose, sessionEmail]);

  const createTask = useCallback(async () => {
    if (!message || !sessionMailboxId) return;
    setTaskLoading(true);
    setTaskMessage(null);
    setError(null);
    try {
      await apiFetch('/api/logimail/team/tasks', {
        method: 'POST',
        body: JSON.stringify({
          mailboxId: sessionMailboxId,
          messageUid: message.uid,
          subject: message.subject,
          customerEmail: firstEmailAddress(message.from).toLowerCase(),
          priority: message.unread ? 'high' : 'normal',
          internalNote: 'Tạo từ hộp thư LogiMail.',
        }),
      });
      setTaskMessage('Đã tạo task cho email này.');
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Không tạo được task.');
    } finally {
      setTaskLoading(false);
    }
  }, [message, sessionMailboxId]);

  return (
    <section className="reading-pane full-reading-pane">
      <div className="mail-detail-actions">
        {onClose ? (
          <button className="button-link secondary button-reset" type="button" onClick={onClose}>Đóng</button>
        ) : (
          <Link className="button-link secondary" href="/mail/inbox">Hộp thư</Link>
        )}
        <div className="mail-detail-action-group">
          <button className="button-link button-reset primary" type="button" onClick={startReply} disabled={!message || loading}>
            <Reply size={15} aria-hidden="true" />
            <span>Trả lời</span>
          </button>
          <button className="icon-text-button" type="button" onClick={startReplyAll} disabled={!message || loading}>
            <ReplyAll size={15} aria-hidden="true" />Trả lời tất cả
          </button>
          <button className="icon-text-button" type="button" onClick={startForward} disabled={!message || loading}>
            <Forward size={15} aria-hidden="true" />Chuyển tiếp
          </button>
          <button className="icon-text-button" type="button" onClick={() => void createTask()} disabled={!message || loading || taskLoading}>
            {taskLoading ? <Loader2 size={15} aria-hidden="true" /> : <ListTodo size={15} aria-hidden="true" />}
            Task
          </button>
          <button className="icon-text-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCcw size={15} aria-hidden="true" />Làm mới</button>
        </div>
      </div>
      {loading ? <p className="muted-copy">Đang tải email...</p> : null}
      {error ? <p className="form-alert danger">{error}</p> : null}
      {taskMessage ? <p className="form-alert success">{taskMessage}</p> : null}
      {message ? (
        <>
          <header>
            <h2>{message.subject}</h2>
            <p>Từ: {message.from}</p>
            <p>Đến: {message.to || '-'}</p>
            {message.cc ? <p>CC: {message.cc}</p> : null}
            <span>{formatDate(message.date)} {message.size ? `· ${formatSize(message.size)}` : ''}</span>
          </header>
          {message.bodyHtml ? <MailHtmlBody html={message.bodyHtml} fallbackText={message.bodyText} /> : <pre className="mail-body-text">{message.bodyText}</pre>}
          {message.attachments.length ? (
            <div className="attachment-list">
              {message.attachments.map((attachment) => (
                <button
                  key={`${attachment.index}-${attachment.filename}`}
                  type="button"
                  className="attachment-chip"
                  onClick={() => void downloadAttachment(attachment.index, attachment.filename)}
                  disabled={downloadingIndex === attachment.index}
                >
                  {downloadingIndex === attachment.index ? <Loader2 size={13} aria-hidden="true" /> : <Paperclip size={13} aria-hidden="true" />}
                  <span>{attachment.filename}</span>
                  <small>{attachment.contentType} {formatSize(attachment.size)}</small>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function MailMessageClient({ id, mailboxes }: Readonly<{ id: string; mailboxes: MailUiMailbox[] }>) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  const loadSession = useCallback(async () => {
    const data = await apiFetch<SessionData>('/api/logimail/mail/session').catch(() => null);
    setSession(data);
    setNeedsUnlock(!data?.unlocked);
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);

  if (needsUnlock) {
    return <MailUnlockPanel mailboxes={mailboxes} selectedEmail={session?.session?.email} onUnlocked={() => { setNeedsUnlock(false); void loadSession(); }} />;
  }

  return (
    <MailReadingPane
      messageId={id}
      sessionEmail={session?.session?.email ?? null}
      sessionMailboxId={session?.session?.mailboxId ?? null}
      onNeedUnlock={() => setNeedsUnlock(true)}
      onClose={() => router.push('/mail/inbox')}
    />
  );
}

export function MailComposeClient({ mailboxes }: Readonly<{ mailboxes: MailUiMailbox[] }>) {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const replyDraftRequestRef = useRef<string | null>(null);
  const lastDraftPayloadRef = useRef<string>('');
  const sendableMailboxes = useMemo(() => publicMailboxes(mailboxes).filter((mailbox) => mailbox.permission === 'send' || mailbox.permission === 'admin'), [mailboxes]);
  const [from, setFrom] = useState(sendableMailboxes[0]?.emailAddress ?? '');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyReloadToken, setReplyReloadToken] = useState(0);
  const [replyMeta, setReplyMeta] = useState<Pick<MailComposeInitialDraft, 'inReplyTo' | 'references'> | null>(null);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);

  useEffect(() => {
    function applyDraft(draft: MailComposeInitialDraft) {
      if (draft.from && sendableMailboxes.some((mailbox) => mailbox.emailAddress === draft.from)) setFrom(draft.from);
      if (draft.to) setTo(draft.to);
      if (draft.subject) setSubject(draft.subject);
      if (draft.text) setText(draft.text);
      setReplyMeta({ inReplyTo: draft.inReplyTo, references: draft.references });
    }

    const storedDraft = storedReplyDraft();
    if (storedDraft) {
      applyDraft(storedDraft);
      return;
    }

    const urlDraft = queryReplyDraft(searchParams);
    if (urlDraft) applyDraft(urlDraft);

    const replyMessageId = cleanDraftValue(searchParams.get('replyMessageId'), 400);
    if (!replyMessageId) return;

    const requestKey = `${searchKey}:${replyReloadToken}:${replyMessageId}`;
    if (replyDraftRequestRef.current === requestKey) return;
    replyDraftRequestRef.current = requestKey;

    let cancelled = false;
    setReplyLoading(true);
    setError(null);
    void apiFetch<{ message: MailMessageDetail }>(`/api/logimail/mail/messages/${encodeURIComponent(replyMessageId)}`)
      .then((data) => {
        if (cancelled) return;
        applyDraft(buildReplyDraft(data.message, sendableMailboxes[0]?.emailAddress));
      })
      .catch((apiError) => {
        if (cancelled) return;
        const errorCode = (apiError as ApiError).code;
        if (errorCode === 'mail_session_required') {
          setNeedsUnlock(true);
          setError('Mở khóa hộp thư để LogiMail nạp nội dung trả lời từ email gốc.');
          return;
        }
        setError(apiError instanceof Error ? apiError.message : 'Không nạp được email gốc để trả lời.');
      })
      .finally(() => {
        if (!cancelled) setReplyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [replyReloadToken, searchKey, searchParams, sendableMailboxes]);

  const attachmentBytes = useMemo(() => attachments.reduce((total, attachment) => total + attachment.size, 0), [attachments]);

  useEffect(() => {
    const hasDraftContent = Boolean(to.trim() || cc.trim() || bcc.trim() || subject.trim() || text.trim() || attachments.length || replyMeta?.inReplyTo);
    if (!from || !hasDraftContent) return;

    const payload = {
      draftId,
      from,
      to,
      cc,
      bcc,
      subject,
      text,
      inReplyTo: replyMeta?.inReplyTo,
      references: replyMeta?.references,
      attachmentCount: attachments.length,
    };
    const fingerprint = JSON.stringify(payload);
    if (fingerprint === lastDraftPayloadRef.current) return;

    const timeout = window.setTimeout(() => {
      lastDraftPayloadRef.current = fingerprint;
      setDraftSaving(true);
      void apiFetch<DraftSaveResponse>('/api/logimail/mail/drafts', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
        .then((result) => {
          setDraftId(result.draft.id);
          setDraftSavedAt(result.draft.updated_at);
        })
        .catch(() => undefined)
        .finally(() => setDraftSaving(false));
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [attachments.length, bcc, cc, draftId, from, replyMeta?.inReplyTo, replyMeta?.references, subject, text, to]);

  async function attachFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const nextFiles = Array.from(files);
    if (attachments.length + nextFiles.length > MAX_COMPOSE_ATTACHMENTS) {
      setError('Chỉ gửi tối đa 10 tệp trong một email.');
      return;
    }
    const nextBytes = nextFiles.reduce((total, file) => total + file.size, attachmentBytes);
    if (nextBytes > MAX_COMPOSE_ATTACHMENT_BYTES) {
      setError('Tổng dung lượng tệp vượt quá 10MB.');
      return;
    }
    try {
      const encoded = await Promise.all(nextFiles.map(async (file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        contentBase64: await fileToBase64(file),
      })));
      setAttachments((current) => [...current, ...encoded]);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Không đọc được tệp.');
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function sendMail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const currentSession = await apiFetch<SessionData>('/api/logimail/mail/session');
      if (!currentSession.unlocked || currentSession.session?.email !== from) {
        setNeedsUnlock(true);
        return;
      }
      await apiFetch('/api/logimail/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          to,
          cc,
          bcc,
          subject,
          text,
          inReplyTo: replyMeta?.inReplyTo,
          references: replyMeta?.references,
          attachments: attachments.map(({ filename, contentType, contentBase64 }) => ({ filename, contentType, contentBase64 })),
        }),
      });
      if (draftId) await apiFetch(`/api/logimail/mail/drafts/${draftId}`, { method: 'DELETE' }).catch(() => undefined);
      setMessage('Đã gửi email.');
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      setText('');
      setReplyMeta(null);
      setAttachments([]);
      setDraftId(null);
      setDraftSavedAt(null);
      lastDraftPayloadRef.current = '';
    } catch (apiError) {
      const errorCode = (apiError as ApiError).code;
      if (errorCode === 'mail_session_required') setNeedsUnlock(true);
      else setError(apiError instanceof Error ? apiError.message : 'Không gửi được email.');
    } finally {
      setLoading(false);
    }
  }

  if (!sendableMailboxes.length) return <p className="muted-copy">Chưa có mailbox có quyền gửi.</p>;

  return (
    <section className="compose-native-layout">
      <form className="compose-form" onSubmit={sendMail}>
        {message ? <p className="form-alert success">{message}</p> : null}
        {replyLoading ? <p className="form-alert info">Đang nạp nội dung trả lời...</p> : null}
        {error ? <p className="form-alert danger">{error}</p> : null}
        <div className="compose-status-line">
          <span>{draftSaving ? <Loader2 size={13} aria-hidden="true" /> : <Save size={13} aria-hidden="true" />}{draftSaving ? 'Đang lưu nháp' : draftSavedAt ? `Đã lưu ${formatDate(draftSavedAt)}` : 'Tự lưu nháp'}</span>
        </div>
        <label className="form-field"><span>Từ</span><select value={from} onChange={(event) => { setFrom(event.target.value); setNeedsUnlock(false); }}>{sendableMailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.emailAddress}>{mailbox.emailAddress}</option>)}</select></label>
        {needsUnlock ? <MailUnlockPanel mailboxes={sendableMailboxes} selectedEmail={from} onUnlocked={() => { setNeedsUnlock(false); setReplyReloadToken((value) => value + 1); }} /> : null}
        <label className="form-field"><span>Đến</span><input value={to} onChange={(event) => setTo(event.target.value)} type="email" multiple required /></label>
        <div className="form-two"><label className="form-field"><span>CC</span><input value={cc} onChange={(event) => setCc(event.target.value)} type="text" /></label><label className="form-field"><span>BCC</span><input value={bcc} onChange={(event) => setBcc(event.target.value)} type="text" /></label></div>
        <label className="form-field"><span>Tiêu đề</span><input value={subject} onChange={(event) => setSubject(event.target.value)} type="text" maxLength={180} /></label>
        <label className="form-field"><span>Nội dung</span><textarea value={text} onChange={(event) => setText(event.target.value)} rows={14} required /></label>
        <div className="compose-attachments">
          <label className="icon-text-button attach-button">
            <Paperclip size={15} aria-hidden="true" />
            <span>Đính kèm</span>
            <input type="file" multiple onChange={(event) => { void attachFiles(event.target.files); event.currentTarget.value = ''; }} />
          </label>
          <span>{attachments.length ? `${attachments.length} tệp · ${formatSize(attachmentBytes)}` : 'Tối đa 10MB'}</span>
        </div>
        {attachments.length ? (
          <div className="attachment-list compose-attachment-list" aria-label="Tệp đính kèm">
            {attachments.map((attachment) => (
              <span key={attachment.id}>
                {attachment.filename} · {formatSize(attachment.size)}
                <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`Gỡ ${attachment.filename}`}><X size={12} aria-hidden="true" /></button>
              </span>
            ))}
          </div>
        ) : null}
        <button className="button-link button-reset primary" type="submit" disabled={loading || !to || !text}>{loading ? <Loader2 size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}<span>{loading ? 'Đang gửi' : 'Gửi email'}</span></button>
      </form>
    </section>
  );
}
