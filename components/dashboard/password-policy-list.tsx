"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { getAuthPasswordPolicyStatus } from "@/lib/auth-password-policy";

type PasswordPolicyListProps = {
  password: string;
  confirmPassword?: string;
};

export function PasswordPolicyList({ password, confirmPassword }: PasswordPolicyListProps) {
  const checks = getAuthPasswordPolicyStatus(password);
  const matchCheck =
    confirmPassword === undefined
      ? []
      : [
          {
            id: "match",
            label: "Mật khẩu xác nhận khớp",
            passed: confirmPassword.length > 0 && password === confirmPassword
          }
        ];

  return (
    <ul
      aria-label="Yêu cầu mật khẩu"
      className="grid gap-2 rounded-[var(--d-r-md,0.75rem)] border border-[var(--d-line,#e3e8e4)] bg-[var(--d-surface-2,#f2f5ef)] p-3 text-xs font-semibold leading-5 text-[var(--d-text-muted,#586259)] sm:grid-cols-2"
    >
      {[...checks, ...matchCheck].map((item) => {
        const Icon = item.passed ? CheckCircle2 : Circle;
        return (
          <li key={item.id} className={item.passed ? "flex items-center gap-2 text-[var(--d-ok-fg,#1c6b3f)]" : "flex items-center gap-2"}>
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
