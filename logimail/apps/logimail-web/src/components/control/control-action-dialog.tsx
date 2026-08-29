'use client';

import { useEffect, useId, useMemo, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';

export type ControlActionDialogField =
  | {
      kind: 'textarea';
      label: string;
      placeholder?: string;
      required?: boolean;
      minLength?: number;
    }
  | {
      kind: 'number';
      label: string;
      placeholder?: string;
      min: number;
    }
  | {
      kind: 'confirmation';
      label: string;
      confirmationText: string;
    };

export type ControlActionDialogConfig = {
  actionKey: string;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  details?: string[];
  field?: ControlActionDialogField;
  defaultValue?: string;
  onConfirm: (value: string) => Promise<boolean>;
};

function fieldIsValid(field: ControlActionDialogField | undefined, value: string) {
  if (!field) return true;
  if (field.kind === 'confirmation') return value.trim() === field.confirmationText;
  if (field.kind === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= field.min;
  }
  if (!field.required) return true;
  return value.trim().length >= (field.minLength ?? 1);
}

export function ControlActionDialog({
  state,
  value,
  busy,
  onValueChange,
  onClose,
}: Readonly<{
  state: ControlActionDialogConfig | null;
  value: string;
  busy: boolean;
  onValueChange: (value: string) => void;
  onClose: () => void;
}>) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  const valid = useMemo(() => fieldIsValid(state?.field, value), [state?.field, value]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!state) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (textareaRef.current ?? inputRef.current ?? confirmRef.current)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])'));
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
  }, [onClose, state]);

  if (!state) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section
        ref={dialogRef}
        className={`danger-modal control-action-dialog ${state.tone === 'danger' ? 'danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="modal-header">
          <span className="modal-icon control-action-dialog-icon">
            {state.tone === 'danger' ? <AlertTriangle size={20} aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />}
          </span>
          <div>
            <h2 id={titleId}>{state.title}</h2>
            <p id={descriptionId}>{state.description}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Đóng hộp xác nhận" disabled={busy} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {state.details?.length ? (
          <ul className="control-action-dialog-details">
            {state.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        ) : null}

        <form className="control-action-dialog-form" onSubmit={(event) => {
          event.preventDefault();
          if (valid && !busy) void state.onConfirm(value);
        }}>
          {state.field?.kind === 'textarea' ? (
            <label className="form-field modal-confirm-field">
              <span>{state.field.label}</span>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                placeholder={state.field.placeholder}
                required={state.field.required}
                minLength={state.field.minLength}
                readOnly={busy}
                rows={4}
              />
            </label>
          ) : state.field ? (
            <label className="form-field modal-confirm-field">
              <span>{state.field.label}</span>
              <input
                ref={inputRef}
                type={state.field.kind === 'number' ? 'number' : 'text'}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                placeholder={'placeholder' in state.field ? state.field.placeholder : undefined}
                min={state.field.kind === 'number' ? state.field.min : undefined}
                inputMode={state.field.kind === 'number' ? 'numeric' : undefined}
                autoComplete="off"
                readOnly={busy}
              />
              {state.field.kind === 'confirmation' ? <small>Nhập chính xác <strong>{state.field.confirmationText}</strong> để tiếp tục.</small> : null}
            </label>
          ) : null}

          <div className="modal-actions">
            <button className="button-link button-reset secondary" type="button" disabled={busy} onClick={onClose}>Hủy</button>
            <button ref={confirmRef} className={`button-link button-reset ${state.tone === 'danger' ? 'danger' : 'primary'}`} type="submit" disabled={busy || !valid}>
              {busy ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
              {busy ? 'Đang xử lý' : state.confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
