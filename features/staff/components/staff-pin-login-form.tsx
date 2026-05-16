"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowRight, Building2, Delete, Fingerprint, LockKeyhole, ShieldCheck } from "lucide-react";
import { pinLoginAction } from "@/app/dashboard/actions/auth";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type StaffPinLoginFormProps = {
  restaurantSlug?: string;
  restaurantName?: string | null;
  mode: "gate" | "pin";
};

const recentRestaurantSlugKey = "logivn:staff-last-restaurant-slug:v1";
const recentRestaurantSlugEvent = "logivn:staff-last-restaurant-slug-updated";

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readRecentRestaurantSlug() {
  if (typeof window === "undefined") return "";
  try {
    return normalizeSlug(window.localStorage.getItem(recentRestaurantSlugKey) ?? "");
  } catch {
    return "";
  }
}

function subscribeRecentRestaurantSlug(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handleUpdate = () => callback();
  window.addEventListener("storage", handleUpdate);
  window.addEventListener(recentRestaurantSlugEvent, handleUpdate);
  return () => {
    window.removeEventListener("storage", handleUpdate);
    window.removeEventListener(recentRestaurantSlugEvent, handleUpdate);
  };
}

function notifyRecentRestaurantSlugChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(recentRestaurantSlugEvent));
}

export function StaffPinLoginForm({ restaurantSlug = "", restaurantName, mode }: StaffPinLoginFormProps) {
  const router = useRouter();
  const normalizedRestaurantSlug = normalizeSlug(restaurantSlug);
  const storedRecentSlug = useSyncExternalStore(subscribeRecentRestaurantSlug, readRecentRestaurantSlug, () => "");
  const [slug, setSlug] = useState(normalizedRestaurantSlug);
  const [pin, setPin] = useState("");
  const [state, formAction, pending] = useActionState(pinLoginAction, undefined);
  const recentSlug = mode === "pin" && normalizedRestaurantSlug ? normalizedRestaurantSlug : storedRecentSlug;

  useEffect(() => {
    if (mode !== "pin" || !normalizedRestaurantSlug) return;
    try {
      window.localStorage.setItem(recentRestaurantSlugKey, normalizedRestaurantSlug);
      notifyRecentRestaurantSlugChanged();
    } catch {
      // Ignore storage failures so PIN login never depends on browser persistence.
    }
  }, [mode, normalizedRestaurantSlug]);

  const rememberRestaurantSlug = (value: string) => {
    const normalized = normalizeSlug(value);
    if (!normalized) return normalized;
    try {
      window.localStorage.setItem(recentRestaurantSlugKey, normalized);
      notifyRecentRestaurantSlugChanged();
    } catch {
      // Best-effort only.
    }
    return normalized;
  };

  const handleGateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = rememberRestaurantSlug(slug);
    if (!normalized || normalized.length < 2) return;
    router.push(`/staff/${normalized}/login`);
  };

  const appendPin = (value: string) => {
    setPin((current) => (current.length >= 8 ? current : `${current}${value}`));
  };

  return (
    <main className="stitch-admin min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(15,77,58,0.13),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(242,140,40,0.11),transparent_24%)]" />

        <header className="relative z-[1] flex items-center justify-between">
          <LogiVNLogo href="/" className="h-9" priority />
          <Link href="/dashboard/login" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-black text-[var(--muted-foreground)]">
            Chủ quán đăng nhập
          </Link>
        </header>

        <div className="relative z-[1] grid flex-1 items-center gap-6 py-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.65fr)]">
          <section className="hidden rounded-[32px] border border-[var(--border)] bg-[linear-gradient(135deg,#0F4D3A,#133C31_58%,#F28C28_132%)] p-6 text-[#FFF7EB] shadow-[var(--shadow-lift)] lg:block">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/70">
              <ShieldCheck size={16} />
              Khu vực nhân viên
            </div>
            <h1 className="mt-8 max-w-lg text-5xl font-black leading-[0.95] tracking-[-0.06em]">
              Vào ca nhanh. Không chen vào tài khoản chủ quán.
            </h1>
            <p className="mt-5 max-w-md text-sm font-semibold leading-6 text-white/72">
              PIN staff chạy ở luồng riêng cho từng quán, phù hợp kiosk/PWA tại chi nhánh. Dashboard chủ quán vẫn dùng Google/email như bình thường.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-3">
              {[
                ["PIN riêng", "4-8 số"],
                ["Theo quán", "slug cố định"],
                ["Bảo mật", "rate limit"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-white/18 bg-white/10 p-4 backdrop-blur">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/58">{label}</p>
                  <p className="mt-2 text-lg font-black">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto w-full max-w-[420px] rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lift)] sm:p-5">
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-container)] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary)] text-[#FFF7EB]">
                  {mode === "pin" ? <LockKeyhole size={22} /> : <Building2 size={22} />}
                </span>
                <span className="rounded-full border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-3 py-1 text-xs font-black text-[var(--primary)]">
                  Staff PIN
                </span>
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-[-0.04em]">
                {mode === "pin" ? restaurantName || restaurantSlug || "Đăng nhập ca" : "Chọn quán để vào ca"}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
                {mode === "pin"
                  ? "Nhập PIN được quản lý cấp để mở màn hình vận hành nhân viên."
                  : "Nhập mã quán một lần, sau đó nhân viên chỉ dùng màn PIN riêng của quán."}
              </p>
            </div>

            {mode === "gate" ? (
              <form onSubmit={handleGateSubmit} className="mt-4 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Mã quán</span>
                  <input
                    value={slug}
                    onChange={(event) => setSlug(normalizeSlug(event.target.value))}
                    placeholder="vi-du: cn-cau-giay"
                    className="h-14 rounded-2xl border px-4 text-base font-black outline-none"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </label>
                <button type="submit" disabled={normalizeSlug(slug).length < 2} className="dashboard-primary-action min-h-14 rounded-2xl disabled:opacity-50">
                  Tiếp tục
                  <ArrowRight size={17} />
                </button>
                {recentSlug ? (
                  <button
                    type="button"
                    onClick={() => {
                      const normalized = rememberRestaurantSlug(recentSlug);
                      if (normalized) router.push(`/staff/${normalized}/login`);
                    }}
                    className="min-h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] px-4 text-xs font-black text-[var(--muted-foreground)]"
                  >
                    Quán gần đây: {recentSlug}
                  </button>
                ) : null}
              </form>
            ) : (
              <form action={formAction} className="mt-4 grid gap-4">
                <input type="hidden" name="restaurantSlug" value={restaurantSlug} />
                <input type="hidden" name="pin" value={pin} />

                <div className="grid gap-2 text-center">
                  <div className="mx-auto flex h-14 min-w-52 items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <span key={index} className={`h-3 w-3 rounded-full ${index < pin.length ? "bg-[var(--primary)]" : "bg-[var(--surface-container-highest)]"}`} />
                    ))}
                  </div>
                  {state?.error ? <p className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-[var(--accent-strong)]">{state.error}</p> : null}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => appendPin(value)}
                      className="min-h-16 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] text-2xl font-black shadow-sm active:scale-[0.98]"
                    >
                      {value}
                    </button>
                  ))}
                  <button type="button" onClick={() => setPin("")} className="min-h-16 rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] text-sm font-black">
                    Xoá
                  </button>
                  <button type="button" onClick={() => appendPin("0")} className="min-h-16 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] text-2xl font-black shadow-sm active:scale-[0.98]">
                    0
                  </button>
                  <button type="button" onClick={() => setPin((current) => current.slice(0, -1))} className="grid min-h-16 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-container)]">
                    <Delete size={20} />
                  </button>
                </div>

                <button type="submit" disabled={pending || pin.length < 4} className="dashboard-primary-action min-h-14 rounded-2xl disabled:opacity-50">
                  <Fingerprint size={17} />
                  {pending ? "Đang kiểm tra..." : "Vào ca"}
                </button>
              </form>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
