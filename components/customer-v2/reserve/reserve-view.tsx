"use client";

import * as React from "react";
import {
  ArrowLeft,
  CalendarCheck2,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  XCircle
} from "lucide-react";
import { formatVnd } from "@/lib/money";
import { reservationStatusLabel, reservationDepositStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ReservationDto } from "@/types/domain";
import type { ReservationStatusTimelineItem } from "@/services/reservation-service";
import { ShopShell, TopBar } from "../shell/shop-shell";
import { ShopButton } from "../ui/button";
import { Card, Pill, SectionLabel, EmptyState, Spinner, CustomerStickyActions, CustomerStatusHero } from "../ui/primitives";
import { ReservationFloorMap, type FloorTable } from "./floor-map";
import {
  addDaysInputValue,
  canCustomerCancel,
  countdownLabel,
  depositAmount,
  formatReservationDate,
  formatShortDate,
  formatSlot,
  formatTimelineTime,
  isTerminalReservationStatus,
  nextWeekendInputValue,
  slotPeriod,
  todayInputValue,
  type BookingStep,
  type ReservationResult,
  type ReservationSeatingZone,
  type ReservationSlot,
  type ReservationSyncState,
  type ReservationTableKind,
  type RestaurantInfo
} from "./reserve-client-v2";

const seatingZoneChoices: Array<{ value: ReservationSeatingZone | ""; label: string }> = [
  { value: "", label: "Bất kỳ" },
  { value: "indoor", label: "Trong nhà" },
  { value: "outdoor", label: "Ngoài trời" },
  { value: "mixed", label: "Linh hoạt" }
];
const tableKindChoices: Array<{ value: ReservationTableKind | ""; label: string }> = [
  { value: "", label: "Bất kỳ" },
  { value: "standard", label: "Tiêu chuẩn" },
  { value: "vip", label: "VIP" },
  { value: "bar", label: "Quầy bar" },
  { value: "community", label: "Bàn chung" }
];
const bookingSteps: Array<{ id: BookingStep; label: string }> = [
  { id: "time", label: "Giờ" },
  { id: "table", label: "Bàn" },
  { id: "contact", label: "Thông tin" },
  { id: "review", label: "Xác nhận" }
];
const partySizeChoices = [2, 4, 6, 8];

function tableSummary(reservation: ReservationDto) {
  const names = reservation.tables.map((t) => t.name).filter(Boolean);
  if (names.length === 0) return "Quán tự chọn bàn phù hợp";
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1} bàn ghép`;
}
function resultTone(status: ReservationDto["status"]): "ok" | "warn" | "danger" | "neutral" {
  if (["confirmed", "checked_in", "seated", "completed"].includes(status)) return "ok";
  if (["holding", "waiting_deposit_confirm"].includes(status)) return "warn";
  if (["cancelled", "rejected", "expired", "no_show"].includes(status)) return "danger";
  return "neutral";
}
function resultHeroTitle(status: ReservationDto["status"]) {
  if (status === "confirmed") return "Đặt bàn thành công!";
  if (status === "cancelled") return "Lịch đặt đã huỷ";
  if (status === "rejected") return "Quán chưa thể nhận lịch";
  if (status === "expired") return "Lịch giữ bàn đã hết hạn";
  if (status === "no_show") return "Lịch đã đánh dấu không đến";
  if (status === "completed") return "Cảm ơn bạn đã ghé quán";
  if (status === "waiting_deposit_confirm") return "Đang chờ quán xác nhận cọc";
  return "Đã giữ bàn cho bạn";
}
function timelineTitle(item: ReservationStatusTimelineItem) {
  const map: Record<string, string> = {
    reservation_created: "Đã tạo lịch đặt",
    reservation_deposit_submitted: "Bạn đã báo chuyển cọc",
    reservation_deposit_confirmed: "Quán đã xác nhận cọc",
    reservation_checked_in: "Khách đã check-in",
    reservation_seated: "Đã nhận khách vào bàn",
    reservation_customer_cancel: "Bạn đã huỷ lịch",
    reservation_merchant_cancel: "Quán đã huỷ lịch",
    reservation_hold_expired: "Lịch giữ bàn đã hết hạn"
  };
  return (item.note && map[item.note]) || reservationStatusLabel(item.toStatus as ReservationDto["status"]);
}
function slotToneLabel(slot: ReservationSlot) {
  if (!slot.available) return { label: "Hết bàn", tone: "danger" as const };
  if (slot.recommendationLabel) return { label: slot.recommendationLabel, tone: slot.availabilityLevel === "low" ? ("warn" as const) : ("ok" as const) };
  if (slot.tableCount <= 1) return { label: "Sắp hết", tone: "warn" as const };
  return { label: "Còn bàn", tone: "ok" as const };
}

type ReserveViewProps = {
  restaurant: RestaurantInfo;
  step: BookingStep;
  goToStep: (s: BookingStep) => void;
  setStep: (s: BookingStep) => void;
  date: string;
  setDate: (d: string) => void;
  partySize: number;
  setPartySize: (n: number) => void;
  slots: ReservationSlot[];
  loadingSlots: boolean;
  selectedStartsAt: string;
  setSelectedStartsAt: (s: string) => void;
  selectedSlot: ReservationSlot | undefined;
  preferredTableAreaId: string;
  setPreferredTableAreaId: (id: string) => void;
  preferredSeatingZone: ReservationSeatingZone | "";
  setPreferredSeatingZone: (z: ReservationSeatingZone | "") => void;
  preferredTableKind: ReservationTableKind | "";
  setPreferredTableKind: (k: ReservationTableKind | "") => void;
  reloadSlots: () => void;
  floorTables: FloorTable[];
  floorLoading: boolean;
  selectedTableId: string | null;
  autoAssign: boolean;
  onSelectTable: (id: string) => void;
  onAutoAssign: () => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  customerEmail: string;
  setCustomerEmail: (v: string) => void;
  customerNote: string;
  setCustomerNote: (v: string) => void;
  isContactReady: boolean;
  submitting: boolean;
  refreshing: boolean;
  cancelling: boolean;
  confirmCancel: boolean;
  setConfirmCancel: (v: boolean) => void;
  error: string | null;
  result: ReservationResult | null;
  syncState: ReservationSyncState;
  lastSyncedAt: Date | null;
  submitReservation: () => void;
  markPaid: () => void;
  cancelReservation: () => void;
  refreshResult: () => void;
  startNew: () => void;
};

export function ReserveView(props: ReserveViewProps) {
  const { restaurant, result } = props;

  if (result) return <ResultScreen {...props} result={result} />;

  return (
    <ShopShell>
      <BookingScreen {...props} />
    </ShopShell>
  );
}

function StickyBar({ children }: { children: React.ReactNode }) {
  return <CustomerStickyActions>{children}</CustomerStickyActions>;
}
function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-[var(--r-md)] border border-[var(--danger-fg)]/30 bg-[var(--danger-bg)] px-3 py-2.5 text-[length:var(--fs-xs)] font-semibold text-[var(--danger-fg)]">{children}</p>;
}

function BookingScreen(props: ReserveViewProps) {
  const {
    restaurant, step, goToStep, setStep, date, setDate, partySize, setPartySize, slots, loadingSlots,
    selectedStartsAt, setSelectedStartsAt, selectedSlot, preferredTableAreaId, setPreferredTableAreaId,
    preferredSeatingZone, setPreferredSeatingZone, preferredTableKind, setPreferredTableKind,
    floorTables, floorLoading, selectedTableId, autoAssign, onSelectTable, onAutoAssign,
    customerName, setCustomerName, customerPhone, setCustomerPhone, customerEmail, setCustomerEmail,
    customerNote, setCustomerNote, isContactReady, submitting, error, submitReservation
  } = props;

  const stepIndex = bookingSteps.findIndex((s) => s.id === step);
  const deposit = depositAmount(restaurant, partySize);
  const isPresetPartySize = partySizeChoices.includes(partySize);
  const groupedSlots = React.useMemo(
    () =>
      [
        { id: "morning", label: "Buổi sáng", slots: slots.filter((s) => slotPeriod(s.startsAt) === "morning") },
        { id: "afternoon", label: "Buổi chiều", slots: slots.filter((s) => slotPeriod(s.startsAt) === "afternoon") },
        { id: "evening", label: "Buổi tối", slots: slots.filter((s) => slotPeriod(s.startsAt) === "evening") }
      ].filter((g) => g.slots.length > 0),
    [slots]
  );
  const quickDates = React.useMemo(
    () => [
      { label: "Hôm nay", value: todayInputValue() },
      { label: "Ngày mai", value: addDaysInputValue(1) },
      { label: "Cuối tuần", value: nextWeekendInputValue() }
    ],
    []
  );
  const visibleZones = seatingZoneChoices.filter((c) => !c.value || restaurant.preferenceOptions.seatingZones.includes(c.value));
  const visibleKinds = tableKindChoices.filter((c) => !c.value || restaurant.preferenceOptions.tableKinds.includes(c.value));
  const selectedTable = floorTables.find((t) => t.id === selectedTableId);

  const primaryLabel = step === "time" ? "Chọn bàn" : step === "table" ? "Tiếp tục" : step === "contact" ? "Xem lại" : submitting ? "Đang giữ bàn..." : deposit > 0 ? "Giữ bàn & nhận mã cọc" : "Giữ bàn ngay";
  const primaryDisabled =
    !restaurant.reservationsEnabled || submitting || (step === "time" && (loadingSlots || !selectedStartsAt)) || (step === "contact" && !isContactReady);

  function onPrimary() {
    if (step === "time") return goToStep("table");
    if (step === "table") return goToStep("contact");
    if (step === "contact") return goToStep("review");
    submitReservation();
  }

  return (
    <>
      <TopBar
        title={restaurant.name}
        subtitle="Đặt bàn trước"
        logoUrl={restaurant.logoUrl}
        onBack={step === "time" ? undefined : () => setStep(bookingSteps[Math.max(0, stepIndex - 1)].id)}
        loading={loadingSlots || floorLoading}
        right={
          restaurant.hotline ? (
            <a href={`tel:${restaurant.hotline}`} aria-label="Gọi quán" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--jade)] text-[var(--on-jade)] active:scale-90">
              <Phone size={17} />
            </a>
          ) : undefined
        }
      />

      {/* Stepper */}
      <div className="border-b border-[var(--line)] bg-[var(--surface)]/92 px-4 py-2.5 backdrop-blur-md">
        <div className="grid grid-cols-4 gap-1.5">
          {bookingSteps.map((s, i) => {
            const active = s.id === step;
            const done = i < stepIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => i < stepIndex && setStep(s.id)}
                className={cn(
                  "flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--r-pill)] px-2 py-1.5 text-[length:var(--fs-xs)] font-semibold transition",
                  active ? "bg-[var(--jade)] text-[var(--on-jade)]" : done ? "bg-[var(--primary-soft)] text-[var(--jade)]" : "bg-[var(--surface-2)] text-[var(--text-faint)]"
                )}
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-current/15 text-[10px]">{done ? "✓" : i + 1}</span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 shop-screen-in">
        {!restaurant.reservationsEnabled ? (
          <EmptyState icon={<CalendarCheck2 size={22} />} title="Quán chưa bật đặt bàn" description="Bạn có thể gọi trực tiếp cho quán để giữ chỗ." />
        ) : step === "time" ? (
          <div className="grid gap-4">
            <Card className="shop-card-row p-4">
              <SectionLabel>Ngày đến</SectionLabel>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {quickDates.map((q) => (
                  <button key={q.label} type="button" onClick={() => setDate(q.value)} className={cn("min-h-11 rounded-[var(--r-md)] border px-2 py-2.5 text-center text-[length:var(--fs-xs)] font-bold transition active:scale-[0.98]", date === q.value ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--text)]")}>
                    {q.label}
                  </button>
                ))}
              </div>
              <input type="date" value={date} min={todayInputValue()} max={addDaysInputValue(restaurant.maxDaysAhead)} onChange={(e) => setDate(e.target.value)} className="mt-2 h-11 w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]" />

              <SectionLabel className="mt-4 block">Số khách</SectionLabel>
              <div className="mt-2 flex items-center gap-2">
                {partySizeChoices.map((v) => (
                  <button key={v} type="button" onClick={() => setPartySize(v)} className={cn("h-11 flex-1 rounded-[var(--r-md)] border text-[length:var(--fs-sm)] font-bold transition", partySize === v ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--text)]")}>
                    {v}
                  </button>
                ))}
                <button type="button" onClick={() => setPartySize(isPresetPartySize ? 5 : partySize)} aria-pressed={!isPresetPartySize} className={cn("h-11 flex-1 rounded-[var(--r-md)] border text-[length:var(--fs-sm)] font-bold transition", !isPresetPartySize ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--text)]")}>
                  Khác
                </button>
              </div>
              {!isPresetPartySize ? (
                <input type="number" min={1} max={100} value={partySize} onChange={(e) => setPartySize(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} aria-label="Số khách khác" className="mt-2 h-11 w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-center text-[length:var(--fs-sm)] font-bold outline-none focus:border-[var(--jade)]" />
              ) : null}
            </Card>

            {restaurant.preferenceOptions.tableAreas.length > 0 || visibleZones.length > 1 || visibleKinds.length > 1 ? (
            <Card className="shop-card-row p-4">
                <SectionLabel>Ưu tiên vị trí (tuỳ chọn)</SectionLabel>
                {restaurant.preferenceOptions.tableAreas.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PrefChip active={!preferredTableAreaId} onClick={() => setPreferredTableAreaId("")}>Tất cả khu</PrefChip>
                    {restaurant.preferenceOptions.tableAreas.map((a) => (
                      <PrefChip key={a.id} active={preferredTableAreaId === a.id} onClick={() => setPreferredTableAreaId(a.id)}>{a.name}</PrefChip>
                    ))}
                  </div>
                ) : null}
                {visibleZones.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {visibleZones.map((c) => (
                      <PrefChip key={c.value || "any-z"} active={preferredSeatingZone === c.value} onClick={() => setPreferredSeatingZone(c.value)}>{c.label}</PrefChip>
                    ))}
                  </div>
                ) : null}
                {visibleKinds.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {visibleKinds.map((c) => (
                      <PrefChip key={c.value || "any-k"} active={preferredTableKind === c.value} onClick={() => setPreferredTableKind(c.value)}>{c.label}</PrefChip>
                    ))}
                  </div>
                ) : null}
              </Card>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Khung giờ còn bàn · {formatShortDate(date)}</SectionLabel>
                {loadingSlots ? <Spinner size={16} className="text-[var(--jade)]" /> : null}
              </div>
              {groupedSlots.length === 0 && !loadingSlots ? (
                <p className="rounded-[var(--r-md)] bg-[var(--surface-2)] p-4 text-center text-[length:var(--fs-sm)] text-[var(--text-muted)]">Chưa có khung giờ phù hợp. Thử ngày khác hoặc giảm số khách.</p>
              ) : (
                <div className="grid gap-4">
                  {groupedSlots.map((g) => (
                    <div key={g.id}>
                      <p className="mb-2 text-[length:var(--fs-2xs)] font-bold uppercase tracking-[var(--track-wide)] text-[var(--text-faint)]">{g.label}</p>
                      <div className="grid grid-cols-3 gap-2 shop-stagger">
                        {g.slots.map((slot) => {
                          const tone = slotToneLabel(slot);
                          const selected = selectedStartsAt === slot.startsAt;
                          return (
                            <button key={slot.startsAt} type="button" disabled={!slot.available} onClick={() => setSelectedStartsAt(slot.startsAt)} className={cn("min-h-[76px] rounded-[var(--r-md)] border p-2.5 text-left shadow-[var(--sh-sm)] transition active:scale-[0.98] disabled:opacity-45", selected ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--text)]")}>
                              <span className="block shop-num text-[length:var(--fs-body)] font-bold">{formatSlot(slot.startsAt)}</span>
                              <span className={cn("mt-1 inline-block rounded-[var(--r-pill)] px-1.5 py-0.5 text-[length:var(--fs-2xs)] font-bold", selected ? "bg-[var(--on-jade)]/20 text-[var(--on-jade)]" : tone.tone === "ok" ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]" : tone.tone === "warn" ? "bg-[var(--warn-bg)] text-[var(--warn-fg)]" : "bg-[var(--danger-bg)] text-[var(--danger-fg)]")}>{tone.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : step === "table" ? (
          <div className="grid gap-4">
            <Card className="shop-card-row flex items-center justify-between gap-3 p-3.5">
              <span className="flex items-center gap-2 text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">
                <Clock3 size={16} className="text-[var(--jade)]" /> {selectedSlot ? formatSlot(selectedSlot.startsAt) : "—"} · {partySize} khách
              </span>
              <button type="button" onClick={() => setStep("time")} className="text-[length:var(--fs-xs)] font-bold text-[var(--jade)]">Đổi giờ</button>
            </Card>
            <ReservationFloorMap tables={floorTables} loading={floorLoading} selectedTableId={selectedTableId} onSelect={onSelectTable} autoSelected={autoAssign} onAuto={onAutoAssign} />
          </div>
        ) : step === "contact" ? (
          <Card className="shop-card-row grid gap-3 p-4">
            <SectionLabel>Thông tin để quán giữ bàn</SectionLabel>
            <label className="grid gap-1.5">
              <span className="text-[length:var(--fs-xs)] font-semibold text-[var(--text)]">Tên khách</span>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="name" placeholder="VD: Anh Minh" className="h-11 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[length:var(--fs-xs)] font-semibold text-[var(--text)]">Số điện thoại</span>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="090..." className="h-11 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[length:var(--fs-xs)] font-semibold text-[var(--text)]">Email (tuỳ chọn)</span>
              <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} type="email" autoComplete="email" placeholder="email@..." className="h-11 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[length:var(--fs-xs)] font-semibold text-[var(--text)]">Ghi chú cho quán</span>
              <textarea value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} rows={2} placeholder="VD: có trẻ em, cần ghế gần cửa sổ..." className="resize-none rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]" />
            </label>
          </Card>
        ) : (
          <div className="grid gap-3">
            <Card className="shop-card-row grid gap-3 p-4">
              <SectionLabel>Kiểm tra lại lịch đặt</SectionLabel>
              <ReviewRow icon={<Clock3 size={16} />} label="Thời gian" value={selectedSlot ? formatReservationDate(selectedSlot.startsAt) : "—"} />
              <ReviewRow icon={<Users size={16} />} label="Số khách" value={`${partySize} khách`} />
              <ReviewRow icon={<Store size={16} />} label="Bàn" value={autoAssign || !selectedTable ? "Để quán tự xếp" : `${selectedTable.name} · ${selectedTable.capacity} chỗ`} />
              <ReviewRow icon={<CreditCard size={16} />} label="Cọc" value={deposit > 0 ? formatVnd(deposit) : "Không cọc"} />
              <ReviewRow icon={<Sparkles size={16} />} label="Khách đặt" value={`${customerName}${customerPhone ? ` · ${customerPhone}` : ""}`} />
            </Card>
            <div className="rounded-[var(--r-lg)] bg-[var(--primary-soft)] p-4 text-[length:var(--fs-sm)] font-semibold leading-[var(--lh-body)] text-[var(--jade)]">
              <ShieldCheck size={20} className="mb-1.5" />
              {deposit > 0
                ? `Sau khi giữ bàn, bạn có ${restaurant.holdMinutes} phút để chuyển cọc VietQR. Quá hạn, bàn tự mở lại cho khách khác.`
                : "Lịch này không yêu cầu cọc. Quán sẽ nhận và xác nhận trực tiếp trên màn hình này."}
            </div>
          </div>
        )}
        {error ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}
      </div>

      {restaurant.reservationsEnabled ? (
        <StickyBar>
          <ShopButton size="lg" fullWidth loading={submitting} disabled={primaryDisabled} onClick={onPrimary} rightIcon={step === "review" ? undefined : <ChevronRight size={16} />}>
            {primaryLabel}
          </ShopButton>
        </StickyBar>
      ) : null}
    </>
  );
}

function PrefChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-[var(--r-pill)] border px-3 py-1.5 text-[length:var(--fs-xs)] font-semibold transition", active ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--text)]")}>
      {children}
    </button>
  );
}
function ReviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--primary-soft)] text-[var(--jade)]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[length:var(--fs-2xs)] font-bold uppercase tracking-[var(--track-wide)] text-[var(--text-faint)]">{label}</span>
        <span className="block text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{value}</span>
      </span>
    </div>
  );
}

function ResultScreen(props: ReserveViewProps & { result: ReservationResult }) {
  const { restaurant, result, syncState, error, submitting, refreshing, cancelling, confirmCancel, setConfirmCancel, markPaid, cancelReservation, refreshResult, startNew } = props;
  const reservation = result.reservation;
  const hold = countdownLabel(reservation.holdExpiresAt);
  const canMarkPaid = reservation.status === "holding" && reservation.depositStatus === "waiting_payment";
  const isWaitingApproval = reservation.status === "waiting_deposit_confirm" && reservation.depositStatus === "waiting_confirm";
  const canCancel = canCustomerCancel(reservation);
  const timeline = result.timeline ?? [];

  return (
    <ShopShell>
      <div className="px-4 pb-2 pt-5" style={{ paddingTop: "calc(var(--s-5) + var(--safe-top))" }}>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={startNew} aria-label="Đặt lịch mới" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)] text-[var(--text)] shadow-[var(--sh-sm)]"><ArrowLeft size={18} /></button>
          <Pill tone={resultTone(reservation.status) === "ok" ? "ok" : resultTone(reservation.status) === "danger" ? "danger" : "warn"}>{reservationStatusLabel(reservation.status)}</Pill>
        </div>
        <CustomerStatusHero
          eyebrow={`#${reservation.id.slice(0, 8).toUpperCase()}`}
          title={resultHeroTitle(reservation.status)}
          description={`${restaurant.name} · ${formatReservationDate(reservation.startsAt)}`}
          badge={<span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--on-jade)]/15"><CalendarCheck2 size={25} /></span>}
        />
      </div>

      <div className="flex-1 px-4 pb-6 pt-2 shop-screen-in">
        <Card className="grid gap-2.5 p-4">
          <InfoLine icon={<Clock3 size={16} />} text={formatReservationDate(reservation.startsAt)} />
          <InfoLine icon={<Users size={16} />} text={`${reservation.partySize} khách · ${tableSummary(reservation)}`} />
          <InfoLine icon={<CreditCard size={16} />} text={`Cọc: ${reservationDepositStatusLabel(reservation.depositStatus)}`} />
          {hold && (reservation.status === "holding" || reservation.status === "waiting_deposit_confirm") ? (
            <p className="mt-1 inline-flex items-center gap-2 rounded-[var(--r-pill)] bg-[var(--warn-bg)] px-3 py-2 text-[length:var(--fs-xs)] font-bold text-[var(--warn-fg)] shop-breathe">
              <Clock3 size={14} /> {isWaitingApproval ? `Quán đang giữ thêm ${hold} để xác nhận cọc` : `Còn ${hold} để chuyển cọc`}
            </p>
          ) : null}
        </Card>

        {result.payment ? (
          <Card className="mt-4 p-4 text-center">
            <div className="flex items-center justify-between text-left">
              <div>
                <p className="text-[length:var(--fs-sm)] font-bold text-[var(--jade)]">Chuyển cọc VietQR</p>
                <p className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">Quán xác nhận sau khi nhận giao dịch</p>
              </div>
              <Pill tone="warn">{formatVnd(result.payment.amount)}</Pill>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.payment.url} alt="QR đặt cọc giữ bàn" className="mx-auto mt-4 h-56 w-56 rounded-[var(--r-lg)] border border-[var(--line)] bg-white object-contain p-3" />
            <div className="mt-3 grid gap-1.5 rounded-[var(--r-md)] bg-[var(--surface-2)] p-3 text-left text-[length:var(--fs-sm)]">
              <p className="text-[var(--text-muted)]">Ngân hàng: <span className="font-semibold text-[var(--text)]">{result.payment.bank}</span></p>
              <p className="text-[var(--text-muted)]">STK: <span className="shop-num font-semibold text-[var(--text)]">{result.payment.account}</span></p>
              <p className="text-[var(--text-muted)]">Nội dung: <span className="font-mono font-semibold text-[var(--jade)]">{result.payment.transferContent}</span></p>
            </div>
            {isWaitingApproval ? <p className="mt-3 rounded-[var(--r-md)] bg-[var(--primary-soft)] p-3 text-[length:var(--fs-sm)] font-semibold text-[var(--jade)]">Đã ghi nhận bạn chuyển cọc. Quán đang kiểm tra giao dịch.</p> : null}
          </Card>
        ) : null}

        <Card className="mt-4 p-4">
          <SectionLabel>Dòng trạng thái</SectionLabel>
          <ol className="mt-3 grid shop-stagger">
            {(timeline.length > 0 ? timeline.slice().reverse() : []).map((item, index) => (
              <li key={item.id} className="grid grid-cols-[28px_1fr] gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn("grid h-7 w-7 place-items-center rounded-full", index === 0 ? "bg-[var(--jade)] text-[var(--on-jade)]" : "bg-[var(--surface-2)] text-[var(--jade)]")}>{index === 0 ? <Check size={14} /> : <Clock3 size={13} />}</span>
                  {index < timeline.length - 1 ? <span className="w-0.5 flex-1 bg-[var(--line)]" /> : null}
                </div>
                <div className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{timelineTitle(item)}</p>
                    <span className="shrink-0 text-[length:var(--fs-2xs)] text-[var(--text-faint)]">{formatTimelineTime(item.createdAt)}</span>
                  </div>
                </div>
              </li>
            ))}
            {timeline.length === 0 ? <p className="text-[length:var(--fs-sm)] text-[var(--text-muted)]">Trạng thái: {reservationStatusLabel(reservation.status)}. Màn hình tự cập nhật khi quán xử lý.</p> : null}
          </ol>
        </Card>

        {canCancel ? (
          <Card className="mt-4 p-4">
            {confirmCancel ? (
              <div className="grid gap-3">
                <p className="text-[length:var(--fs-sm)] font-bold text-[var(--danger-fg)]">Xác nhận huỷ lịch này?</p>
                <div className="grid grid-cols-2 gap-2">
                  <ShopButton variant="danger" size="md" loading={cancelling} onClick={cancelReservation}>Huỷ bàn</ShopButton>
                  <ShopButton variant="secondary" size="md" onClick={() => setConfirmCancel(false)}>Giữ lại</ShopButton>
                </div>
              </div>
            ) : (
              <ShopButton variant="secondary" size="md" fullWidth leftIcon={<XCircle size={16} />} onClick={() => setConfirmCancel(true)}>Huỷ lịch đặt này</ShopButton>
            )}
          </Card>
        ) : restaurant.hotline ? (
          <a href={`tel:${restaurant.hotline}`} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--r-pill)] border border-[var(--jade)] bg-[var(--primary-soft)] text-[length:var(--fs-sm)] font-bold text-[var(--jade)]">
            <Phone size={16} /> Gọi quán hỗ trợ
          </a>
        ) : null}

        {error ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}
      </div>

      <StickyBar>
        {canMarkPaid ? (
          <ShopButton size="lg" fullWidth loading={submitting} onClick={markPaid} leftIcon={<Check size={18} />}>Tôi đã chuyển cọc</ShopButton>
        ) : (
          <ShopButton size="lg" fullWidth variant="secondary" loading={refreshing || syncState === "syncing"} onClick={refreshResult} leftIcon={<RefreshCw size={16} />}>Cập nhật trạng thái</ShopButton>
        )}
        <ShopButton size="md" fullWidth variant="ghost" onClick={startNew}>Đặt thêm lịch khác</ShopButton>
      </StickyBar>
    </ShopShell>
  );
}

function InfoLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-2 text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">
      <span className="text-[var(--jade)]">{icon}</span> {text}
    </p>
  );
}
