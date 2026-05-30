"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { Building2, CheckCircle2, ChevronRight, Clock3, Delete, Fingerprint, LockKeyhole, MapPin, ShieldCheck, Store } from "lucide-react";
import { pinLoginAction } from "@/app/dashboard/actions/auth";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { cn } from "@/lib/utils";

type StaffPinLoginFormProps = {
  restaurantSlug?: string;
  restaurantName?: string | null;
  mode: "gate" | "pin";
  nextPath?: string;
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

const featureItems = [
  { icon: CheckCircle2, label: "Check-in", text: "Vào ca nhanh" },
  { icon: MapPin, label: "GPS/QR", text: "Đúng vị trí" },
  { icon: LockKeyhole, label: "PIN", text: "Tách quyền" }
];

function staffLoginPath(slug: string, nextPath?: string) {
  const path = `/staff/${slug}/login`;
  if (!nextPath) return path;
  const params = new URLSearchParams({ next: nextPath });
  return `${path}?${params.toString()}`;
}

export function StaffPinLoginForm({ restaurantSlug = "", restaurantName, mode, nextPath = "" }: StaffPinLoginFormProps) {
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
      // PIN login must not depend on browser storage.
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
    router.push(staffLoginPath(normalized, nextPath));
  };

  const appendPin = (value: string) => {
    setPin((current) => (current.length >= 8 ? current : `${current}${value}`));
  };

  return (
    <main className="stitch-admin dashboard-density admin-shell-bg min-h-screen overflow-x-clip text-[var(--foreground)]">
      <section className="relative z-[1] mx-auto grid min-h-screen w-full max-w-6xl content-start gap-4 px-4 py-[calc(1rem+env(safe-area-inset-top))] sm:px-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center lg:py-8">
        <header className="flex items-center justify-between lg:col-span-2">
          <LogiVNLogo href="/" className="h-9" priority />
          <Link href="/dashboard/login" className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]/30">
            Chủ quán
          </Link>
        </header>

        <div className="hidden min-w-0 lg:grid lg:gap-3">
          <section className="admin-hero-panel rounded-[14px] p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="dashboard-eyebrow">LogiVN Staff</p>
                <h1 className="dashboard-page-title mt-2 max-w-xl text-[var(--foreground)]">Vào ca đúng người, đúng quán, đúng thời điểm.</h1>
                <p className="dashboard-body-copy mt-3 max-w-lg">Màn PIN dành cho nhân viên vận hành: mở app, xác thực, chấm công và bắt đầu ca làm trong vài giây.</p>
              </div>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]">
                <ShieldCheck size={22} aria-hidden="true" />
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {featureItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                    <Icon size={17} className="text-[var(--primary)]" aria-hidden="true" />
                    <p className="mt-2 truncate text-sm font-semibold text-[var(--foreground)]">{item.label}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-[var(--muted-foreground)]">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="dashboard-panel grid grid-cols-3 gap-2 rounded-[14px] p-3">
            {[
              { icon: Fingerprint, label: "PIN", value: "4-8 số" },
              { icon: Store, label: "Quán", value: restaurantName || restaurantSlug || recentSlug || "Chọn quán" },
              { icon: Clock3, label: "Ca", value: "Staff app" }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <Icon size={16} className="text-[var(--accent-strong)]" aria-hidden="true" />
                  <p className="mt-2 truncate text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">{item.label}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">{item.value}</p>
                </div>
              );
            })}
          </section>
        </div>

        <section className="dashboard-panel mx-auto w-full max-w-[430px] rounded-[14px] p-4 sm:p-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--primary)] text-white shadow-[var(--glow-primary)]">
                {mode === "pin" ? <LockKeyhole size={22} aria-hidden="true" /> : <Building2 size={22} aria-hidden="true" />}
              </span>
              <span className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">Staff PIN</span>
            </div>
            <h2 className="dashboard-section-title mt-5">{mode === "pin" ? restaurantName || restaurantSlug || "Đăng nhập ca" : "Chọn quán để vào ca"}</h2>
            <p className="dashboard-body-copy mt-2">
              {mode === "pin" ? "Nhập PIN nhân viên để mở màn hình làm việc." : "Nhập mã quán để mở màn PIN của chi nhánh."}
            </p>
          </div>

          {mode === "gate" ? (
            <form onSubmit={handleGateSubmit} className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">Mã quán</span>
                <input
                  name="restaurantSlug"
                  value={slug}
                  onChange={(event) => setSlug(normalizeSlug(event.target.value))}
                  placeholder="vd: cn-cau-giay"
                  className="h-14 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 text-base font-semibold outline-none"
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <button type="submit" disabled={normalizeSlug(slug).length < 2} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white shadow-[var(--glow-primary)] transition active:scale-[0.99] disabled:opacity-50">
                Tiếp tục
                <ChevronRight size={17} aria-hidden="true" />
              </button>
              {recentSlug ? (
                <button
                  type="button"
                  onClick={() => {
                    const normalized = rememberRestaurantSlug(recentSlug);
                    if (normalized) router.push(staffLoginPath(normalized, nextPath));
                  }}
                  className="min-h-12 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-4 text-xs font-semibold text-[var(--foreground)]"
                >
                  Quán gần đây: {recentSlug}
                </button>
              ) : null}
            </form>
          ) : (
            <form action={formAction} className="mt-4 grid gap-4">
              <input type="hidden" name="restaurantSlug" value={restaurantSlug} />
              <input type="hidden" name="pin" value={pin} />
              <input type="hidden" name="next" value={nextPath} />

              <div className="grid gap-2 text-center">
                <div className="mx-auto flex h-14 min-w-56 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <span key={index} className={cn("h-3 w-3 rounded-full", index < pin.length ? "bg-[var(--primary)]" : "bg-[var(--outline)]/35")} />
                  ))}
                </div>
                {state?.error ? <p aria-live="polite" className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-strong)]">{state.error}</p> : null}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((value) => (
                  <button key={value} type="button" onClick={() => appendPin(value)} className="min-h-16 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-2xl font-semibold text-[var(--foreground)] shadow-sm transition active:scale-[0.98]">
                    {value}
                  </button>
                ))}
                <button type="button" onClick={() => setPin("")} className="min-h-16 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] text-sm font-semibold text-[var(--muted-foreground)] transition active:scale-[0.98]">
                  Xoá
                </button>
                <button type="button" onClick={() => appendPin("0")} className="min-h-16 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-2xl font-semibold text-[var(--foreground)] shadow-sm transition active:scale-[0.98]">
                  0
                </button>
                <button type="button" onClick={() => setPin((current) => current.slice(0, -1))} className="grid min-h-16 place-items-center rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)] transition active:scale-[0.98]" aria-label="Xoá một số">
                  <Delete size={20} aria-hidden="true" />
                </button>
              </div>

              <button type="submit" disabled={pending || pin.length < 4} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white shadow-[var(--glow-primary)] transition active:scale-[0.99] disabled:opacity-50">
                <Fingerprint size={17} aria-hidden="true" />
                {pending ? "Đang kiểm tra..." : "Vào ca"}
              </button>
            </form>
          )}
        </section>
      </section>
    </main>
  );
}
