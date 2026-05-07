"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, CreditCard, Loader2, Phone, RefreshCw, Store, UsersRound, X } from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import { reservationDepositStatusLabel, reservationStatusLabel } from "@/lib/labels";
import type { ReservationDto } from "@/types/domain";

type ReservationSlot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
  tableCount: number;
  bestTableName: string | null;
};

type ReservationPayment = {
  method: "QR";
  url: string;
  amount: number;
  bank: string;
  account: string;
  accountName?: string | null;
  transferContent: string;
};

type ReservationResult = {
  reservation: ReservationDto;
  token?: string;
  payment: ReservationPayment | null;
};

type RestaurantInfo = {
  name: string;
  slug: string;
  logoUrl: string | null;
  address: string | null;
  hotline: string | null;
  contactEmail: string | null;
  reservationsEnabled: boolean;
  depositEnabled: boolean;
  depositType: "FIXED" | "PER_PERSON";
  depositValue: number;
  holdMinutes: number;
  durationMinutes: number;
  maxDaysAhead: number;
  minNoticeMinutes: number;
};

type StoredReservation = {
  reservationId: string;
  token: string;
};

function todayInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function addDaysInputValue(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function formatSlot(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatReservationDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function reservationStorageKey(slug: string) {
  return `logivn-reservation:${slug}`;
}

function countdownLabel(holdExpiresAt?: string | null) {
  if (!holdExpiresAt) return null;
  const seconds = Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}:${remainSeconds.toString().padStart(2, "0")}`;
}

function depositDescription(restaurant: RestaurantInfo, partySize: number) {
  if (!restaurant.depositEnabled || restaurant.depositValue <= 0) return "Quán không yêu cầu cọc trước.";
  const amount = restaurant.depositType === "PER_PERSON" ? restaurant.depositValue * partySize : restaurant.depositValue;
  return `Cọc giữ bàn ${formatVnd(amount)}${restaurant.depositType === "PER_PERSON" ? ` cho ${partySize} khách` : ""}.`;
}

function resultTone(status: ReservationDto["status"]): "green" | "yellow" | "blue" | "red" | "neutral" {
  if (status === "confirmed" || status === "seated" || status === "completed") return "green";
  if (status === "holding" || status === "waiting_deposit_confirm") return "yellow";
  if (status === "cancelled" || status === "expired" || status === "no_show") return "red";
  return "neutral";
}

export function ReservationClient({ restaurant }: { restaurant: RestaurantInfo }) {
  const [date, setDate] = useState(todayInputValue());
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<ReservationSlot[]>([]);
  const [selectedStartsAt, setSelectedStartsAt] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReservationResult | null>(null);
  const [, setClockTick] = useState(0);

  const selectedSlot = useMemo(() => slots.find((slot) => slot.startsAt === selectedStartsAt), [slots, selectedStartsAt]);
  const holdCountdown = countdownLabel(result?.reservation.holdExpiresAt);

  const loadSlots = useCallback(async (nextDate = date, nextPartySize = partySize) => {
    if (!restaurant.reservationsEnabled) return;
    setLoadingSlots(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date: nextDate, partySize: String(nextPartySize) });
      const response = await fetch(`/api/restaurants/${restaurant.slug}/reservations/availability?${params.toString()}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được khung giờ.");
      setSlots(json.data.slots ?? []);
      setSelectedStartsAt("");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Không tải được khung giờ.");
    } finally {
      setLoadingSlots(false);
    }
  }, [date, partySize, restaurant.reservationsEnabled, restaurant.slug]);

  const loadStoredReservation = useCallback(async (stored: StoredReservation) => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ token: stored.token });
      const response = await fetch(`/api/reservations/${stored.reservationId}?${params.toString()}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được lịch đặt.");
      setResult({ ...json.data, token: stored.token });
    } catch {
      window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
    } finally {
      setRefreshing(false);
    }
  }, [restaurant.slug]);

  async function refreshResult() {
    if (!result?.token) return;
    await loadStoredReservation({ reservationId: result.reservation.id, token: result.token });
  }

  async function submitReservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStartsAt) {
      setError("Vui lòng chọn khung giờ còn bàn.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          customerName,
          customerPhone,
          customerEmail,
          partySize,
          startsAt: selectedStartsAt,
          customerNote,
          idempotencyKey: crypto.randomUUID()
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tạo được lịch đặt.");
      const nextResult = json.data as ReservationResult;
      setResult(nextResult);
      if (nextResult.token) {
        window.localStorage.setItem(reservationStorageKey(restaurant.slug), JSON.stringify({ reservationId: nextResult.reservation.id, token: nextResult.token }));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không tạo được lịch đặt.");
    } finally {
      setSubmitting(false);
    }
  }

  async function markPaid() {
    if (!result?.token) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/reservations/${result.reservation.id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: result.token })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không cập nhật được trạng thái cọc.");
      setResult({ ...json.data, token: result.token });
    } catch (paidError) {
      setError(paidError instanceof Error ? paidError.message : "Không cập nhật được trạng thái cọc.");
    } finally {
      setSubmitting(false);
    }
  }

  function startNew() {
    window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
    setResult(null);
    setError(null);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSlots(date, partySize), 0);
    return () => window.clearTimeout(timer);
  }, [date, loadSlots, partySize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = window.localStorage.getItem(reservationStorageKey(restaurant.slug));
      if (!raw) return;
      try {
        void loadStoredReservation(JSON.parse(raw) as StoredReservation);
      } catch {
        window.localStorage.removeItem(reservationStorageKey(restaurant.slug));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadStoredReservation, restaurant.slug]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="stitch-customer min-h-screen bg-[#FFF7EB] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[rgba(15,77,58,0.12)] bg-[#FFF7EB]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <LogiVNLogo className="h-8" priority />
            <p className="mt-1 truncate text-xs font-semibold text-[var(--muted-foreground)]">{restaurant.name}</p>
          </div>
          {restaurant.hotline ? (
            <a href={`tel:${restaurant.hotline}`} className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-white" aria-label="Gọi quán">
              <Phone size={17} />
            </a>
          ) : null}
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <section className="rounded-2xl border border-[rgba(15,77,58,0.14)] bg-white p-5">
            <Badge tone={restaurant.reservationsEnabled ? "green" : "yellow"}>{restaurant.reservationsEnabled ? "Đang nhận đặt bàn" : "Chưa bật đặt bàn"}</Badge>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--primary)]">Đặt bàn trước</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted-foreground)]">
              Chọn giờ trống, để lại thông tin và chuyển cọc nếu quán yêu cầu. Hệ thống giữ bàn trong {restaurant.holdMinutes} phút để tránh trùng lịch.
            </p>
            {restaurant.address ? (
              <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-[var(--foreground)]">
                <Store size={16} className="mt-0.5 text-[var(--primary)]" />
                {restaurant.address}
              </p>
            ) : null}
          </section>

          {!restaurant.reservationsEnabled ? (
            <section className="rounded-2xl border border-dashed border-[rgba(15,77,58,0.2)] bg-white p-6 text-center text-sm font-semibold text-[var(--muted-foreground)]">
              Quán hiện chưa bật nhận đặt bàn trước. Bạn vẫn có thể gọi trực tiếp cho quán nếu cần hỗ trợ.
            </section>
          ) : (
            <form onSubmit={submitReservation} className="rounded-2xl border border-[rgba(15,77,58,0.14)] bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold">
                  Ngày đến
                  <Input
                    type="date"
                    value={date}
                    min={todayInputValue()}
                    max={addDaysInputValue(restaurant.maxDaysAhead)}
                    onChange={(event) => {
                      setDate(event.target.value);
                    }}
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  Số khách
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={partySize}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setPartySize(next);
                    }}
                  />
                </label>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-[var(--foreground)]">Khung giờ còn bàn</p>
                  {loadingSlots ? <Loader2 className="animate-spin text-[var(--primary)]" size={16} /> : null}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {slots.length === 0 && !loadingSlots ? (
                    <div className="col-span-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                      Chưa có khung giờ phù hợp.
                    </div>
                  ) : null}
                  {slots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => setSelectedStartsAt(slot.startsAt)}
                      className={`rounded-xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                        selectedStartsAt === slot.startsAt ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)]"
                      }`}
                    >
                      <span className="block text-base font-black">{formatSlot(slot.startsAt)}</span>
                      <span className="mt-1 block text-xs font-semibold opacity-80">
                        {slot.available ? `${slot.tableCount} bàn trống` : "Hết bàn"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold">
                  Tên khách
                  <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="VD: Anh Minh" required />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  Số điện thoại
                  <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="090..." required />
                </label>
                <label className="grid gap-2 text-sm font-bold sm:col-span-2">
                  Email nhận thông tin
                  <Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="email@..." />
                </label>
                <label className="grid gap-2 text-sm font-bold sm:col-span-2">
                  Ghi chú
                  <Textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="VD: Có trẻ em, cần ghế gần cửa sổ..." />
                </label>
              </div>

              {selectedSlot ? (
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
                  <p className="text-[var(--foreground)]">Bạn đang chọn {formatReservationDate(selectedSlot.startsAt)}</p>
                  <p className="mt-1">{depositDescription(restaurant, partySize)}</p>
                </div>
              ) : null}

              {error ? <p className="mt-4 rounded-xl bg-[var(--danger-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">{error}</p> : null}

              <Button className="mt-4 w-full" disabled={submitting || loadingSlots || !selectedStartsAt}>
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <CalendarClock size={16} />}
                {submitting ? "Đang giữ bàn..." : "Xác nhận đặt bàn"}
              </Button>
            </form>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-2xl border border-[rgba(15,77,58,0.14)] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-[var(--primary)]">Lịch đặt của bạn</h2>
              {result ? (
                <button type="button" onClick={startNew} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)]" aria-label="Tạo lịch đặt mới">
                  <X size={16} />
                </button>
              ) : null}
            </div>

            {refreshing ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                <Loader2 className="animate-spin" size={16} />
                Đang tải lịch đặt gần nhất...
              </div>
            ) : result ? (
              <div className="mt-4 grid gap-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                  <Badge tone={resultTone(result.reservation.status)}>{reservationStatusLabel(result.reservation.status)}</Badge>
                  <p className="mt-3 text-xl font-black text-[var(--foreground)]">{formatReservationDate(result.reservation.startsAt)}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">
                    {result.reservation.partySize} khách · {result.reservation.tables[0]?.name ?? "Đang tự chọn bàn phù hợp"}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-[var(--muted-foreground)]">
                    Cọc: {reservationDepositStatusLabel(result.reservation.depositStatus)}
                  </p>
                  {holdCountdown && result.reservation.status === "holding" ? (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--warning-soft)] px-3 py-1.5 text-xs font-black text-[var(--accent-strong)]">
                      <Clock3 size={14} />
                      Còn {holdCountdown} để chuyển cọc
                    </p>
                  ) : null}
                </div>

                {result.payment && result.reservation.depositStatus !== "paid" ? (
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-[var(--primary)]">
                      <CreditCard size={16} />
                      Chuyển cọc VietQR
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={result.payment.url} alt="QR đặt cọc giữ bàn" className="mx-auto mt-3 h-56 w-56 rounded-xl border border-[var(--border)] bg-white object-contain p-2" />
                    <div className="mt-3 grid gap-2 text-sm font-semibold">
                      <p>Số tiền: <span className="text-[var(--accent)]">{formatVnd(result.payment.amount)}</span></p>
                      <p>Ngân hàng: {result.payment.bank}</p>
                      <p>STK: {result.payment.account}</p>
                      <p>Nội dung: <span className="text-[var(--primary)]">{result.payment.transferContent}</span></p>
                    </div>
                    <Button className="mt-4 w-full" onClick={markPaid} disabled={submitting}>
                      {submitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                      Tôi đã chuyển cọc
                    </Button>
                  </div>
                ) : null}

                <button type="button" onClick={refreshResult} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white text-sm font-black text-[var(--primary)]">
                  <RefreshCw size={16} />
                  Cập nhật trạng thái
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-5 text-center">
                <UsersRound className="mx-auto text-[var(--primary)]" size={28} />
                <p className="mt-3 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
                  Sau khi đặt bàn, thông tin giữ chỗ và QR cọc sẽ hiển thị tại đây.
                </p>
              </div>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}
