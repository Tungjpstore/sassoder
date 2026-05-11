"use client";

import { useActionState } from "react";
import { ArrowRight, KeyRound, LockKeyhole, ShieldAlert, ShieldCheck } from "lucide-react";
import { platformAdminLoginAction } from "@/app/admin/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type PlatformAdminLoginProps = {
  configured: boolean;
  devFallbackEnabled: boolean;
  requiresFirstPasswordChange: boolean;
  sessionTtlHours: number;
};

export function PlatformAdminLogin({
  configured,
  devFallbackEnabled,
  requiresFirstPasswordChange,
  sessionTtlHours
}: PlatformAdminLoginProps) {
  const [state, formAction, pending] = useActionState(platformAdminLoginAction, undefined);

  return (
    <main className="stitch-admin min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_420px]">
        <section className="space-y-8">
          <LogiVNLogo href="/" className="h-11" priority />
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--primary)]/15 bg-[var(--surface-strong)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
              <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
              Dev control plane
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)] md:text-6xl">
              /admin dành riêng cho đội phát triển LogiVN.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--muted-foreground)]">
              Theo dõi toàn bộ tenant, cấu hình vận hành, trạng thái auth, báo cáo, tính năng đặt online, đặt bàn và các cảnh báo
              cần xử lý trước khi thương mại hoá.
            </p>
          </div>
          <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              { label: "Tenant control", value: "100-300 quán" },
              { label: "Security", value: "Cookie nội bộ" },
              { label: "Session", value: `${sessionTtlHours} giờ` }
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{item.label}</p>
                <p className="mt-3 text-lg font-semibold text-[var(--foreground)]">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <form action={formAction} className="rounded-3xl border border-[var(--border)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-soft)]">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)] text-[#FFF7EB]">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Mở khoá dev console</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Nhập mật khẩu nội bộ. Mật khẩu được kiểm tra ở server và chỉ tạo cookie HTTP-only cho namespace `/admin`.
          </p>

          {!configured ? (
            <div className="mt-5 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-4 text-sm leading-6 text-[var(--accent-strong)]">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4" />
                Chưa cấu hình bảo vệ production
              </div>
              Thêm `PLATFORM_ADMIN_PASSWORD` và `PLATFORM_ADMIN_SESSION_SECRET` vào Vercel trước khi mở `/admin`.
            </div>
          ) : null}

          {devFallbackEnabled ? (
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] p-4 text-sm leading-6 text-[var(--muted-foreground)]">
              Local dev đang bật mật khẩu tạm: <span className="font-semibold text-[var(--foreground)]">local-dev-admin</span>.
            </div>
          ) : null}

          {configured && requiresFirstPasswordChange ? (
            <div className="mt-5 rounded-2xl border border-[var(--primary)]/15 bg-[var(--primary-soft)] p-4 text-sm leading-6 text-[var(--primary)]">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4" />
                Mật khẩu tạm đang bật
              </div>
              Sau lần đăng nhập đầu tiên, bạn sẽ được yêu cầu đổi sang mật khẩu riêng. Mật khẩu tạm sẽ không còn dùng cho các
              lần sau.
            </div>
          ) : null}

          <label className="mt-5 grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            Mật khẩu nội bộ
            <span className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--outline)]" />
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] pl-11 pr-4 text-base outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10 disabled:bg-[var(--surface-container)]"
                placeholder="Nhập mật khẩu /admin"
                disabled={!configured || pending}
                required
              />
            </span>
          </label>

          {state?.error ? (
            <p className="mt-4 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3 text-sm font-medium text-[var(--accent-strong)]">{state.error}</p>
          ) : null}

          <button
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold uppercase tracking-[0.12em] text-[#FFF7EB] transition hover:bg-[var(--accent-hover)] disabled:pointer-events-none disabled:opacity-50"
            disabled={!configured || pending}
          >
            {pending ? "Đang kiểm tra..." : "Vào /admin"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </main>
  );
}
