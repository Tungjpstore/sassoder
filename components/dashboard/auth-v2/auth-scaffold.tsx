"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { fontVars } from "@/components/landing-v2/fonts";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { cn } from "@/lib/utils";

/* ============================================================
 * LogiVN Auth v2 — khung dùng chung cho mọi màn đăng nhập /
 * đăng ký / xác thực / đặt lại mật khẩu.
 *
 * Bọc dưới [data-dash="v2"] + fontVars để đồng bộ 100% nhận diện
 * với Dashboard v2 (token --d-*, font Sora/Inter). Bỏ toàn bộ hex
 * hard-code của bản cũ.
 * ============================================================ */

/** Khung trang auth — 1 cột căn giữa, gọn và hiện đại. */
export function AuthScaffold({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-dash="v2"
      className={cn(
        fontVars,
        "relative flex min-h-svh w-full flex-col items-center justify-center overflow-x-hidden bg-[var(--d-bg)] px-4 py-10 text-[var(--d-text)] sm:px-6"
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-24 -top-24 h-80 w-80 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(15,77,58,0.14) 0%, transparent 70%)" }}
        />
        <div
          className="absolute -right-24 bottom-0 h-80 w-80 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(242,140,40,0.12) 0%, transparent 70%)" }}
        />
      </div>
      <div className="relative z-10 w-full max-w-[440px]">{children}</div>
    </main>
  );
}

/** Header trên card: logo (mobile) + tiêu đề + phụ đề. */
export function AuthHeader({
  title,
  subtitle,
  meta
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col items-center text-center">
      <LogiVNLogo href="/" className="h-9" priority />
      <h1 className="mt-4 font-[var(--d-font-display)] text-[1.625rem] font-bold leading-[var(--d-lh-tight)] tracking-[var(--d-track-tight)] text-[var(--d-text)]">
        {title}
      </h1>
      {subtitle ? <p className="mt-2 text-[length:var(--d-fs-sm)] leading-[var(--d-lh-body)] text-[var(--d-text-muted)]">{subtitle}</p> : null}
      {meta ? <div className="mt-2">{meta}</div> : null}
    </div>
  );
}

/** Card surface chuẩn v2. */
export function AuthCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "w-full rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-5 shadow-[var(--d-sh-md)] sm:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Input field chuẩn v2, hỗ trợ nhãn, lỗi và nút hiện/ẩn mật khẩu. */
type AuthFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: React.ReactNode;
  labelAddon?: React.ReactNode;
  hint?: React.ReactNode;
};

export const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, labelAddon, hint, type = "text", className, ...props },
  ref
) {
  const [show, setShow] = React.useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && show ? "text" : type;

  return (
    <label className="grid gap-1.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {labelAddon}
      </span>
      <span className="relative block">
        <input
          ref={ref}
          type={resolvedType}
          className={cn(
            "h-11 w-full rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-medium leading-6 text-[var(--d-text)] outline-none transition placeholder:text-[var(--d-text-faint)] focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/15",
            isPassword && "pr-12",
            className
          )}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[var(--d-r-md)] text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"
            aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            tabIndex={-1}
          >
            {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        ) : null}
      </span>
      {hint ? <span className="text-[length:var(--d-fs-xs)] font-medium text-[var(--d-text-muted)]">{hint}</span> : null}
    </label>
  );
});

/** Nút đăng nhập Google dùng chung. */
export function GoogleButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:border-[var(--d-jade)] hover:bg-[var(--d-surface-2)]"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      {label}
    </a>
  );
}

/** Divider "hoặc". */
export function AuthDivider({ label = "hoặc" }: { label?: string }) {
  return (
    <div className="my-4 flex items-center gap-3 text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">
      <span className="h-px flex-1 bg-[var(--d-line)]" />
      {label}
      <span className="h-px flex-1 bg-[var(--d-line)]" />
    </div>
  );
}

/** Alert phản hồi: ok / warn / danger / info. */
export function AuthAlert({
  tone = "danger",
  children,
  className
}: {
  tone?: "ok" | "warn" | "danger" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    ok: "border-[var(--d-ok-fg)]/25 bg-[var(--d-ok-bg)] text-[var(--d-ok-fg)]",
    warn: "border-[var(--d-warn-fg)]/30 bg-[var(--d-warn-bg)] text-[var(--d-warn-fg)]",
    danger: "border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]",
    info: "border-[var(--d-info-fg)]/25 bg-[var(--d-info-bg)] text-[var(--d-info-fg)]"
  };
  return (
    <div className={cn("rounded-[var(--d-r-md)] border px-3.5 py-3 text-[length:var(--d-fs-sm)] font-semibold leading-5", tones[tone], className)}>
      {children}
    </div>
  );
}

/** Nút submit chính. */
export function AuthSubmit({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex h-11 w-full items-center justify-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-5 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] shadow-[var(--d-sh-sm)] transition hover:bg-[var(--d-jade-700)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-55",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Nút phụ (outline). */
export function AuthSecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex h-11 w-full items-center justify-center rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-jade)] transition hover:border-[var(--d-jade)] hover:bg-[var(--d-surface-2)] disabled:pointer-events-none disabled:opacity-55",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
