'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { AdminMfaStepUpModal, useAdminMfaStepUp } from '@/components/admin-mfa-step-up';
import { ACCOUNT_DELETE_CONFIRMATION } from '@/lib/account-deletion';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type ApiEnvelope = { ok: true; data: { deleted: true } } | { ok: false; error: { code?: string; message?: string } };

class AccountDeleteRequestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AccountDeleteRequestError';
  }
}

async function requestAccountDeletion(password: string, confirmation: string) {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) throw new AccountDeleteRequestError('unauthorized', 'Phiên đăng nhập đã hết hạn.');

  const response = await fetch('/api/logimail/account/delete', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${data.session.access_token}`,
      'x-logimail-confirm': 'I_UNDERSTAND_LOGIMAIL_RISK',
    },
    body: JSON.stringify({ password, confirmation }),
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope | null;
  if (!response.ok || !payload?.ok) {
    const errorBody = payload && !payload.ok ? payload.error : null;
    throw new AccountDeleteRequestError(errorBody?.code ?? 'account_delete_failed', errorBody?.message ?? 'Chưa thể xóa tài khoản.');
  }
}

export function AccountDeleteForm() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mfaStepUp = useAdminMfaStepUp();
  const valid = password.length >= 10 && confirmation === ACCOUNT_DELETE_CONFIRMATION;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await mfaStepUp.runWithStepUp(() => requestAccountDeletion(password, confirmation));
      await fetch('/api/logimail/mail/session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }).catch(() => undefined);
      await getSupabaseBrowserClient().auth.signOut({ scope: 'local' }).catch(() => undefined);
      window.location.replace('/auth/login');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Chưa thể xóa tài khoản.');
      setLoading(false);
    }
  }

  return (
    <>
      <form className="stack-form account-delete-form" onSubmit={submit}>
        <p className="form-alert danger">Xóa tài khoản sẽ đăng xuất mọi phiên, gỡ quyền mailbox và xóa mailbox BillionMail mà bạn sở hữu riêng. Workspace bạn đang sở hữu phải được chuyển giao trước.</p>
        {error ? <p className="form-alert danger" role="alert">{error}</p> : null}
        <label className="form-field">
          <span>Mật khẩu hiện tại để xác thực lại</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={10} maxLength={128} required readOnly={loading} />
        </label>
        <label className="form-field">
          <span>Nhập chính xác {ACCOUNT_DELETE_CONFIRMATION}</span>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" maxLength={64} required readOnly={loading} />
        </label>
        <button className="button-link button-reset danger" type="submit" disabled={!valid || loading || mfaStepUp.active}>
          {loading ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
          <span>{loading ? 'Đang xóa tài khoản' : 'Xóa tài khoản LogiMail'}</span>
        </button>
      </form>
      <AdminMfaStepUpModal state={mfaStepUp.modal} onVerify={mfaStepUp.verify} onClose={mfaStepUp.close} />
    </>
  );
}
