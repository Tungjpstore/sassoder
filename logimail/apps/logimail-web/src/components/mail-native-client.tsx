'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Forward, Inbox, ListTodo, Loader2, LockKeyhole, MailOpen, Paperclip, RefreshCcw, Reply, ReplyAll, Save, Search, Send, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { MailFolder, MailFolderKey, MailMessageDetail, MailMessageSummary, MailUiMailbox } from '@/lib/mail-ui-types';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

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

function MessageList({ messages, folder }: Readonly<{ messages: MailMessageSummary[]; folder: MailFolderKey }>) {
  if (!messages.length) return <div className="message-list"><p className="muted-copy">Không có email trong thư mục này.</p></div>;
  return (
    <section className="message-list" aria-label="Danh sách email">
      {messages.map((message) => (
        <Link className={`message-row ${message.unread ? 'unread' : ''}`} href={`/mail/message/${message.id}`} key={message.id}>
          <div>
            <strong>{folder === 'sent' ? message.to || message.from : message.from}</strong>
            <time>{formatDate(message.date)}</time>
          </div>
          <h2>{message.subject}</h2>
          <p>{formatSize(message.size)}</p>
          {message.flagged ? <span className="mail-flag"><Star size={12} aria-hidden="true" /> Đánh dấu</span> : null}
        </Link>
      ))}
    </section>
  );
}

export function MailInboxClient({
  folder,
  mailboxes,
  showFolderPanel = true,
}: Readonly<{ folder: MailFolderKey; mailboxes: MailUiMailbox[]; showFolderPanel?: boolean }>) {
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [messages, setMessages] = useState<MailMessageSummary[]>([]);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
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
      const [folderData, messageData] = await Promise.all([
        apiFetch<{ folders: MailFolder[] }>('/api/logimail/mail/folders'),
        apiFetch<{ messages: MailMessageSummary[] }>(`/api/logimail/mail/messages?folder=${folder}&limit=50`),
      ]);
      setFolders(folderData.folders);
      setMessages(messageData.messages);
      setNeedsUnlock(false);
    } catch (apiError) {
      const errorCode = (apiError as ApiError).code;
      if (errorCode === 'mail_session_required') setNeedsUnlock(true);
      else setError(apiError instanceof Error ? apiError.message : 'Không tải được hộp thư.');
    } finally {
      setLoading(false);
    }
  }, [folder, mailboxes.length]);

  useEffect(() => { void load(); }, [load]);

  const visibleMessages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter((message) => [message.from, message.to, message.subject].some((value) => value.toLowerCase().includes(needle)));
  }, [messages, query]);

  if (!mailboxes.length) return <p className="muted-copy">Chưa có mailbox được cấp quyền.</p>;
  if (needsUnlock) return <MailUnlockPanel mailboxes={mailboxes} selectedEmail={session?.session?.email} onUnlocked={(next) => { setSession(next); setNeedsUnlock(false); void load(); }} />;

  return (
    <div className="mail-native-stack">
      <div className="toolbar mail-toolbar">
        <label className="mail-inline-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm trong thư mục" aria-label="Tìm trong thư mục" />
        </label>
        <button className="icon-text-button" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCcw size={15} aria-hidden="true" />
          {loading ? 'Đang tải' : 'Làm mới'}
        </button>
        {session?.session ? <span className="status-badge success">{session.session.email}</span> : null}
        <span className="status-badge info">{visibleMessages.length}/{messages.length}</span>
        {error ? <span className="status-badge danger">{error}</span> : null}
      </div>
      <div className={`inbox-layout native ${showFolderPanel ? '' : 'mail-list-only'}`.trim()}>
        {showFolderPanel ? <FolderPanel folders={folders} active={folder} /> : null}
        {loading ? <section className="message-list"><p className="muted-copy">Đang tải email...</p></section> : <MessageList messages={visibleMessages} folder={folder} />}
        <aside className="reading-pane empty-reading-pane">
          <MailOpen size={22} aria-hidden="true" />
          <h2>{folderMeta[folder].label}</h2>
          <p>{visibleMessages.length ? `${visibleMessages.length} email` : 'Thư mục trống'}</p>
        </aside>
      </div>
    </div>
  );
}

export function MailMessageClient({ id, mailboxes }: Readonly<{ id: string; mailboxes: MailUiMailbox[] }>) {
  const router = useRouter();
  const [message, setMessage] = useState<MailMessageDetail | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, sessionData] = await Promise.all([
        apiFetch<{ message: MailMessageDetail }>(`/api/logimail/mail/messages/${id}`),
        apiFetch<SessionData>('/api/logimail/mail/session').catch(() => null),
      ]);
      setMessage(data.message);
      setSession(sessionData);
      setNeedsUnlock(false);
    } catch (apiError) {
      const errorCode = (apiError as ApiError).code;
      if (errorCode === 'mail_session_required') {
        const sessionData = await apiFetch<SessionData>('/api/logimail/mail/session').catch(() => null);
        setSession(sessionData);
        setNeedsUnlock(true);
      } else {
        setError(apiError instanceof Error ? apiError.message : 'Không mở được email.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const startReply = useCallback(() => {
    if (!message) return;
    const draft = buildReplyDraft(message, session?.session?.email);
    if (typeof window !== 'undefined') window.sessionStorage.setItem(REPLY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    const params = new URLSearchParams({ reply: '1', to: draft.to ?? '', subject: draft.subject ?? '' });
    if (draft.from) params.set('from', draft.from);
    router.push(`/mail/compose?${params.toString()}`);
  }, [message, router, session?.session?.email]);

  const startReplyAll = useCallback(() => {
    if (!message) return;
    const draft = buildReplyAllDraft(message, session?.session?.email);
    if (typeof window !== 'undefined') window.sessionStorage.setItem(REPLY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    const params = new URLSearchParams({ replyAll: '1', subject: draft.subject ?? '' });
    if (draft.from) params.set('from', draft.from);
    router.push(`/mail/compose?${params.toString()}`);
  }, [message, router, session?.session?.email]);

  const startForward = useCallback(() => {
    if (!message) return;
    const draft = buildForwardDraft(message, session?.session?.email);
    if (typeof window !== 'undefined') window.sessionStorage.setItem(REPLY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    const params = new URLSearchParams({ forward: '1', subject: draft.subject ?? '' });
    if (draft.from) params.set('from', draft.from);
    router.push(`/mail/compose?${params.toString()}`);
  }, [message, router, session?.session?.email]);

  const createTask = useCallback(async () => {
    if (!message || !session?.session?.mailboxId) return;
    setTaskLoading(true);
    setTaskMessage(null);
    setError(null);
    try {
      await apiFetch('/api/logimail/team/tasks', {
        method: 'POST',
        body: JSON.stringify({
          mailboxId: session.session.mailboxId,
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
  }, [message, session?.session?.mailboxId]);

  if (needsUnlock) return <MailUnlockPanel mailboxes={mailboxes} selectedEmail={session?.session?.email} onUnlocked={(next) => { setSession(next); setNeedsUnlock(false); void load(); }} />;

  return (
    <section className="reading-pane full-reading-pane">
      <div className="mail-detail-actions">
        <Link className="button-link secondary" href="/mail/inbox">Hộp thư</Link>
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
          <pre className="mail-body-text">{message.bodyText}</pre>
          {message.attachments.length ? (
            <div className="attachment-list">
              {message.attachments.map((attachment) => <span key={`${attachment.filename}-${attachment.size}`}>{attachment.filename} · {attachment.contentType} {formatSize(attachment.size)}</span>)}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
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
