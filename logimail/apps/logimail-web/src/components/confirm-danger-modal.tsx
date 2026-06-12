'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function ConfirmDangerModal({
  triggerLabel,
  title,
  children,
  confirmText,
  actionLabel,
}: Readonly<{
  triggerLabel: string;
  title: string;
  children: React.ReactNode;
  confirmText: string;
  actionLabel: string;
}>) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const confirmed = useMemo(() => value.trim() === confirmText, [value, confirmText]);

  return (
    <>
      <button className="button-link button-reset danger" type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="danger-modal" role="dialog" aria-modal="true" aria-labelledby="danger-modal-title">
            <div className="modal-header">
              <span className="modal-icon"><AlertTriangle size={20} aria-hidden="true" /></span>
              <div>
                <h2 id="danger-modal-title">{title}</h2>
                <p>Hành động nhạy cảm cần xác nhận rõ ràng và route server-side có audit trước khi chạy thật.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng" onClick={() => setOpen(false)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            <label className="form-field modal-confirm-field">
              <span>Nhập <strong>{confirmText}</strong> để tiếp tục</span>
              <input value={value} onChange={(event) => setValue(event.target.value)} />
            </label>
            <div className="modal-actions">
              <button className="button-link button-reset secondary" type="button" onClick={() => setOpen(false)}>
                Hủy
              </button>
              <button className="button-link button-reset danger" type="button" disabled={!confirmed} onClick={() => setOpen(false)}>
                {actionLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
