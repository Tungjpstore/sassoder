"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { Building2, CheckCircle2, ChevronRight, Clock3, Delete, Fingerprint, LockKeyhole, MapPin, ShieldCheck, Store } from "lucide-react";
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
    <main className="min-h-screen overflow-x-hidden bg-[#F4F6F3] text-[#17201B]">
      <section className="mx-auto grid min-h-screen w-full max-w-full grid-cols-[minmax(0,1fr)] content-start gap-5 px-4 py-5 sm:px-6 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center lg:py-8">
        <header className="flex items-center justify-between lg:col-span-2">
          <LogiVNLogo href="/" className="h-9" priority />
          <Link href="/dashboard/login" className="rounded-lg border border-[#D7DFDA] bg-white px-3 py-2 text-xs font-black text-[#526058]">
            Chủ quán
          </Link>
        </header>

        <div className="hidden min-w-0 lg:grid lg:gap-4">
          <section className="rounded-lg border border-[#16231D] bg-[#16231D] p-5 text-white shadow-[0_18px_42px_rgba(22,35,29,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase text-white/52">LogiVN Staff</p>
                <h1 className="mt-2 max-w-xl text-[40px] font-black leading-[1.02]">
                  Vào ca trong vài giây.
                </h1>
              </div>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white/10 text-[#BDF4CC]">
                <ShieldCheck size={22} />
              </span>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2">
              {[
                { icon: Fingerprint, label: "PIN", value: "4-8 số" },
                { icon: Store, label: "Quán", value: restaurantName || restaurantSlug || recentSlug || "Chọn quán" },
                { icon: Clock3, label: "Ca", value: "Staff app" }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.075] p-3">
                    <Icon size={16} className="text-[#BDF4CC]" />
                    <p className="mt-2 truncate text-[10px] font-black uppercase text-white/50">{item.label}</p>
                    <p className="mt-1 truncate text-[13px] font-black text-white">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-3 gap-2">
            {[
              { icon: CheckCircle2, label: "Check-in", tone: "bg-[#E8F5EC] text-[#0F6A45]" },
              { icon: MapPin, label: "GPS/QR", tone: "bg-[#EAF2FF] text-[#2456A6]" },
              { icon: LockKeyhole, label: "Tách quyền", tone: "bg-[#FFF3DE] text-[#98530F]" }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-lg border border-[#DBE2DE] bg-white p-3 shadow-[0_10px_24px_rgba(24,33,29,0.04)]">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${item.tone}`}>
                    <Icon size={16} />
                  </span>
                  <p className="mt-3 truncate text-[13px] font-black text-[#17201B]">{item.label}</p>
                </div>
              );
            })}
          </section>
        </div>

        <section className="mx-0 min-w-0 w-full max-w-[358px] rounded-lg border border-[#DBE2DE] bg-white p-4 shadow-[0_18px_42px_rgba(24,33,29,0.08)] sm:mx-auto sm:max-w-[430px] sm:p-5">
            <div className="rounded-lg border border-[#E0E6E1] bg-[#F8FAF7] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#16231D] text-white">
                  {mode === "pin" ? <LockKeyhole size={22} /> : <Building2 size={22} />}
                </span>
                <span className="rounded-md border border-[#B8DDC0] bg-[#E8F5EC] px-3 py-1 text-xs font-black text-[#0F5D3F]">
                  Staff PIN
                </span>
              </div>
              <h2 className="mt-5 text-[24px] font-black leading-tight">
                {mode === "pin" ? restaurantName || restaurantSlug || "Đăng nhập ca" : "Chọn quán để vào ca"}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#65736B]">
                {mode === "pin"
                  ? "Nhập PIN nhân viên để mở màn hình làm việc."
                  : "Nhập mã quán để mở màn PIN của chi nhánh."}
              </p>
            </div>

            {mode === "gate" ? (
              <form onSubmit={handleGateSubmit} className="mt-4 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase text-[#65736B]">Mã quán</span>
                  <input
                    name="restaurantSlug"
                    value={slug}
                    onChange={(event) => setSlug(normalizeSlug(event.target.value))}
                    placeholder="vd: cn-cau-giay…"
                    className="h-14 rounded-lg border border-[#D7DFDA] bg-white px-4 text-base font-black outline-none"
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <button type="submit" disabled={normalizeSlug(slug).length < 2} className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-[#16231D] px-4 text-[15px] font-black text-white transition active:scale-[0.99] disabled:opacity-50">
                  Tiếp tục
                  <ChevronRight size={17} />
                </button>
                {recentSlug ? (
                  <button
                    type="button"
                    onClick={() => {
                      const normalized = rememberRestaurantSlug(recentSlug);
                      if (normalized) router.push(`/staff/${normalized}/login`);
                    }}
                    className="min-h-12 rounded-lg border border-[#D7DFDA] bg-[#F8FAF7] px-4 text-xs font-black text-[#526058]"
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
                  <div className="mx-auto flex h-14 min-w-56 items-center justify-center gap-2 rounded-lg border border-[#D7DFDA] bg-[#F8FAF7] px-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <span key={index} className={`h-3 w-3 rounded-full ${index < pin.length ? "bg-[#16231D]" : "bg-[#D7DFDA]"}`} />
                    ))}
                  </div>
                  {state?.error ? <p aria-live="polite" className="rounded-lg border border-[#F0C38A] bg-[#FFF4E5] px-3 py-2 text-xs font-bold text-[#98530F]">{state.error}</p> : null}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => appendPin(value)}
                      className="min-h-16 rounded-lg border border-[#D7DFDA] bg-white text-2xl font-black shadow-sm transition active:scale-[0.98]"
                    >
                      {value}
                    </button>
                  ))}
                  <button type="button" onClick={() => setPin("")} className="min-h-16 rounded-lg border border-[#D7DFDA] bg-[#F8FAF7] text-sm font-black text-[#526058] transition active:scale-[0.98]">
                    Xoá
                  </button>
                  <button type="button" onClick={() => appendPin("0")} className="min-h-16 rounded-lg border border-[#D7DFDA] bg-white text-2xl font-black shadow-sm transition active:scale-[0.98]">
                    0
                  </button>
                  <button type="button" onClick={() => setPin((current) => current.slice(0, -1))} className="grid min-h-16 place-items-center rounded-lg border border-[#D7DFDA] bg-[#F8FAF7] text-[#526058] transition active:scale-[0.98]">
                    <Delete size={20} />
                  </button>
                </div>

                <button type="submit" disabled={pending || pin.length < 4} className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-[#16231D] px-4 text-[15px] font-black text-white transition active:scale-[0.99] disabled:opacity-50">
                  <Fingerprint size={17} />
                  {pending ? "Đang kiểm tra…" : "Vào ca"}
                </button>
              </form>
            )}
          </section>
      </section>
    </main>
  );
}
