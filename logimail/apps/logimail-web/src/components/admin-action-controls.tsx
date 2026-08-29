'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { KeyRound, LockKeyhole, LogOut, UnlockKeyhole } from 'lucide-react';
import { AdminMfaStepUpModal, useAdminMfaStepUp } from '@/components/admin-mfa-step-up';
import { ControlActionDialog, type ControlActionDialogConfig } from '@/components/control/control-action-dialog';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type ActionState = {
  busy: 'mailbox-status' | 'rotate-keys' | 'revoke-sessions' | null;
  message: string | null;
  error: string | null;
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message?: string } };

const initialState: ActionState = { busy: null, message: null, error: null };
const confirmHeaders = { 'x-logimail-confirm': 'I_UNDERSTAND_LOGIMAIL_RISK' };

class AdminActionRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminActionRequestError';
  }
}

async function adminRequest<T>(path: string, init: RequestInit): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
      authorization: `Bearer ${data.session.access_token}`,
    },
  });
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.ok) {
    const message = body && !body.ok ? body.error.message : null;
    const code = body && !body.ok ? body.error.code : null;
    throw new AdminActionRequestError(
      message ?? 'Không thực hiện được tác vụ quản trị.',
      code ?? 'admin_request_failed',
      response.status,
    );
  }
  return body.data;
}

export function MailboxAdminActions({
  mailboxId,
  email,
  status,
}: Readonly<{
  mailboxId: string;
  email: string;
  status: string;
}>) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(initialState);
  const [dialog, setDialog] = useState<ControlActionDialogConfig | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const mfaStepUp = useAdminMfaStepUp();
  const unlock = status === 'locked';
  const supportedStatus = status === 'active' || unlock;

  async function changeMailboxStatus(): Promise<boolean> {
    if (!supportedStatus) return false;
    const action = unlock ? 'unlock_mailbox' : 'lock_mailbox';
    const verb = unlock ? 'mở khóa' : 'tạm khóa';

    setState({ busy: 'mailbox-status', message: null, error: null });
    try {
      const data = await mfaStepUp.runWithStepUp(() => adminRequest<{
        result: { results: Array<{ id: string; status: 'succeeded' | 'failed'; reason?: string }> };
      }>('/api/logimail/admin/bulk', {
        method: 'POST',
        body: JSON.stringify({ action, ids: [mailboxId] }),
      }));
      const result = data.result.results.find((item) => item.id === mailboxId);
      if (!result || result.status !== 'succeeded') throw new Error(result?.reason ?? 'Backend không xác nhận thay đổi mailbox.');
      setState({ busy: null, message: `Đã ${verb} ${email}.`, error: null });
      router.refresh();
      return true;
    } catch (error) {
      setState({ busy: null, message: null, error: error instanceof Error ? error.message : 'Không cập nhật được mailbox.' });
      return false;
    }
  }

  function openMailboxStatusDialog() {
    const confirmationText = `${unlock ? 'UNLOCK' : 'LOCK'} ${email}`;
    setDialogValue('');
    setDialog({
      actionKey: 'mailbox-status',
      title: unlock ? 'Mở khóa mailbox' : 'Tạm khóa mailbox',
      description: `Thay đổi trạng thái ${email}. Tác vụ sẽ được ghi vào audit log và áp dụng ngay cho phiên mailbox.`,
      confirmLabel: unlock ? 'Mở khóa mailbox' : 'Tạm khóa mailbox',
      tone: 'danger',
      details: [
        `Mailbox: ${email}`,
        unlock ? 'Mailbox sẽ nhận lại các yêu cầu đăng nhập.' : 'Mailbox sẽ bị chặn đăng nhập cho đến khi được mở khóa.',
      ],
      field: { kind: 'confirmation', label: 'Nhập chính xác để xác nhận', confirmationText },
      onConfirm: async () => {
        setDialog(null);
        return changeMailboxStatus();
      },
    });
  }

  return (
    <div className="inline-action-stack">
      <div className="danger-zone-actions">
        <button className="button-link button-reset danger" type="button" disabled title="Chưa có API admin reset mật khẩu mailbox an toàn.">
          Reset mật khẩu (chưa khả dụng)
        </button>
        <button className="button-link button-reset danger" type="button" disabled={state.busy !== null || mfaStepUp.active || !supportedStatus} onClick={openMailboxStatusDialog}>
          {unlock ? <UnlockKeyhole size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}
          <span>{state.busy === 'mailbox-status' ? 'Đang xử lý' : unlock ? 'Mở khóa mailbox' : 'Tạm khóa mailbox'}</span>
        </button>
        <button className="button-link button-reset danger" type="button" disabled title="Chưa có API xóa mailbox kèm backup và audit đầy đủ.">
          Xóa mailbox (chưa khả dụng)
        </button>
      </div>
      {!supportedStatus ? <p className="form-alert info">Trạng thái {status} chưa có chuyển đổi an toàn từ màn hình này.</p> : null}
      {state.error ? <p className="form-alert danger" role="alert">{state.error}</p> : null}
      {state.message ? <p className="form-alert success" role="status">{state.message}</p> : null}
      <AdminMfaStepUpModal state={mfaStepUp.modal} onVerify={mfaStepUp.verify} onClose={mfaStepUp.close} />
      <ControlActionDialog state={dialog} value={dialogValue} busy={state.busy !== null} onValueChange={setDialogValue} onClose={() => setDialog(null)} />
    </div>
  );
}

export function SecurityAdminActions({ userId }: Readonly<{ userId: string }>) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(initialState);
  const [dialog, setDialog] = useState<ControlActionDialogConfig | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const mfaStepUp = useAdminMfaStepUp();

  async function rotateKeys(): Promise<boolean> {
    setState({ busy: 'rotate-keys', message: null, error: null });
    try {
      await mfaStepUp.runWithStepUp(() => adminRequest('/api/logimail/admin/keys/rotate', {
        method: 'POST',
        headers: confirmHeaders,
        body: JSON.stringify({}),
      }));
      setState({ busy: null, message: 'Đã hoàn tất một lô xoay khóa credential.', error: null });
      router.refresh();
      return true;
    } catch (error) {
      setState({ busy: null, message: null, error: error instanceof Error ? error.message : 'Không xoay được khóa credential.' });
      return false;
    }
  }

  async function revokeSessions(): Promise<boolean> {
    setState({ busy: 'revoke-sessions', message: null, error: null });
    try {
      await mfaStepUp.runWithStepUp(() => adminRequest('/api/logimail/admin/sessions', {
        method: 'DELETE',
        headers: confirmHeaders,
        body: JSON.stringify({ userId }),
      }));
      await getSupabaseBrowserClient().auth.signOut({ scope: 'local' }).catch(() => undefined);
      setDialog(null);
      router.replace('/auth/login');
      router.refresh();
      return true;
    } catch (error) {
      setState({ busy: null, message: null, error: error instanceof Error ? error.message : 'Không thu hồi được phiên.' });
      return false;
    }
  }

  function openRotateDialog() {
    const confirmationText = 'ROTATE CREDENTIAL KEYS';
    setDialogValue('');
    setDialog({
      actionKey: 'rotate-keys',
      title: 'Xoay khóa credential',
      description: 'LogiMail sẽ xoay một lô khóa mã hóa credential và ghi lại tác vụ trong audit log.',
      confirmLabel: 'Xoay khóa',
      tone: 'danger',
      details: ['Tác vụ chỉ chạy sau khi xác minh MFA thành công.', 'Các mailbox đang hoạt động vẫn được phục vụ trong quá trình xoay.'],
      field: { kind: 'confirmation', label: 'Nhập chính xác để xác nhận', confirmationText },
      onConfirm: async () => {
        setDialog(null);
        return rotateKeys();
      },
    });
  }

  function openRevokeDialog() {
    const confirmationText = 'REVOKE MY SESSIONS';
    setDialogValue('');
    setDialog({
      actionKey: 'revoke-sessions',
      title: 'Thu hồi phiên của tôi',
      description: 'Toàn bộ phiên đăng nhập của tài khoản hiện tại sẽ bị thu hồi và bạn sẽ phải đăng nhập lại.',
      confirmLabel: 'Thu hồi phiên',
      tone: 'danger',
      details: ['Tác vụ chỉ chạy sau khi xác minh MFA thành công.', 'Thiết bị và trình duyệt khác cũng sẽ bị đăng xuất.'],
      field: { kind: 'confirmation', label: 'Nhập chính xác để xác nhận', confirmationText },
      onConfirm: async () => {
        setDialog(null);
        return revokeSessions();
      },
    });
  }

  return (
    <div className="inline-action-stack">
      <div className="danger-zone-actions">
        <button className="button-link button-reset danger" type="button" disabled={state.busy !== null || mfaStepUp.active} onClick={openRotateDialog}>
          <KeyRound size={16} aria-hidden="true" />
          <span>{state.busy === 'rotate-keys' ? 'Đang xoay khóa' : 'Xoay khóa credential'}</span>
        </button>
        <button className="button-link button-reset danger" type="button" disabled={state.busy !== null || mfaStepUp.active} onClick={openRevokeDialog}>
          <LogOut size={16} aria-hidden="true" />
          <span>{state.busy === 'revoke-sessions' ? 'Đang thu hồi' : 'Thu hồi phiên của tôi'}</span>
        </button>
      </div>
      {state.error ? <p className="form-alert danger" role="alert">{state.error}</p> : null}
      {state.message ? <p className="form-alert success" role="status">{state.message}</p> : null}
      <AdminMfaStepUpModal state={mfaStepUp.modal} onVerify={mfaStepUp.verify} onClose={mfaStepUp.close} />
      <ControlActionDialog state={dialog} value={dialogValue} busy={state.busy !== null} onValueChange={setDialogValue} onClose={() => setDialog(null)} />
    </div>
  );
}
