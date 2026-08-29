'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Archive, Check, ChevronLeft, ChevronRight, Forward, Inbox, ListFilter, ListTodo, Loader2, LockKeyhole, LogIn, MailOpen, Paperclip, RefreshCcw, Reply, ReplyAll, RotateCcw, Save, Search, Send, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import type { AuthChangeEvent, Session as SupabaseSession } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  COMPOSE_DRAFT_CACHE_VERSION,
  clearComposeDraftCache,
  readComposeDraftCache,
  writeComposeDraftCache,
  type ComposeDraftCache,
} from '@/lib/compose-draft-cache';
import type { MailFolder, MailFolderKey, MailMessageDetail, MailMessageSummary, MailUiMailbox } from '@/lib/mail-ui-types';
import styles from './mail-native-client.module.css';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

type MailActionKind = 'read' | 'unread' | 'flag' | 'unflag' | 'trash' | 'archive' | 'spam' | 'restore' | 'delete_permanently';
type MailListFilter = 'all' | 'unread' | 'starred';

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
  contentBase64: string | null;
};

type DraftSaveResponse = {
  draft: {
    id: string;
    updated_at: string;
  };
};

type SendMailResponse = {
  sent: boolean;
  draftCleanup?: { status: 'sent' | 'retained' | 'not_requested' | 'failed' };
  result?: {
    accepted?: string[];
    rejected?: string[];
    sentCopy?: { status: 'saved' | 'failed' };
  };
};

export type MailComposeInitialDraft = {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
};

const REPLY_DRAFT_STORAGE_KEY = 'logimail.replyDraft.v1';
const MAX_COMPOSE_ATTACHMENTS = 10;
const MAX_COMPOSE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const FILTER_OPTIONS: Array<{ key: MailListFilter; label: string }> = [
  { key: 'all', label: 'Tất cả thư' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'starred', label: 'Đã gắn sao' },
];

const folderMeta: Record<MailFolderKey, { label: string; href: string; icon: typeof Inbox }> = {
  inbox: { label: 'Hộp thư đến', href: '/mail/inbox', icon: Inbox },
  sent: { label: 'Đã gửi', href: '/mail/sent', icon: Send },
  drafts: { label: 'Thư nháp', href: '/mail/drafts', icon: MailOpen },
  spam: { label: 'Thư rác', href: '/mail/spam', icon: ShieldCheck },
  trash: { label: 'Thùng rác', href: '/mail/trash', icon: Trash2 },
  archive: { label: 'Lưu trữ', href: '/mail/archive', icon: Archive },
};

async function authToken() {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) {
    const authError = new Error('Phiên đăng nhập LogiMail đã hết hạn.') as ApiError;
    authError.code = 'auth_session_expired';
    authError.status = 401;
    throw authError;
  }
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
    error.code = !body.ok && (body.error.code === 'unauthorized' || response.status === 401)
      ? 'auth_session_expired'
      : body.ok ? 'api_failed' : body.error.code;
    error.status = response.status;
    throw error;
  }
  return body.data;
}

function mailAccessErrorCode(error: unknown) {
  return (error as ApiError | null)?.code ?? null;
}

function AuthSessionExpiredPanel({ nextPath }: Readonly<{ nextPath: string }>) {
  return (
    <section className="mail-unlock-panel" role="alert">
      <div className="mail-unlock-icon"><LogIn size={20} aria-hidden="true" /></div>
      <div className="stack-form">
        <h2>Phiên đăng nhập đã hết hạn</h2>
        <p className="muted-copy">Đăng nhập lại để tiếp tục. LogiMail không nhầm trạng thái này với việc mailbox cần mở khóa.</p>
        <Link className="button-link primary" href={`/auth/login?next=${encodeURIComponent(nextPath)}`}>
          <LogIn size={16} aria-hidden="true" />
          <span>Đăng nhập lại</span>
        </Link>
      </div>
    </section>
  );
}

function PermanentDeleteDialog({
  count,
  loading,
  onCancel,
  onConfirm,
}: Readonly<{
  count: number;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const [confirmation, setConfirmation] = useState('');
  const confirmed = confirmation.trim() === 'XOA VINH VIEN';

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onCancel(); }}>
      <section className="danger-modal" role="dialog" aria-modal="true" aria-labelledby="permanent-delete-title">
        <div className="modal-header">
          <span className="modal-icon"><AlertTriangle size={20} aria-hidden="true" /></span>
          <div>
            <h2 id="permanent-delete-title">Xóa vĩnh viễn {count} email?</h2>
            <p>Thao tác này xóa email khỏi máy chủ IMAP và không thể hoàn tác.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Đóng" onClick={onCancel} disabled={loading}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="modal-body">
          <p>Email phải nằm trong Thùng rác. Hãy kiểm tra lại trước khi xác nhận.</p>
        </div>
        <label className="form-field modal-confirm-field">
          <span>Nhập <strong>XOA VINH VIEN</strong> để tiếp tục</span>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoFocus autoComplete="off" />
        </label>
        <div className="modal-actions">
          <button className="button-link button-reset secondary" type="button" onClick={onCancel} disabled={loading}>Hủy</button>
          <button className="button-link button-reset danger" type="button" disabled={!confirmed || loading} onClick={onConfirm}>
            {loading ? <Loader2 size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
            <span>{loading ? 'Đang xóa' : 'Xóa vĩnh viễn'}</span>
          </button>
        </div>
      </section>
    </div>
  );
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
      cc: cleanDraftValue(parsed.cc),
      bcc: cleanDraftValue(parsed.bcc),
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
    cc: cleanDraftValue(searchParams.get('cc')),
    bcc: cleanDraftValue(searchParams.get('bcc')),
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
  onAuthExpired,
}: Readonly<{
  mailboxes: MailUiMailbox[];
  selectedEmail?: string | null;
  onUnlocked: (session: SessionData) => void;
  onAuthExpired?: () => void;
}>) {
  const [email, setEmail] = useState(selectedEmail ?? mailboxes[0]?.emailAddress ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (mailAccessErrorCode(apiError) === 'auth_session_expired') onAuthExpired?.();
      else setError(apiError instanceof Error ? apiError.message : 'Không mở khóa được hộp thư.');
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
  busyUids,
  onOpen,
  onToggleSelect,
  onAction,
  canModify,
}: Readonly<{
  messages: MailMessageSummary[];
  folder: MailFolderKey;
  activeId: string | null;
  selectedUids: Set<number>;
  busyUids: Set<number>;
  onOpen: (message: MailMessageSummary) => void;
  onToggleSelect: (uid: number) => void;
  onAction: (message: MailMessageSummary, action: MailActionKind) => void;
  canModify: boolean;
}>) {
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
          <button
            type="button"
            className={`mail-row-action ${message.flagged ? 'active' : ''}`.trim()}
            aria-label={message.flagged ? 'Bỏ gắn sao' : 'Gắn sao'}
            title={message.flagged ? 'Bỏ gắn sao' : 'Gắn sao'}
            disabled={!canModify || busyUids.has(message.uid)}
            onClick={() => onAction(message, message.flagged ? 'unflag' : 'flag')}
          >
            {busyUids.has(message.uid) ? <Loader2 size={14} aria-hidden="true" /> : <Star size={14} aria-hidden="true" fill={message.flagged ? 'currentColor' : 'none'} />}
          </button>
          <button type="button" className="message-open button-reset" onClick={() => onOpen(message)}>
            <div className="message-open-line">
              <strong>{folder === 'sent' ? message.to || message.from : message.from}</strong>
              <time>{formatDate(message.date)}</time>
            </div>
            <h2>{message.subject}</h2>
            <div className="message-open-foot">
              <span>{formatSize(message.size)}</span>
              {message.unread ? <span className="mail-unread-indicator">Chưa đọc</span> : <span>Đã đọc</span>}
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

const BULK_STATE_ACTIONS: Array<{ key: MailActionKind; label: string; icon: typeof Inbox }> = [
  { key: 'read', label: 'Đã đọc', icon: MailOpen },
  { key: 'unread', label: 'Chưa đọc', icon: Inbox },
  { key: 'flag', label: 'Gắn sao', icon: Star },
];

function bulkActionsForFolder(folder: MailFolderKey) {
  if (folder === 'trash') {
    return [
      ...BULK_STATE_ACTIONS,
      { key: 'restore' as const, label: 'Khôi phục', icon: RotateCcw },
      { key: 'delete_permanently' as const, label: 'Xóa vĩnh viễn', icon: Trash2 },
    ];
  }
  if (folder === 'spam' || folder === 'archive') {
    return [
      ...BULK_STATE_ACTIONS,
      { key: 'restore' as const, label: 'Khôi phục', icon: RotateCcw },
      { key: 'trash' as const, label: 'Thùng rác', icon: Trash2 },
    ];
  }
  return [
    ...BULK_STATE_ACTIONS,
    { key: 'archive' as const, label: 'Lưu trữ', icon: Archive },
    { key: 'spam' as const, label: 'Spam', icon: ShieldCheck },
    { key: 'trash' as const, label: 'Thùng rác', icon: Trash2 },
  ];
}

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
  const [availableMailboxes, setAvailableMailboxes] = useState(mailboxes);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<MailListFilter>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyUids, setBusyUids] = useState<Set<number>>(new Set());
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<{ uids: number[]; closeActive: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);

  const pageSize = 50;
  const canModifyMailbox = session?.mailbox?.permission === 'send' || session?.mailbox?.permission === 'admin';
  const bulkActions = useMemo(() => canModifyMailbox ? bulkActionsForFolder(folder) : [], [canModifyMailbox, folder]);

  const load = useCallback(async (nextPage: number, query: string, filter: MailListFilter) => {
    if (!mailboxes.length) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    setAuthExpired(false);
    try {
      const sessionData = await apiFetch<SessionData>('/api/logimail/mail/session');
      if (requestId !== loadRequestRef.current) return;
      setSession(sessionData);
      setAvailableMailboxes(sessionData.mailboxes ?? mailboxes);
      if (!sessionData.unlocked) {
        setNeedsUnlock(true);
        return;
      }
      const params = new URLSearchParams({ folder, limit: String(pageSize), page: String(nextPage) });
      if (query) params.set('q', query);
      if (filter !== 'all') params.set('filter', filter);
      const [folderData, messageData] = await Promise.all([
        apiFetch<{ folders: MailFolder[] }>('/api/logimail/mail/folders'),
        apiFetch<{ messages: MailMessageSummary[]; total: number; hasMore: boolean }>(`/api/logimail/mail/messages?${params.toString()}`),
      ]);
      if (requestId !== loadRequestRef.current) return;
      setFolders(folderData.folders);
      setMessages(messageData.messages);
      setSelected((current) => {
        const visible = new Set(messageData.messages.map((message) => message.uid));
        return new Set(Array.from(current).filter((uid) => visible.has(uid)));
      });
      setTotal(messageData.total ?? messageData.messages.length);
      setHasMore(Boolean(messageData.hasMore));
      setPage(nextPage);
      setNeedsUnlock(false);
    } catch (apiError) {
      if (requestId !== loadRequestRef.current) return;
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'mail_session_required') setNeedsUnlock(true);
      else if (errorCode === 'auth_session_expired') setAuthExpired(true);
      else setError(apiError instanceof Error ? apiError.message : 'Không tải được hộp thư.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [folder, mailboxes]);

  // Route changes intentionally synchronize this view with the remote mailbox.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(0, '', 'all'); }, [load]);

  // Debounced server-side search.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = queryInput.trim();
      if (trimmed !== activeQuery) {
        setActiveQuery(trimmed);
        setSelected(new Set());
        void load(0, trimmed, activeFilter);
      }
    }, 450);
    return () => window.clearTimeout(handle);
  }, [queryInput, activeFilter, activeQuery, load]);

  const chooseFilter = useCallback((filter: MailListFilter) => {
    setActiveFilter(filter);
    setSelected(new Set());
    setActiveId(null);
    void load(0, activeQuery, filter);
  }, [activeQuery, load]);

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
    if (!canModifyMailbox || selected.size === 0) return;
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
      await load(page, activeQuery, activeFilter);
    } catch (apiError) {
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'mail_session_required') setNeedsUnlock(true);
      else if (errorCode === 'auth_session_expired') setAuthExpired(true);
      else setError(apiError instanceof Error ? apiError.message : 'Không thực hiện được thao tác.');
    } finally {
      setBulkBusy(false);
    }
  }, [activeFilter, activeId, activeQuery, canModifyMailbox, folder, load, messages, page, selected]);

  const runMessageAction = useCallback(async (message: MailMessageSummary, action: MailActionKind) => {
    if (!canModifyMailbox) return;
    setBusyUids((current) => new Set(current).add(message.uid));
    setError(null);
    try {
      await apiFetch('/api/logimail/mail/messages/actions', {
        method: 'POST',
        body: JSON.stringify({ folder, action, uids: [message.uid] }),
      });
      if (action === 'archive' || action === 'spam' || action === 'trash') setActiveId(null);
      await load(page, activeQuery, activeFilter);
    } catch (apiError) {
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'mail_session_required') setNeedsUnlock(true);
      else if (errorCode === 'auth_session_expired') setAuthExpired(true);
      else setError(apiError instanceof Error ? apiError.message : 'Không thực hiện được thao tác.');
    } finally {
      setBusyUids((current) => {
        const next = new Set(current);
        next.delete(message.uid);
        return next;
      });
    }
  }, [activeFilter, activeQuery, canModifyMailbox, folder, load, page]);

  const confirmPermanentDelete = useCallback(async () => {
    if (!pendingPermanentDelete?.uids.length) return;
    setBulkBusy(true);
    setError(null);
    try {
      await apiFetch('/api/logimail/mail/messages/actions', {
        method: 'POST',
        headers: { 'x-logimail-confirm': 'I_UNDERSTAND_LOGIMAIL_RISK' },
        body: JSON.stringify({ folder, action: 'delete_permanently', uids: pendingPermanentDelete.uids }),
      });
      setSelected(new Set());
      if (pendingPermanentDelete.closeActive) setActiveId(null);
      setPendingPermanentDelete(null);
      await load(page, activeQuery, activeFilter);
    } catch (apiError) {
      setPendingPermanentDelete(null);
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'mail_session_required') {
        setNeedsUnlock(true);
      } else if (errorCode === 'auth_session_expired') {
        setAuthExpired(true);
      } else {
        setError(apiError instanceof Error ? apiError.message : 'Không xóa vĩnh viễn được email.');
      }
    } finally {
      setBulkBusy(false);
    }
  }, [activeFilter, activeQuery, folder, load, page, pendingPermanentDelete]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!messages.length) return;
      const currentIndex = activeId ? messages.findIndex((message) => message.id === activeId) : -1;
      if (event.key.toLowerCase() === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveId(messages[Math.min(messages.length - 1, currentIndex + 1)]?.id ?? messages[0].id);
      } else if (event.key.toLowerCase() === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveId(messages[Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)]?.id ?? messages[0].id);
      } else if (activeId) {
        const activeMessage = messages.find((message) => message.id === activeId);
        if (!activeMessage) return;
        if (event.key.toLowerCase() === 'x') toggleSelect(activeMessage.uid);
        if (event.key.toLowerCase() === 'e' && folder !== 'archive') void runMessageAction(activeMessage, 'archive');
        if (event.key.toLowerCase() === 's') void runMessageAction(activeMessage, activeMessage.flagged ? 'unflag' : 'flag');
        if (event.key === 'Delete') {
          if (folder === 'trash') setPendingPermanentDelete({ uids: [activeMessage.uid], closeActive: true });
          else void runMessageAction(activeMessage, 'trash');
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, folder, messages, runMessageAction, toggleSelect]);

  if (!availableMailboxes.length) return <p className="muted-copy">Chưa có mailbox được cấp quyền.</p>;
  if (authExpired) return <AuthSessionExpiredPanel nextPath={`/mail/${folder}`} />;
  if (needsUnlock) return <MailUnlockPanel mailboxes={availableMailboxes} selectedEmail={session?.session?.email} onAuthExpired={() => setAuthExpired(true)} onUnlocked={() => { setNeedsUnlock(false); void load(0, activeQuery, activeFilter); }} />;

  return (
    <div className={`${styles.mailClient} mail-native-stack`}>
      <div className="toolbar mail-toolbar">
        <label className="mail-inline-search">
          <Search size={15} aria-hidden="true" />
          <input ref={searchRef} value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Người gửi, người nhận hoặc tiêu đề" aria-label="Tìm trong hộp thư" />
          {queryInput ? <button type="button" className="mail-search-clear" onClick={() => setQueryInput('')} aria-label="Xóa tìm kiếm"><X size={13} aria-hidden="true" /></button> : <kbd>/</kbd>}
        </label>
        <div className="mail-filter-control">
          <ListFilter size={14} aria-hidden="true" />
          <select value={activeFilter} onChange={(event) => chooseFilter(event.target.value as MailListFilter)} aria-label="Lọc email">
            {FILTER_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </div>
        <button className="icon-text-button" type="button" onClick={() => void load(page, activeQuery, activeFilter)} disabled={loading} title="Làm mới hộp thư">
          <RefreshCcw size={15} aria-hidden="true" />
          {loading ? 'Đang tải' : 'Làm mới'}
        </button>
        {session?.session ? (
          <button type="button" className="mailbox-session-button" onClick={() => setNeedsUnlock(true)} title="Đổi mailbox đang mở">
            <span className="mailbox-session-dot" aria-hidden="true" />
            <span>{session.session.email}</span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        ) : null}
        <span className="status-badge info">{messages.length}/{total}{activeQuery ? ' (tìm)' : ''}</span>
      </div>

      {error ? <div className="mail-error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => void load(page, activeQuery, activeFilter)}>Thử lại</button></div> : null}

      {selected.size > 0 ? (
        <div className="mail-bulk-bar" role="toolbar" aria-label="Thao tác hàng loạt">
          <span>{selected.size} đã chọn</span>
          {bulkActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                className={`icon-text-button ${action.key === 'delete_permanently' ? 'danger' : ''}`.trim()}
                disabled={bulkBusy}
                onClick={() => action.key === 'delete_permanently'
                  ? setPendingPermanentDelete({ uids: Array.from(selected), closeActive: Boolean(activeId && messages.some((message) => message.id === activeId && selected.has(message.uid))) })
                  : void runBulk(action.key)}
              >
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
                <button type="button" className="mail-page-button" aria-label="Trang trước" title="Trang trước" disabled={page === 0 || loading} onClick={() => void load(page - 1, activeQuery, activeFilter)}><ChevronLeft size={14} aria-hidden="true" /></button>
                <span>Trang {page + 1}</span>
                <button type="button" className="mail-page-button" aria-label="Trang sau" title="Trang sau" disabled={!hasMore || loading} onClick={() => void load(page + 1, activeQuery, activeFilter)}><ChevronRight size={14} aria-hidden="true" /></button>
              </div>
            </div>
          ) : null}
          {loading ? <MessageSkeleton /> : messages.length ? (
          <MessageRows messages={messages} folder={folder} activeId={activeId} selectedUids={selected} busyUids={busyUids} canModify={canModifyMailbox} onOpen={(message) => setActiveId(message.id)} onToggleSelect={toggleSelect} onAction={(message, action) => void runMessageAction(message, action)} />
          ) : (
            <div className="mail-empty-list">
              {activeQuery || activeFilter !== 'all' ? <Search size={22} aria-hidden="true" /> : <MailOpen size={22} aria-hidden="true" />}
              <h2>{activeQuery || activeFilter !== 'all' ? 'Không tìm thấy email phù hợp' : 'Thư mục đang trống'}</h2>
              <p>{activeQuery || activeFilter !== 'all' ? 'Thử đổi từ khóa hoặc hiển thị tất cả thư.' : 'Email mới sẽ xuất hiện ở đây sau khi máy chủ nhận thư.'}</p>
              {activeQuery || activeFilter !== 'all' ? <button type="button" className="icon-text-button" onClick={() => { setQueryInput(''); chooseFilter('all'); }}>Xóa bộ lọc</button> : null}
            </div>
          )}
        </div>
        {activeId ? (
          <MailReadingPane
            messageId={activeId}
            sessionEmail={session?.session?.email ?? null}
            sessionMailboxId={session?.session?.mailboxId ?? null}
            canModify={canModifyMailbox}
            onClose={() => setActiveId(null)}
            onNeedUnlock={() => setNeedsUnlock(true)}
            onAuthExpired={() => setAuthExpired(true)}
            onChanged={() => void load(page, activeQuery, activeFilter)}
          />
        ) : (
          <aside className="reading-pane empty-reading-pane">
            <MailOpen size={22} aria-hidden="true" />
            <h2>{folderMeta[folder].label}</h2>
            <p>{messages.length ? 'Chọn một email để đọc' : 'Thư mục trống'}</p>
          </aside>
        )}
      </div>
      {pendingPermanentDelete ? (
        <PermanentDeleteDialog
          count={pendingPermanentDelete.uids.length}
          loading={bulkBusy}
          onCancel={() => setPendingPermanentDelete(null)}
          onConfirm={() => void confirmPermanentDelete()}
        />
      ) : null}
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
  onAuthExpired,
  onChanged,
  canModify = true,
}: Readonly<{
  messageId: string;
  sessionEmail: string | null;
  sessionMailboxId: string | null;
  onClose?: () => void;
  onNeedUnlock?: () => void;
  onAuthExpired?: () => void;
  onChanged?: () => void;
  canModify?: boolean;
}>) {
  const router = useRouter();
  const [message, setMessage] = useState<MailMessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<MailActionKind | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
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
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'mail_session_required') onNeedUnlock?.();
      else if (errorCode === 'auth_session_expired') onAuthExpired?.();
      else setError(apiError instanceof Error ? apiError.message : 'Không mở được email.');
    } finally {
      setLoading(false);
    }
    // Parent callbacks are intentionally excluded to avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  // Message identity changes intentionally synchronize the reading pane with IMAP.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
        const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        const responseError = new Error(body?.error?.message ?? 'Không tải được tệp đính kèm.') as ApiError;
        responseError.code = body?.error?.code === 'unauthorized' || response.status === 401 ? 'auth_session_expired' : body?.error?.code;
        responseError.status = response.status;
        throw responseError;
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
      if (mailAccessErrorCode(downloadError) === 'auth_session_expired') onAuthExpired?.();
      else setError(downloadError instanceof Error ? downloadError.message : 'Không tải được tệp đính kèm.');
    } finally {
      setDownloadingIndex(null);
    }
  }, [messageId, onAuthExpired]);

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

  const runMessageAction = useCallback(async (action: MailActionKind) => {
    if (!message || !canModify) return;
    setActionLoading(action);
    setError(null);
    try {
      await apiFetch('/api/logimail/mail/messages/actions', {
        method: 'POST',
        headers: action === 'delete_permanently' ? { 'x-logimail-confirm': 'I_UNDERSTAND_LOGIMAIL_RISK' } : undefined,
        body: JSON.stringify({ folder: message.folder, action, uids: [message.uid] }),
      });
      if (action === 'archive' || action === 'spam' || action === 'trash' || action === 'restore' || action === 'delete_permanently') {
        setConfirmPermanentDelete(false);
        onClose?.();
      } else {
        setMessage((current) => current ? {
          ...current,
          unread: action === 'unread' ? true : action === 'read' ? false : current.unread,
          flagged: action === 'flag' ? true : action === 'unflag' ? false : current.flagged,
        } : current);
      }
      onChanged?.();
    } catch (apiError) {
      setConfirmPermanentDelete(false);
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'mail_session_required') {
        onNeedUnlock?.();
      } else if (errorCode === 'auth_session_expired') {
        onAuthExpired?.();
      } else {
        setError(apiError instanceof Error ? apiError.message : 'Không thực hiện được thao tác.');
      }
    } finally {
      setActionLoading(null);
    }
  }, [canModify, message, onAuthExpired, onChanged, onClose, onNeedUnlock]);

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
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'mail_session_required') onNeedUnlock?.();
      else if (errorCode === 'auth_session_expired') onAuthExpired?.();
      else setError(apiError instanceof Error ? apiError.message : 'Không tạo được task.');
    } finally {
      setTaskLoading(false);
    }
  }, [message, onAuthExpired, onNeedUnlock, sessionMailboxId]);

  return (
    <section className={`${styles.readingClient} reading-pane full-reading-pane`}>
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
          <button className="icon-text-button" type="button" onClick={() => void runMessageAction(message?.flagged ? 'unflag' : 'flag')} disabled={!canModify || !message || loading || Boolean(actionLoading)} title={message?.flagged ? 'Bỏ gắn sao' : 'Gắn sao'}>
            {actionLoading === 'flag' || actionLoading === 'unflag' ? <Loader2 size={15} aria-hidden="true" /> : <Star size={15} aria-hidden="true" fill={message?.flagged ? 'currentColor' : 'none'} />}
            {message?.flagged ? 'Bỏ sao' : 'Gắn sao'}
          </button>
          <button className="icon-text-button" type="button" onClick={() => void runMessageAction(message?.unread ? 'read' : 'unread')} disabled={!canModify || !message || loading || Boolean(actionLoading)} title={message?.unread ? 'Đánh dấu đã đọc' : 'Đánh dấu chưa đọc'}>
            {actionLoading === 'read' || actionLoading === 'unread' ? <Loader2 size={15} aria-hidden="true" /> : <MailOpen size={15} aria-hidden="true" />}
            {message?.unread ? 'Đã đọc' : 'Chưa đọc'}
          </button>
          {canModify && message && !['archive', 'spam', 'trash'].includes(message.folder) ? <button className="icon-text-button" type="button" onClick={() => void runMessageAction('archive')} disabled={loading || Boolean(actionLoading)} title="Lưu trữ"><Archive size={15} aria-hidden="true" />Lưu trữ</button> : null}
          {canModify && message && !['archive', 'spam', 'trash'].includes(message.folder) ? <button className="icon-text-button" type="button" onClick={() => void runMessageAction('spam')} disabled={loading || Boolean(actionLoading)} title="Đánh dấu spam"><ShieldCheck size={15} aria-hidden="true" />Spam</button> : null}
          {canModify && message && ['trash', 'spam', 'archive'].includes(message.folder) ? (
            <button className="icon-text-button" type="button" onClick={() => void runMessageAction('restore')} disabled={loading || Boolean(actionLoading)} title="Khôi phục về Hộp thư đến"><RotateCcw size={15} aria-hidden="true" />Khôi phục</button>
          ) : null}
          {canModify && message?.folder === 'trash' ? (
            <button className="icon-text-button danger" type="button" onClick={() => setConfirmPermanentDelete(true)} disabled={loading || Boolean(actionLoading)} title="Xóa vĩnh viễn"><Trash2 size={15} aria-hidden="true" />Xóa vĩnh viễn</button>
          ) : (
            canModify && message && !['trash', 'spam', 'archive'].includes(message.folder) ? <button className="icon-text-button danger" type="button" onClick={() => void runMessageAction('trash')} disabled={loading || Boolean(actionLoading)} title="Chuyển vào thùng rác"><Trash2 size={15} aria-hidden="true" />Thùng rác</button> : null
          )}
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
      {confirmPermanentDelete && message ? (
        <PermanentDeleteDialog
          count={1}
          loading={actionLoading === 'delete_permanently'}
          onCancel={() => setConfirmPermanentDelete(false)}
          onConfirm={() => void runMessageAction('delete_permanently')}
        />
      ) : null}
    </section>
  );
}

export function MailMessageClient({ id, mailboxes }: Readonly<{ id: string; mailboxes: MailUiMailbox[] }>) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [availableMailboxes, setAvailableMailboxes] = useState(mailboxes);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    setError(null);
    setAuthExpired(false);
    try {
      const data = await apiFetch<SessionData>('/api/logimail/mail/session');
      setSession(data);
      setAvailableMailboxes(data.mailboxes ?? mailboxes);
      setNeedsUnlock(!data.unlocked);
    } catch (apiError) {
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'mail_session_required') setNeedsUnlock(true);
      else if (errorCode === 'auth_session_expired') setAuthExpired(true);
      else setError(apiError instanceof Error ? apiError.message : 'Không kiểm tra được phiên hộp thư.');
    } finally {
      setSessionLoading(false);
    }
  }, [mailboxes]);

  // Mailbox props intentionally trigger a fresh server-side session check.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSession(); }, [loadSession]);

  if (sessionLoading) return <p className="muted-copy">Đang kiểm tra phiên hộp thư...</p>;
  if (authExpired) return <AuthSessionExpiredPanel nextPath={`/mail/message/${encodeURIComponent(id)}`} />;
  if (error) return <p className="form-alert danger" role="alert">{error}</p>;
  if (needsUnlock) {
    return <MailUnlockPanel mailboxes={availableMailboxes} selectedEmail={session?.session?.email} onAuthExpired={() => setAuthExpired(true)} onUnlocked={() => { setNeedsUnlock(false); void loadSession(); }} />;
  }

  return (
    <MailReadingPane
      messageId={id}
      sessionEmail={session?.session?.email ?? null}
      sessionMailboxId={session?.session?.mailboxId ?? null}
      canModify={session?.mailbox?.permission === 'send' || session?.mailbox?.permission === 'admin'}
      onNeedUnlock={() => setNeedsUnlock(true)}
      onAuthExpired={() => setAuthExpired(true)}
      onClose={() => router.push('/mail/inbox')}
    />
  );
}

export function MailComposeClient({ mailboxes }: Readonly<{ mailboxes: MailUiMailbox[] }>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const replyDraftRequestRef = useRef<string | null>(null);
  const lastDraftPayloadRef = useRef<string>('');
  const autosaveTimerRef = useRef<number | null>(null);
  const autosavePromiseRef = useRef<Promise<DraftSaveResponse | null>>(Promise.resolve(null));
  const autosaveEnabledRef = useRef(true);
  const persistedDraftIdRef = useRef<string | null>(null);
  const draftOwnerIdRef = useRef<string | null>(null);
  const ownerGenerationRef = useRef(0);
  const autosaveFailedRef = useRef(false);
  const composeContextRef = useRef<string | null>(null);
  const [availableMailboxes, setAvailableMailboxes] = useState(mailboxes);
  const sendableMailboxes = useMemo(() => publicMailboxes(availableMailboxes).filter((mailbox) => mailbox.permission === 'send' || mailbox.permission === 'admin'), [availableMailboxes]);
  const [from, setFrom] = useState(sendableMailboxes[0]?.emailAddress ?? '');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyReloadToken, setReplyReloadToken] = useState(0);
  const [replyMeta, setReplyMeta] = useState<Pick<MailComposeInitialDraft, 'inReplyTo' | 'references'> | null>(null);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [draftRecoveredLocally, setDraftRecoveredLocally] = useState(false);
  const [sendOutcomeUnknown, setSendOutcomeUnknown] = useState(false);
  const [autosaveRevision, setAutosaveRevision] = useState(0);
  const [draftOwnerId, setDraftOwnerId] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: authData, error: authError } = await getSupabaseBrowserClient().auth.getSession();
      if (cancelled) return;
      if (authError || !authData.session?.user.id) {
        const expired = new Error('Phiên đăng nhập LogiMail đã hết hạn.') as ApiError;
        expired.code = 'auth_session_expired';
        throw expired;
      }
      draftOwnerIdRef.current = authData.session.user.id;
      setDraftOwnerId(authData.session.user.id);

      const data = await apiFetch<SessionData>('/api/logimail/mail/session');
      if (cancelled || !data.mailboxes) return;
        setAuthExpired(false);
        setAvailableMailboxes(data.mailboxes);
        const sendable = data.mailboxes.filter((mailbox) => mailbox.permission === 'send' || mailbox.permission === 'admin');
        setFrom((current) => sendable.some((mailbox) => mailbox.emailAddress === current) ? current : sendable[0]?.emailAddress ?? '');
        setNeedsUnlock(!data.unlocked);
    })().catch((apiError) => {
        if (cancelled) return;
        const errorCode = mailAccessErrorCode(apiError);
        if (errorCode === 'mail_session_required') setNeedsUnlock(true);
        else if (errorCode === 'auth_session_expired') setAuthExpired(true);
        else setError(apiError instanceof Error ? apiError.message : 'Không kiểm tra được phiên hộp thư.');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    const { data: authState } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: SupabaseSession | null) => {
      const nextOwnerId = session?.user.id ?? null;
      if (nextOwnerId === draftOwnerIdRef.current) return;

      ownerGenerationRef.current += 1;
      autosaveEnabledRef.current = false;
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      autosavePromiseRef.current = Promise.resolve(null);
      persistedDraftIdRef.current = null;
      lastDraftPayloadRef.current = '';
      autosaveFailedRef.current = false;
      draftOwnerIdRef.current = nextOwnerId;
      composeContextRef.current = null;
      setDraftOwnerId(nextOwnerId);
      setDraftHydrated(false);
      setDraftSavedAt(null);
      setDraftRecoveredLocally(false);
      setDraftSaveError(false);
      setSendOutcomeUnknown(false);
      setDraftSaving(false);
      setMessage(null);
      setWarning(null);
      setError(null);
      // Do not let a new auth identity inherit the previous user's mailbox list.
      // The server-rendered page must be reloaded before compose is usable again.
      setAvailableMailboxes([]);
      setFrom('');
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      setText('');
      setReplyMeta(null);
      setAttachments([]);
      setNeedsUnlock(false);
      setAuthExpired(true);
    });
    return () => { authState.subscription.unsubscribe(); };
  }, [mailboxes]);

  useEffect(() => {
    const composeContext = searchKey ? `reply:${searchKey}` : 'compose';
    if (composeContextRef.current !== null && composeContextRef.current !== composeContext) {
      persistedDraftIdRef.current = null;
      lastDraftPayloadRef.current = '';
      setAttachments([]);
      setDraftSavedAt(null);
      setDraftRecoveredLocally(false);
      setDraftSaveError(false);
      setSendOutcomeUnknown(false);
      const ownerId = draftOwnerIdRef.current;
      if (ownerId) clearComposeDraftCache(window.sessionStorage, ownerId);
    }
    composeContextRef.current = composeContext;

    function applyDraft(draft: MailComposeInitialDraft) {
      if (draft.from && sendableMailboxes.some((mailbox) => mailbox.emailAddress === draft.from)) setFrom(draft.from);
      // Replace every compose field so a new reply cannot inherit stale values
      // from a previous compose flow when the source field is intentionally empty.
      setTo(draft.to ?? '');
      setCc(draft.cc ?? '');
      setBcc(draft.bcc ?? '');
      setSubject(draft.subject ?? '');
      setText(draft.text ?? '');
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
        const errorCode = mailAccessErrorCode(apiError);
        if (errorCode === 'mail_session_required') {
          setNeedsUnlock(true);
          setError('Mở khóa hộp thư để LogiMail nạp nội dung trả lời từ email gốc.');
          return;
        }
        if (errorCode === 'auth_session_expired') {
          setAuthExpired(true);
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

  useEffect(() => {
    if (!draftOwnerId || draftHydrated) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!searchKey) {
        const cached = readComposeDraftCache(window.sessionStorage, draftOwnerId, sendableMailboxes.map((mailbox) => mailbox.emailAddress));
        if (cached) {
          persistedDraftIdRef.current = cached.draftId;
          setFrom(cached.from);
          setTo(cached.to);
          setCc(cached.cc);
          setBcc(cached.bcc);
          setSubject(cached.subject);
          setText(cached.text);
          setReplyMeta({ inReplyTo: cached.inReplyTo ?? undefined, references: cached.references ?? undefined });
          setAttachments(cached.attachments.map((attachment) => ({ ...attachment, contentBase64: null })));
          const cachedDate = new Date(cached.updatedAt);
          setDraftSavedAt(Number.isNaN(cachedDate.getTime()) ? null : cachedDate.toISOString());
          setDraftRecoveredLocally(true);
          if (cached.attachments.length) setWarning('Đã khôi phục metadata tệp đính kèm. Hãy chọn lại các tệp trước khi gửi.');
        }
      }
      setDraftHydrated(true);
    });
    return () => { cancelled = true; };
  }, [draftHydrated, draftOwnerId, searchKey, sendableMailboxes]);

  const attachmentBytes = useMemo(() => attachments.reduce((total, attachment) => total + attachment.size, 0), [attachments]);
  const attachmentsNeedingReattach = useMemo(() => attachments.filter((attachment) => !attachment.contentBase64), [attachments]);
  const hasDraftContent = Boolean(to.trim() || cc.trim() || bcc.trim() || subject.trim() || text.trim() || attachments.length || replyMeta?.inReplyTo);
  useEffect(() => {
    if (!draftHydrated || !draftOwnerId || !from) return;
    const snapshot: ComposeDraftCache = {
      version: COMPOSE_DRAFT_CACHE_VERSION,
      userId: draftOwnerId,
      draftId: persistedDraftIdRef.current,
      from,
      to,
      cc,
      bcc,
      subject,
      text,
      inReplyTo: replyMeta?.inReplyTo ?? null,
      references: replyMeta?.references ?? null,
      attachments: attachments.map(({ id, filename, contentType, size }) => ({ id, filename, contentType, size })),
      updatedAt: Date.now(),
    };
    if (!hasDraftContent && !snapshot.draftId) {
      clearComposeDraftCache(window.sessionStorage, snapshot.userId);
      return;
    }
    if (!writeComposeDraftCache(window.sessionStorage, snapshot)) queueMicrotask(() => setDraftSaveError(true));
  }, [attachments, bcc, cc, draftHydrated, draftOwnerId, from, hasDraftContent, replyMeta?.inReplyTo, replyMeta?.references, subject, text, to]);

  useEffect(() => {
    if (!draftHydrated || !autosaveEnabledRef.current || !from || (!hasDraftContent && !persistedDraftIdRef.current)) return;

    const snapshot = {
      from,
      to,
      cc,
      bcc,
      subject,
      text,
      inReplyTo: replyMeta?.inReplyTo,
      references: replyMeta?.references,
      attachments: attachments.map(({ id, filename, contentType, size }) => ({ id, filename, contentType, size })),
    };
    const fingerprint = JSON.stringify(snapshot);
    if (fingerprint === lastDraftPayloadRef.current) return;

    const timeout = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      setDraftSaving(true);
      setDraftSaveError(false);
      autosaveFailedRef.current = false;
      const ownerGeneration = ownerGenerationRef.current;
      const previousSave = autosavePromiseRef.current;
      const savePromise = previousSave
        .catch(() => null)
        .then(async () => {
          try {
            const result = await apiFetch<DraftSaveResponse>('/api/logimail/mail/drafts', {
              method: 'POST',
              body: JSON.stringify({ ...snapshot, draftId: persistedDraftIdRef.current }),
            });
            if (ownerGeneration !== ownerGenerationRef.current) return null;
            persistedDraftIdRef.current = result.draft.id;
            lastDraftPayloadRef.current = fingerprint;
            autosaveFailedRef.current = false;
            setDraftRecoveredLocally(false);
            const ownerId = draftOwnerIdRef.current;
            if (ownerId) {
              writeComposeDraftCache(window.sessionStorage, {
                version: COMPOSE_DRAFT_CACHE_VERSION,
                userId: ownerId,
                draftId: result.draft.id,
                ...snapshot,
                inReplyTo: snapshot.inReplyTo ?? null,
                references: snapshot.references ?? null,
                updatedAt: new Date(result.draft.updated_at).getTime(),
              });
            }
            if (autosaveEnabledRef.current) setDraftSavedAt(result.draft.updated_at);
            return result;
          } catch (apiError) {
            if (ownerGeneration !== ownerGenerationRef.current) return null;
            autosaveFailedRef.current = true;
            const errorCode = mailAccessErrorCode(apiError);
            if (errorCode === 'mail_session_required') setNeedsUnlock(true);
            else if (errorCode === 'auth_session_expired') setAuthExpired(true);
            else if (errorCode === 'not_found') {
              persistedDraftIdRef.current = null;
              lastDraftPayloadRef.current = fingerprint;
              const ownerId = draftOwnerIdRef.current;
              if (ownerId) {
                writeComposeDraftCache(window.sessionStorage, {
                  version: COMPOSE_DRAFT_CACHE_VERSION,
                  userId: ownerId,
                  draftId: null,
                  ...snapshot,
                  inReplyTo: snapshot.inReplyTo ?? null,
                  references: snapshot.references ?? null,
                  updatedAt: Date.now(),
                });
              }
              if (autosaveEnabledRef.current) setDraftSaveError(true);
            } else if (autosaveEnabledRef.current) setDraftSaveError(true);
            return null;
          }
        })
      autosavePromiseRef.current = savePromise;
      void savePromise.finally(() => {
        if (autosaveEnabledRef.current && autosavePromiseRef.current === savePromise) setDraftSaving(false);
      });
    }, 1200);
    autosaveTimerRef.current = timeout;

    return () => {
      window.clearTimeout(timeout);
      if (autosaveTimerRef.current === timeout) autosaveTimerRef.current = null;
    };
  }, [attachments, autosaveRevision, bcc, cc, draftHydrated, from, hasDraftContent, replyMeta?.inReplyTo, replyMeta?.references, subject, text, to]);

  async function attachFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const nextFiles = Array.from(files);
    const unmatchedPlaceholders = attachments.filter((attachment) => !attachment.contentBase64);
    let replacementCount = 0;
    let replacementBytes = 0;
    for (const file of nextFiles) {
      const matchIndex = unmatchedPlaceholders.findIndex((attachment) => attachment.filename === file.name && attachment.size === file.size);
      if (matchIndex >= 0) {
        replacementCount += 1;
        replacementBytes += file.size;
        unmatchedPlaceholders.splice(matchIndex, 1);
      }
    }
    if (attachments.length + nextFiles.length - replacementCount > MAX_COMPOSE_ATTACHMENTS) {
      setError('Chỉ gửi tối đa 10 tệp trong một email.');
      return;
    }
    const nextBytes = nextFiles.reduce((total, file) => total + file.size, attachmentBytes) - replacementBytes;
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
      setAttachments((current) => {
        const next = [...current];
        for (const attachment of encoded) {
          const placeholderIndex = next.findIndex((item) => !item.contentBase64 && item.filename === attachment.filename && item.size === attachment.size);
          if (placeholderIndex >= 0) next[placeholderIndex] = { ...attachment, id: next[placeholderIndex].id };
          else next.push(attachment);
        }
        return next;
      });
      if (attachmentsNeedingReattach.length > 0 && replacementCount >= attachmentsNeedingReattach.length) {
        setWarning((currentWarning) => currentWarning?.startsWith('Đã khôi phục metadata tệp đính kèm.') ? null : currentWarning);
      }
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Không đọc được tệp.');
    }
  }

  function removeAttachment(id: string) {
    const removed = attachments.find((attachment) => attachment.id === id);
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
    if (removed && !removed.contentBase64 && attachmentsNeedingReattach.length === 1) {
      setWarning((currentWarning) => currentWarning?.startsWith('Đã khôi phục metadata tệp đính kèm.') ? null : currentWarning);
    }
  }

  const pauseAutosave = useCallback(async () => {
    autosaveEnabledRef.current = false;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setDraftSaving(false);
    await autosavePromiseRef.current.catch(() => null);
    return persistedDraftIdRef.current;
  }, []);

  const resumeAutosave = useCallback(() => {
    autosaveEnabledRef.current = true;
    if (autosaveFailedRef.current) setDraftSaveError(true);
    setAutosaveRevision((current) => current + 1);
  }, []);

  const clearComposer = useCallback(() => {
    autosaveEnabledRef.current = true;
    persistedDraftIdRef.current = null;
    autosaveFailedRef.current = false;
    const ownerId = draftOwnerIdRef.current;
    if (ownerId) clearComposeDraftCache(window.sessionStorage, ownerId);
    setTo('');
    setCc('');
    setBcc('');
    setSubject('');
    setText('');
    setReplyMeta(null);
    setAttachments([]);
    setDraftSavedAt(null);
    setDraftSaveError(false);
    setDraftRecoveredLocally(false);
    setSendOutcomeUnknown(false);
    setWarning(null);
    setDraftSaving(false);
    lastDraftPayloadRef.current = '';
  }, []);

  const discardDraft = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const draftToDelete = await pauseAutosave();
      if (draftToDelete) await apiFetch(`/api/logimail/mail/drafts/${draftToDelete}`, { method: 'DELETE' });
      clearComposer();
      router.push('/mail/inbox');
    } catch (apiError) {
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'not_found' || errorCode === 'draft_not_editable') {
        clearComposer();
        router.push('/mail/inbox');
      } else {
        resumeAutosave();
        if (errorCode === 'mail_session_required') setNeedsUnlock(true);
        else if (errorCode === 'auth_session_expired') setAuthExpired(true);
        else setError(apiError instanceof Error ? apiError.message : 'Không hủy được thư nháp.');
      }
    } finally {
      setLoading(false);
    }
  }, [clearComposer, pauseAutosave, resumeAutosave, router]);

  async function sendMail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendOutcomeUnknown) return;
    if (attachmentsNeedingReattach.length) {
      setError(`Hãy chọn lại ${attachmentsNeedingReattach.length} tệp đã khôi phục trước khi gửi.`);
      return;
    }
    setLoading(true);
    setMessage(null);
    setWarning(null);
    setError(null);
    const draftToDelete = await pauseAutosave();
    let draftIdForSend = draftToDelete;
    let draftSnapshotWarning: string | null = null;
    try {
      const draftSnapshot = {
        from,
        to,
        cc,
        bcc,
        subject,
        text,
        inReplyTo: replyMeta?.inReplyTo,
        references: replyMeta?.references,
        attachments: attachments.map(({ id, filename, contentType, size }) => ({ id, filename, contentType, size })),
      };
      try {
        const savedDraft = await apiFetch<DraftSaveResponse>('/api/logimail/mail/drafts', {
          method: 'POST',
          body: JSON.stringify({ ...draftSnapshot, draftId: draftToDelete }),
        });
        draftIdForSend = savedDraft.draft.id;
        persistedDraftIdRef.current = draftIdForSend;
      } catch (draftError) {
        const draftErrorCode = mailAccessErrorCode(draftError);
        if (draftErrorCode === 'auth_session_expired') {
          resumeAutosave();
          setAuthExpired(true);
          return;
        }
        // Never finalize a stale draft when the just-edited snapshot was not persisted.
        draftIdForSend = null;
        persistedDraftIdRef.current = null;
        draftSnapshotWarning = 'Email sẽ dùng nội dung hiện tại, nhưng bản nháp máy chủ chưa được đồng bộ.';
      }
      const currentSession = await apiFetch<SessionData>('/api/logimail/mail/session');
      if (!currentSession.unlocked || currentSession.session?.email !== from) {
        resumeAutosave();
        setNeedsUnlock(true);
        return;
      }
      const sendResult = await apiFetch<SendMailResponse>('/api/logimail/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          to,
          cc,
          bcc,
          subject,
          text,
          inReplyTo: replyMeta?.inReplyTo,
          references: replyMeta?.references,
          draftId: draftIdForSend,
          attachments: attachments.map(({ filename, contentType, contentBase64 }) => ({ filename, contentType, contentBase64: contentBase64 ?? '' })),
        }),
      });
      const accepted = Array.isArray(sendResult.result?.accepted) ? sendResult.result.accepted : [];
      const rejected = Array.isArray(sendResult.result?.rejected) ? sendResult.result.rejected : [];
      if (accepted.length === 0) {
        resumeAutosave();
        setSendOutcomeUnknown(false);
        setError(rejected.length ? `SMTP từ chối toàn bộ người nhận: ${rejected.join(', ')}.` : 'SMTP chưa xác nhận người nhận nào. Thư chưa được gửi.');
        return;
      }
      if (rejected.length > 0) {
        resumeAutosave();
        setSendOutcomeUnknown(false);
        setTo(rejected.join(', '));
        setCc('');
        setBcc('');
        setWarning(`Đã gửi ${accepted.length} người nhận; ${rejected.length} địa chỉ bị từ chối. Nội dung được giữ lại để bạn xử lý tiếp.`);
        return;
      }
      clearComposer();
      setMessage('Đã gửi email.');
      if (draftSnapshotWarning) {
        setWarning(`${draftSnapshotWarning} LogiMail đã xóa bản cache trên thiết bị này.`);
      } else if (sendResult.result?.sentCopy?.status === 'failed') {
        setWarning('Email đã gửi thành công, nhưng chưa lưu được bản sao trong Thư đã gửi. Không gửi lại; hãy làm mới hoặc kiểm tra IMAP.');
      } else if (draftIdForSend && sendResult.draftCleanup?.status === 'failed') {
        setWarning('Email đã gửi nhưng máy chủ chưa đánh dấu dọn draft. LogiMail đã xóa bản cache trên thiết bị này.');
      }
    } catch (apiError) {
      resumeAutosave();
      const errorCode = mailAccessErrorCode(apiError);
      if (errorCode === 'mail_session_required') setNeedsUnlock(true);
      else if (errorCode === 'auth_session_expired') setAuthExpired(true);
      else if (errorCode === 'smtp_failed' || !errorCode) {
        // SMTP may have accepted the message before the HTTP response failed;
        // block a blind retry until the user checks the Sent folder.
        setSendOutcomeUnknown(true);
        setWarning('Không xác định được SMTP đã nhận thư hay chưa. Kiểm tra Thư đã gửi trước khi thử lại.');
      } else setError(apiError instanceof Error ? apiError.message : 'Không gửi được email.');
    } finally {
      setLoading(false);
    }
  }

  if (!sendableMailboxes.length) return <p className="muted-copy">Chưa có mailbox có quyền gửi.</p>;

  return (
    <section className={`${styles.composeClient} compose-native-layout`}>
      {authExpired ? <AuthSessionExpiredPanel nextPath="/mail/compose" /> : null}
      {needsUnlock && !authExpired ? (
        <MailUnlockPanel
          mailboxes={sendableMailboxes}
          selectedEmail={from}
          onAuthExpired={() => setAuthExpired(true)}
          onUnlocked={(unlockedSession) => {
            const unlockedFrom = unlockedSession.session?.email ?? unlockedSession.mailbox?.emailAddress;
            if (unlockedFrom && sendableMailboxes.some((mailbox) => mailbox.emailAddress === unlockedFrom)) setFrom(unlockedFrom);
            setNeedsUnlock(false);
            setReplyReloadToken((value) => value + 1);
          }}
        />
      ) : null}
      <form className="compose-form" onSubmit={sendMail} onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}>
        {message ? <p className="form-alert success">{message}</p> : null}
        {warning ? <p className="form-alert info" role="status">{warning}{sendOutcomeUnknown ? <> <Link href="/mail/sent">Mở Thư đã gửi</Link></> : null}</p> : null}
        {replyLoading ? <p className="form-alert info">Đang nạp nội dung trả lời...</p> : null}
        {error ? <p className="form-alert danger">{error}</p> : null}
        <div className="compose-status-line">
          <span className={draftSaveError ? 'draft-save-error' : ''}>{draftSaving ? <Loader2 size={13} aria-hidden="true" /> : draftSaveError ? <X size={13} aria-hidden="true" /> : draftSavedAt ? <Check size={13} aria-hidden="true" /> : <Save size={13} aria-hidden="true" />}{draftSaving ? 'Đang lưu nháp' : draftSaveError ? 'Chưa lưu được nháp' : draftRecoveredLocally && draftSavedAt ? `Đã khôi phục trên thiết bị ${formatDate(draftSavedAt)}` : draftSavedAt ? `Đã lưu ${formatDate(draftSavedAt)}` : 'Tự lưu nháp'}</span>
          <span className="compose-shortcut">⌘/Ctrl + Enter để gửi</span>
        </div>
        <label className="form-field"><span>Từ</span><select value={from} onChange={(event) => { setFrom(event.target.value); setNeedsUnlock(false); }}>{sendableMailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.emailAddress}>{mailbox.emailAddress}</option>)}</select></label>
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
              <span key={attachment.id} className={!attachment.contentBase64 ? 'attachment-needs-reattach' : undefined}>
                {attachment.filename} · {formatSize(attachment.size)}{!attachment.contentBase64 ? ' · cần chọn lại tệp' : ''}
                <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`Gỡ ${attachment.filename}`}><X size={12} aria-hidden="true" /></button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="compose-actions">
          <button className="button-link button-reset primary" type="submit" disabled={loading || sendOutcomeUnknown || !to || !text}>{loading ? <Loader2 size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}<span>{loading ? 'Đang gửi' : sendOutcomeUnknown ? 'Kiểm tra trước khi gửi lại' : 'Gửi email'}</span></button>
          <button className="icon-text-button danger" type="button" onClick={() => void discardDraft()} disabled={loading}><Trash2 size={15} aria-hidden="true" />Hủy nháp</button>
        </div>
      </form>
    </section>
  );
}
