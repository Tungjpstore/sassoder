"use client";

import { useActionState } from "react";
import { Banknote, Save } from "lucide-react";
import { updatePaymentSettingsAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const bankSuggestions = ["VCB", "TCB", "ACB", "BIDV", "MB", "VPB", "TPB", "VIB", "MSB", "OCB"];

export function PaymentSettingsForm({
  bankCode,
  bankAccount,
  bankAccountName
}: {
  bankCode?: string | null;
  bankAccount?: string | null;
  bankAccountName?: string | null;
}) {
  const [state, formAction, pending] = useActionState(updatePaymentSettingsAction, undefined);
  const isConfigured = Boolean(bankCode && bankAccount && bankAccountName);

  return (
    <form action={formAction} className="dashboard-panel p-5 md:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <div className="dashboard-stat-icon shrink-0">
          <Banknote size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Thông tin ngân hàng nhận tiền</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            Website tự dùng thông tin này để tạo mã VietQR cho từng đơn chuyển khoản.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Trạng thái</p>
          <p className="mt-2 text-base font-semibold text-[var(--foreground)]">
            {isConfigured ? "VietQR sẵn sàng" : "Chưa đủ thông tin"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {isConfigured ? "Đơn chuyển khoản có thể tạo QR tự động." : "Bổ sung đủ 3 trường để nhận tiền đúng tài khoản."}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Ngân hàng</p>
          <p className="mt-2 text-base font-semibold text-[var(--foreground)]">{bankCode || "Chưa chọn"}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Mã viết tắt theo chuẩn VietQR.</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Tài khoản nhận tiền</p>
          <p className="mt-2 text-base font-semibold text-[var(--foreground)]">{bankAccount || "Chưa có số tài khoản"}</p>
          <p className="mt-1 truncate text-sm text-[var(--muted-foreground)]">{bankAccountName || "Chưa có tên chủ tài khoản"}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] p-4 md:grid-cols-[180px_1fr_1fr]">
        <label className="grid gap-2 text-sm font-semibold">
          Mã ngân hàng
          <input
            name="bankCode"
            list="settings-bank-codes"
            defaultValue={bankCode ?? ""}
            className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
            placeholder="VCB"
            autoComplete="off"
            required
          />
          <span className="text-xs font-medium text-[var(--muted-foreground)]">Ví dụ: VCB, TCB hoặc MB.</span>
          <datalist id="settings-bank-codes">
            {bankSuggestions.map((bank) => (
              <option key={bank} value={bank} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Số tài khoản
          <Input name="bankAccount" defaultValue={bankAccount ?? ""} inputMode="numeric" placeholder="1234567890" autoComplete="off" required />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Tên chủ tài khoản
          <Input name="bankAccountName" defaultValue={bankAccountName ?? ""} placeholder="CONG TY TNHH ABC" autoComplete="off" required />
        </label>
      </div>

      {state?.error && <p role="alert" className="mt-4 text-sm text-[var(--accent-strong)]">{state.error}</p>}
      {state?.success && <p aria-live="polite" className="mt-4 text-sm text-[var(--primary-strong)]">{state.success}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
        <p className="text-sm text-[var(--muted-foreground)]">
          LogiVN sẽ dùng cấu hình này cho QR thanh toán tại bàn, đơn online và các khoản gia hạn cần chuyển khoản.
        </p>
        <Button disabled={pending}>
          <Save size={16} aria-hidden="true" />
          {pending ? "Đang lưu…" : "Lưu thông tin VietQR"}
        </Button>
      </div>
    </form>
  );
}
