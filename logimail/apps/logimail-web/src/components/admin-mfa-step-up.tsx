'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { KeyRound, Loader2, ShieldAlert, X } from 'lucide-react';

import {
  AdminMfaVerificationError,
  isMfaRequiredError,
  loadVerifiedTotpFactor,
  verifyTotpAndRetry,
} from '@/lib/admin-mfa-step-up';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type ModalState =
  | { mode: 'challenge'; factorId: string; factorLabel: string | null; busy: boolean; error: string | null }
  | { mode: 'no_factor'; busy: false; error: null }
  | { mode: 'unavailable'; busy: false; error: null };

type PendingAction =
  | {
      kind: 'challenge';
      action: () => Promise<unknown>;
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    }
  | {
      kind: 'blocked';
      reject: (reason: unknown) => void;
    };

class AdminMfaStepUpCancelledError extends Error {
  constructor(message = 'Đã hủy xác thực MFA. Thao tác quản trị chưa được thực hiện.') {
    super(message);
    this.name = 'AdminMfaStepUpCancelledError';
  }
}

export function useAdminMfaStepUp() {
  const [modal, setModal] = useState<ModalState | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const verificationInFlightRef = useRef(false);

  const close = useCallback(() => {
    if (verificationInFlightRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    setModal(null);
    pending?.reject(new AdminMfaStepUpCancelledError());
  }, []);

  const runWithStepUp = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    if (pendingRef.current) {
      throw new Error('Một yêu cầu xác thực MFA khác đang chờ hoàn tất.');
    }

    try {
      return await action();
    } catch (error) {
      if (!isMfaRequiredError(error)) throw error;

      const mfa = getSupabaseBrowserClient().auth.mfa;
      let factor;
      try {
        factor = await loadVerifiedTotpFactor(mfa);
      } catch {
        return await new Promise<T>((_resolve, reject) => {
          pendingRef.current = { kind: 'blocked', reject };
          setModal({ mode: 'unavailable', busy: false, error: null });
        });
      }

      if (!factor) {
        return await new Promise<T>((_resolve, reject) => {
          pendingRef.current = { kind: 'blocked', reject };
          setModal({ mode: 'no_factor', busy: false, error: null });
        });
      }

      return await new Promise<T>((resolve, reject) => {
        pendingRef.current = {
          kind: 'challenge',
          action,
          resolve: (value) => resolve(value as T),
          reject,
        };
        setModal({
          mode: 'challenge',
          factorId: factor.id,
          factorLabel: factor.friendly_name?.trim() || null,
          busy: false,
          error: null,
        });
      });
    }
  }, []);

  const verify = useCallback(async (code: string) => {
    if (verificationInFlightRef.current) return;
    const pending = pendingRef.current;
    const currentModal = modal;
    if (!pending || pending.kind !== 'challenge' || currentModal?.mode !== 'challenge') return;

    verificationInFlightRef.current = true;
    setModal({ ...currentModal, busy: true, error: null });
    try {
      const result = await verifyTotpAndRetry({
        mfa: getSupabaseBrowserClient().auth.mfa,
        factorId: currentModal.factorId,
        code,
        retry: pending.action,
      });
      pendingRef.current = null;
      setModal(null);
      pending.resolve(result);
    } catch (error) {
      if (error instanceof AdminMfaVerificationError) {
        setModal({ ...currentModal, busy: false, error: error.message });
      } else {
        pendingRef.current = null;
        setModal(null);
        pending.reject(error);
      }
    } finally {
      verificationInFlightRef.current = false;
    }
  }, [modal]);

  return {
    active: modal !== null,
    modal,
    runWithStepUp,
    verify,
    close,
  };
}

export function AdminMfaStepUpModal({
  state,
  onVerify,
  onClose,
}: Readonly<{
  state: ModalState | null;
  onVerify: (code: string) => Promise<void>;
  onClose: () => void;
}>) {
  const [code, setCode] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const modalRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const modalMode = state?.mode ?? null;
  const modalFactorId = state?.mode === 'challenge' ? state.factorId : null;
  const modalBusy = state?.busy ?? false;
  const modalBusyRef = useRef(modalBusy);

  useEffect(() => {
    modalBusyRef.current = modalBusy;
  }, [modalBusy]);

  const handleClose = useCallback(() => {
    setCode('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!modalMode) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = modalMode === 'challenge' ? inputRef.current : closeRef.current;
    focusTarget?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !modalBusyRef.current) {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [handleClose, modalFactorId, modalMode]);

  if (!state) return null;

  const challenge = state.mode === 'challenge';
  const description = state.mode === 'no_factor'
    ? 'Tài khoản này chưa có TOTP đã xác minh nên không thể nâng phiên lên AAL2. Hãy liên hệ owner để hoàn tất đăng ký MFA, sau đó đăng nhập lại và thử thao tác.'
    : state.mode === 'unavailable'
      ? 'LogiMail không đọc được danh sách factor MFA. Thao tác chưa được chạy lại; hãy đăng nhập lại hoặc thử sau.'
      : `Nhập mã 6 số từ ứng dụng xác thực${state.factorLabel ? ` (${state.factorLabel})` : ''}.`;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !state.busy) handleClose();
    }}>
      <section ref={modalRef} className="danger-modal admin-mfa-modal" role="dialog" aria-modal="true" aria-busy={state.busy} aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="modal-header">
          <span className="modal-icon admin-mfa-icon">{challenge ? <KeyRound size={20} aria-hidden="true" /> : <ShieldAlert size={20} aria-hidden="true" />}</span>
          <div>
            <h2 id={titleId}>{challenge ? 'Xác minh thao tác quản trị' : 'Chưa thể xác minh MFA'}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Đóng xác thực MFA" disabled={state.busy} onClick={handleClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {challenge ? (
          <form key={`${state.mode}-${modalFactorId ?? 'none'}`} className="admin-mfa-form" onSubmit={(event) => {
            event.preventDefault();
            if (code.length === 6) void onVerify(code).finally(() => setCode(''));
          }}>
            <label className="form-field modal-confirm-field">
              <span>Mã xác thực một lần</span>
              <input
                ref={inputRef}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                aria-invalid={Boolean(state.error)}
                aria-describedby={state.error ? `${descriptionId}-error` : undefined}
                readOnly={state.busy}
              />
            </label>
            {state.error ? <p id={`${descriptionId}-error`} className="form-alert danger" role="alert">{state.error}</p> : null}
            <div className="modal-actions">
              <button className="button-link button-reset secondary" type="button" disabled={state.busy} onClick={handleClose}>Hủy</button>
              <button className="button-link button-reset primary" type="submit" disabled={state.busy || code.length !== 6}>
                {state.busy ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
                {state.busy ? 'Đang xác minh' : 'Xác minh và tiếp tục'}
              </button>
            </div>
          </form>
        ) : (
          <div className="modal-actions admin-mfa-blocked-actions">
            <button ref={closeRef} className="button-link button-reset primary" type="button" onClick={handleClose}>Đã hiểu</button>
          </div>
        )}
      </section>
    </div>
  );
}
