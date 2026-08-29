'use client';

import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DatabaseBackup, MailPlus, RefreshCcw, ShieldCheck, Tags, Workflow } from 'lucide-react';
import { ButtonLike } from '@/components/logimail-ui';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type FormState = {
  loading: boolean;
  message: string | null;
  error: string | null;
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: { message?: string };
};

type PlannedRecord = {
  type: string;
  name: string;
  content: string;
  priority?: number;
  proxied?: boolean;
};

type DomainOption = {
  id: string;
  domain: string;
};

type LabelOption = {
  id: string;
  name: string;
};

type InviteMailboxOption = {
  id: string;
  emailAddress: string;
};

const initialState: FormState = { loading: false, message: null, error: null };

async function currentToken() {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Cần đăng nhập lại trước khi gửi yêu cầu.');
  return token;
}

async function postJson<T>(url: string, payload: Record<string, unknown>, defaultMessage: string) {
  const token = await currentToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null) as ApiResponse<T> | null;
  if (!response.ok || !body?.ok) throw new Error(body?.error?.message ?? defaultMessage);
  return body.data as T;
}

export function DomainRequestForm({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);
  const [plannedRecords, setPlannedRecords] = useState<PlannedRecord[]>([]);
  const [ownershipRecord, setOwnershipRecord] = useState<PlannedRecord | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ loading: true, message: null, error: null });
    setPlannedRecords([]);
    setOwnershipRecord(null);
    setRequestId(null);

    try {
      const result = await postJson<{
        domainRequest: { id: string };
        ownershipRecord: PlannedRecord;
        plannedRecords?: PlannedRecord[];
      }>('/api/logimail/domains/request', {
        workspaceId,
        domain: String(formData.get('domain') ?? ''),
        mailHostname: String(formData.get('mailHostname') ?? ''),
        purpose: String(formData.get('purpose') ?? ''),
      }, 'Không gửi được yêu cầu domain.');

      form.reset();
      setPlannedRecords(result.plannedRecords ?? []);
      setOwnershipRecord(result.ownershipRecord);
      setRequestId(result.domainRequest.id);
      setState({ loading: false, message: 'Yêu cầu đã tạo. Publish TXT ownership rồi kiểm tra DNS để mở khóa bước phê duyệt.', error: null });
      router.refresh();
    } catch (error) {
      setState({ loading: false, message: null, error: error instanceof Error ? error.message : 'Không gửi được yêu cầu domain.' });
    }
  }

  async function verifyOwnership() {
    if (!requestId) return;
    setState({ loading: true, message: null, error: null });
    try {
      const result = await postJson<{ verified: boolean; status: string }>(
        `/api/logimail/domains/request/${requestId}/ownership`,
        {},
        'Không kiểm tra được ownership DNS.',
      );
      setState({
        loading: false,
        message: result.verified
          ? 'Ownership đã xác minh. Domain hiện sẵn sàng để admin phê duyệt.'
          : 'TXT chưa được nhìn thấy trên public DNS. Hãy chờ propagation rồi kiểm tra lại.',
        error: null,
      });
      if (result.verified) router.refresh();
    } catch (error) {
      setState({ loading: false, message: null, error: error instanceof Error ? error.message : 'Không kiểm tra được ownership DNS.' });
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      <label className="form-field">
        <span>Domain name</span>
        <input name="domain" placeholder="example.com" autoComplete="off" required />
      </label>
      <label className="form-field">
        <span>Mail hostname</span>
        <input name="mailHostname" placeholder="mail.example.com" autoComplete="off" />
        <small>Bỏ trống để LogiMail tự chọn mail host đã cấu hình.</small>
      </label>
      <label className="form-field">
        <span>Mục đích</span>
        <textarea name="purpose" rows={4} />
      </label>
      <ButtonLike tone="primary" type="submit" icon={ShieldCheck} disabled={state.loading}>{state.loading ? 'Đang gửi' : 'Gửi yêu cầu duyệt'}</ButtonLike>
      {ownershipRecord ? (
        <div className="request-result-list" aria-live="polite">
          <strong>Ownership TXT</strong>
          <code>{ownershipRecord.type} {ownershipRecord.name} → {ownershipRecord.content}</code>
          <button className="button-link button-reset secondary" type="button" onClick={verifyOwnership} disabled={state.loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>{state.loading ? 'Đang kiểm tra' : 'Kiểm tra DNS'}</span>
          </button>
        </div>
      ) : null}
      {plannedRecords.length ? (
        <div className="request-result-list" aria-live="polite">
          <strong>DNS mail sau khi duyệt</strong>
          {plannedRecords.map((record) => (
            <code key={`${record.type}-${record.name}-${record.content}`}>{record.type} {record.name} → {record.content}</code>
          ))}
        </div>
      ) : null}
    </form>
  );
}

export function MailboxRequestForm({ workspaceId, domains }: Readonly<{ workspaceId: string; domains: DomainOption[] }>) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);
  const hasDomains = domains.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasDomains) {
      setState({ loading: false, message: null, error: 'Chưa có domain nào được duyệt để tạo mailbox.' });
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ loading: true, message: null, error: null });

    try {
      await postJson('/api/logimail/mailboxes/request', {
        workspaceId,
        domainId: String(formData.get('domainId') ?? ''),
        localPart: String(formData.get('localPart') ?? ''),
        displayName: String(formData.get('displayName') ?? ''),
        quotaMb: Number(formData.get('quotaMb') ?? 1024),
      }, 'Không gửi được yêu cầu mailbox.');

      form.reset();
      setState({ loading: false, message: 'Đã gửi yêu cầu mailbox. Admin sẽ phê duyệt trước khi provision.', error: null });
      router.refresh();
    } catch (error) {
      setState({ loading: false, message: null, error: error instanceof Error ? error.message : 'Không gửi được yêu cầu mailbox.' });
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      {!hasDomains ? <p className="form-alert danger">Cần ít nhất một domain active, approved và bật đăng ký mailbox.</p> : null}
      <div className="form-two">
        <label className="form-field">
          <span>Email prefix</span>
          <input name="localPart" placeholder="hello" autoComplete="off" pattern="[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?" required disabled={!hasDomains || state.loading} />
        </label>
        <label className="form-field">
          <span>Domain</span>
          <select name="domainId" required disabled={!hasDomains || state.loading}>
            {domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.domain}</option>)}
          </select>
        </label>
      </div>
      <label className="form-field">
        <span>Tên hiển thị</span>
        <input name="displayName" autoComplete="name" disabled={!hasDomains || state.loading} />
      </label>
      <label className="form-field">
        <span>Quota</span>
        <select name="quotaMb" defaultValue="1024" disabled={!hasDomains || state.loading}>
          <option value="512">512MB</option>
          <option value="1024">1GB</option>
          <option value="2048">2GB</option>
        </select>
      </label>
      <ButtonLike tone="primary" type="submit" icon={MailPlus} disabled={!hasDomains || state.loading}>{state.loading ? 'Đang gửi' : 'Gửi yêu cầu duyệt'}</ButtonLike>
    </form>
  );
}

export function AliasRequestForm({ mailboxId }: Readonly<{ mailboxId: string }>) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ loading: true, message: null, error: null });
    try {
      await postJson('/api/logimail/aliases', {
        mailboxId,
        localPart: String(formData.get('localPart') ?? ''),
        displayName: String(formData.get('displayName') ?? ''),
      }, 'Không tạo được alias.');
      form.reset();
      setState({ loading: false, message: 'Đã tạo yêu cầu alias. Provider sẽ được provision khi endpoint alias sẵn sàng.', error: null });
      router.refresh();
    } catch (error) {
      setState({ loading: false, message: null, error: error instanceof Error ? error.message : 'Không tạo được alias.' });
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      <div className="form-two">
        <label className="form-field"><span>Alias prefix</span><input name="localPart" placeholder="cskh" autoComplete="off" required /></label>
        <label className="form-field"><span>Tên hiển thị</span><input name="displayName" placeholder="CSKH LogiVN" autoComplete="off" /></label>
      </div>
      <ButtonLike tone="primary" type="submit" icon={MailPlus} disabled={state.loading}>{state.loading ? 'Đang tạo' : 'Tạo alias'}</ButtonLike>
    </form>
  );
}

export function MailLabelForm({ mailboxId }: Readonly<{ mailboxId: string }>) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ loading: true, message: null, error: null });
    try {
      await postJson('/api/logimail/mail/labels', {
        mailboxId,
        name: String(formData.get('name') ?? ''),
        color: String(formData.get('color') ?? '#0F4D3A'),
      }, 'Không tạo được label.');
      form.reset();
      setState({ loading: false, message: 'Đã tạo label.', error: null });
      router.refresh();
    } catch (error) {
      setState({ loading: false, message: null, error: error instanceof Error ? error.message : 'Không tạo được label.' });
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      <div className="form-two">
        <label className="form-field"><span>Label</span><input name="name" placeholder="Ưu tiên" required /></label>
        <label className="form-field"><span>Màu</span><input name="color" type="color" defaultValue="#0F4D3A" /></label>
      </div>
      <ButtonLike tone="secondary" type="submit" icon={Tags} disabled={state.loading}>{state.loading ? 'Đang lưu' : 'Tạo label'}</ButtonLike>
    </form>
  );
}

export function MailRuleForm({ mailboxId, labels }: Readonly<{ mailboxId: string; labels: LabelOption[] }>) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ loading: true, message: null, error: null });
    try {
      await postJson('/api/logimail/mail/rules', {
        mailboxId,
        name: String(formData.get('name') ?? ''),
        fromContains: String(formData.get('fromContains') ?? ''),
        subjectContains: String(formData.get('subjectContains') ?? ''),
        action: String(formData.get('action') ?? 'label'),
        labelId: String(formData.get('labelId') ?? ''),
      }, 'Không tạo được rule.');
      form.reset();
      setState({ loading: false, message: 'Đã tạo rule.', error: null });
      router.refresh();
    } catch (error) {
      setState({ loading: false, message: null, error: error instanceof Error ? error.message : 'Không tạo được rule.' });
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      <label className="form-field"><span>Tên rule</span><input name="name" placeholder="Gắn nhãn khách hàng" required /></label>
      <div className="form-two">
        <label className="form-field"><span>From chứa</span><input name="fromContains" placeholder="@customer.com" /></label>
        <label className="form-field"><span>Subject chứa</span><input name="subjectContains" placeholder="invoice" /></label>
      </div>
      <div className="form-two">
        <label className="form-field"><span>Hành động</span><select name="action" defaultValue="label"><option value="label">Label</option><option value="archive">Archive</option><option value="mark_read">Mark read</option><option value="move_spam">Move spam</option><option value="assign_team">Assign team</option></select></label>
        <label className="form-field"><span>Label</span><select name="labelId"><option value="">Không chọn</option>{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label>
      </div>
      <ButtonLike tone="secondary" type="submit" icon={Workflow} disabled={state.loading}>{state.loading ? 'Đang lưu' : 'Tạo rule'}</ButtonLike>
    </form>
  );
}

export function DeliverabilityCheckButton({ domainId }: Readonly<{ domainId: string }>) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);

  async function run() {
    setState({ loading: true, message: null, error: null });
    try {
      await postJson(`/api/logimail/domains/${domainId}/deliverability`, {}, 'Không tạo được snapshot deliverability.');
      setState({ loading: false, message: 'Đã tạo snapshot deliverability.', error: null });
      router.refresh();
    } catch (error) {
      setState({ loading: false, message: null, error: error instanceof Error ? error.message : 'Không tạo được snapshot.' });
    }
  }

  return <div className="inline-action-stack"><button className="button-link button-reset secondary" type="button" onClick={() => void run()} disabled={state.loading}><RefreshCcw size={16} aria-hidden="true" /><span>{state.loading ? 'Đang kiểm' : 'Tạo snapshot'}</span></button>{state.error ? <p className="form-alert danger">{state.error}</p> : null}{state.message ? <p className="form-alert success">{state.message}</p> : null}</div>;
}

export function BackupRequestButton({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);

  async function run() {
    setState({ loading: true, message: null, error: null });
    try {
      await postJson('/api/logimail/ops/backup', { workspaceId, scope: 'workspace' }, 'Không tạo được backup job.');
      setState({ loading: false, message: 'Đã tạo backup job.', error: null });
      router.refresh();
    } catch (error) {
      setState({ loading: false, message: null, error: error instanceof Error ? error.message : 'Không tạo được backup job.' });
    }
  }

  return <div className="inline-action-stack"><button className="button-link button-reset warning" type="button" onClick={() => void run()} disabled={state.loading}><DatabaseBackup size={16} aria-hidden="true" /><span>{state.loading ? 'Đang tạo' : 'Tạo backup job'}</span></button>{state.error ? <p className="form-alert danger">{state.error}</p> : null}{state.message ? <p className="form-alert success">{state.message}</p> : null}</div>;
}

export function TeamInviteForm({ workspaceId, mailboxes }: Readonly<{ workspaceId: string; mailboxes: InviteMailboxOption[] }>) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);
  const [mailboxId, setMailboxId] = useState(mailboxes[0]?.id ?? '');
  const selectedMailbox = mailboxes.find((mailbox) => mailbox.id === mailboxId) ?? null;
  const [result, setResult] = useState<{ code: string; acceptanceUrl: string; expiresAt: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMailbox) {
      setState({ loading: false, message: null, error: 'Cần có mailbox hoạt động để mời thành viên.' });
      return;
    }
    const formData = new FormData(event.currentTarget);
    setState({ loading: true, message: null, error: null });
    setResult(null);
    try {
      const data = await postJson<{
        code: string;
        acceptanceUrl: string;
        invite: { expires_at: string };
      }>('/api/logimail/team/invites', {
        workspaceId,
        mailboxId: selectedMailbox.id,
        email: selectedMailbox.emailAddress,
        role: String(formData.get('role') ?? 'member'),
      }, 'Không tạo được lời mời.');
      setResult({ code: data.code, acceptanceUrl: data.acceptanceUrl, expiresAt: data.invite.expires_at });
      setState({ loading: false, message: 'Đã tạo lời mời một lần. Hãy chuyển URL và mã qua kênh bảo mật đã xác minh.', error: null });
      router.refresh();
    } catch (error) {
      setState({ loading: false, message: null, error: error instanceof Error ? error.message : 'Không tạo được lời mời.' });
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setState((current) => ({ ...current, message: 'Đã sao chép. Không gửi mã qua kênh công khai.' }));
    } catch {
      setState((current) => ({ ...current, error: 'Không thể sao chép tự động. Hãy chọn và sao chép thủ công.' }));
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      <label className="form-field">
        <span>Mailbox danh tính</span>
        <select value={mailboxId} onChange={(event) => setMailboxId(event.target.value)} disabled={state.loading || mailboxes.length === 0} required>
          {mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.emailAddress}</option>)}
        </select>
        <small>Mật khẩu của mailbox này sẽ được đồng bộ với tài khoản khi lời mời được chấp nhận.</small>
      </label>
      <label className="form-field">
        <span>Email người nhận</span>
        <input value={selectedMailbox?.emailAddress ?? ''} readOnly aria-readonly="true" />
      </label>
      <label className="form-field">
        <span>Vai trò workspace</span>
        <select name="role" defaultValue="member" disabled={state.loading}>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </label>
      <ButtonLike tone="primary" type="submit" icon={MailPlus} disabled={state.loading || !selectedMailbox}>{state.loading ? 'Đang tạo mã' : 'Tạo lời mời bảo mật'}</ButtonLike>
      {result ? (
        <div className="request-result-list" aria-live="polite">
          <strong>Thông tin gửi thủ công qua kênh đã xác minh</strong>
          <code>{result.acceptanceUrl}</code>
          <button className="button-link button-reset secondary" type="button" onClick={() => void copy(result.acceptanceUrl)}>Sao chép URL</button>
          <code>{result.code}</code>
          <button className="button-link button-reset secondary" type="button" onClick={() => void copy(result.code)}>Sao chép mã</button>
          <small>Hết hạn: {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.expiresAt))}</small>
        </div>
      ) : null}
    </form>
  );
}
