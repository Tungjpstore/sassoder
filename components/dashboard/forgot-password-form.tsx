"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { requestPasswordResetAction } from "@/app/dashboard/actions";
import { AuthAlert, AuthCard, AuthField, AuthHeader, AuthScaffold, AuthSubmit } from "@/components/dashboard/auth-v2/auth-scaffold";

export function ForgotPasswordForm({ initialEmail = "", nextPath = "", expired = false }: { initialEmail?: string; nextPath?: string; expired?: boolean }) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, undefined);

  useEffect(() => {
    if (state?.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state?.redirectTo]);

  return (
    <AuthScaffold>
      <AuthHeader title="Quên mật khẩu" subtitle="Nhập email để LogiVN gửi mã đặt lại mật khẩu." />

      <AuthCard>
        {expired ? (
          <AuthAlert tone="warn" className="mb-4">
            Mã đặt lại đã hết hạn.
          </AuthAlert>
        ) : null}

        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="next" value={nextPath} />
          <AuthField label="Email" name="email" type="email" defaultValue={initialEmail} placeholder="admin@example.com" autoComplete="email" required />

          {state?.error ? <AuthAlert tone="warn">{state.error}</AuthAlert> : null}
          {state?.success ? <AuthAlert tone="ok">{state.success}</AuthAlert> : null}

          <AuthSubmit className="mt-2" disabled={pending}>
            {pending ? "Đang gửi..." : "Gửi mã"}
          </AuthSubmit>
        </form>

        <Link
          href={nextPath ? `/dashboard/login?next=${encodeURIComponent(nextPath)}` : "/dashboard/login"}
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-jade)] transition hover:text-[var(--d-jade-700)]"
        >
          Đăng nhập
        </Link>
      </AuthCard>
    </AuthScaffold>
  );
}
