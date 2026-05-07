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

  return (
    <form action={formAction} className="dashboard-panel p-4">
      <div className="flex items-start gap-3">
        <div className="dashboard-stat-icon shrink-0">
          <Banknote size={18} />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Thông tin ngân hàng nhận tiền</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            Website tự dùng thông tin này để tạo mã VietQR cho từng đơn chuyển khoản.
          </p>
        </div>
      </div>

      <label className="mt-5 grid gap-2 text-sm font-semibold">
        Mã ngân hàng
        <input
          name="bankCode"
          list="settings-bank-codes"
          defaultValue={bankCode ?? ""}
          className="h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm outline-none transition"
          placeholder="VCB"
          required
        />
        <datalist id="settings-bank-codes">
          {bankSuggestions.map((bank) => (
            <option key={bank} value={bank} />
          ))}
        </datalist>
      </label>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Số tài khoản
          <Input name="bankAccount" defaultValue={bankAccount ?? ""} inputMode="numeric" placeholder="1234567890" required />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Tên chủ tài khoản
          <Input name="bankAccountName" defaultValue={bankAccountName ?? ""} placeholder="CONG TY TNHH ABC" required />
        </label>
      </div>

      {state?.error && <p className="mt-4 text-sm text-[var(--accent-strong)]">{state.error}</p>}
      {state?.success && <p className="mt-4 text-sm text-[var(--primary-strong)]">{state.success}</p>}

      <Button className="mt-5" disabled={pending}>
        <Save size={16} />
        {pending ? "Đang lưu…" : "Lưu thông tin VietQR"}
      </Button>
    </form>
  );
}
