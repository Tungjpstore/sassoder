"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, MapPin, PauseCircle, Save, Store, Truck } from "lucide-react";
import { updateBranchDeliveryAvailabilityAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BranchDeliverySettings } from "@/services/delivery/branch-delivery-settings-service";

function timeValue(value: string | null) {
  return value?.slice(0, 5) ?? "";
}

function branchStatus(branch: BranchDeliverySettings) {
  if (!branch.is_active) return { label: "Đã ẩn", tone: "muted" as const };
  if (branch.temporarily_closed) return { label: "Đóng tạm", tone: "danger" as const };
  if (branch.delivery_paused) return { label: "Tạm dừng giao", tone: "warning" as const };
  if (!branch.accepting_delivery) return { label: "Không nhận giao", tone: "warning" as const };
  return { label: "Đang nhận giao", tone: "ready" as const };
}

function isReadyForDelivery(branch: BranchDeliverySettings) {
  return branch.is_active && branch.accepting_delivery && !branch.delivery_paused && !branch.temporarily_closed;
}

function hasPartialDeliveryHours(branch: BranchDeliverySettings) {
  return Boolean(branch.delivery_opening_time) !== Boolean(branch.delivery_closing_time);
}

function summarizeBranches(branches: BranchDeliverySettings[]) {
  const activeBranches = branches.filter((branch) => branch.is_active);
  const readyBranches = branches.filter(isReadyForDelivery);
  const pausedBranches = branches.filter((branch) => branch.delivery_paused || !branch.accepting_delivery);
  const closedBranches = branches.filter((branch) => branch.temporarily_closed || !branch.is_active);
  const partialHoursBranches = branches.filter((branch) => branch.is_active && hasPartialDeliveryHours(branch));
  const primaryBranch = branches.find((branch) => branch.is_primary) ?? activeBranches[0] ?? branches[0] ?? null;
  const firstBranchToFix =
    branches.find((branch) => branch.is_active && hasPartialDeliveryHours(branch)) ??
    branches.find((branch) => branch.is_primary && !isReadyForDelivery(branch)) ??
    branches.find((branch) => branch.is_active && !isReadyForDelivery(branch)) ??
    null;

  return {
    activeCount: activeBranches.length,
    readyCount: readyBranches.length,
    pausedCount: pausedBranches.length,
    closedCount: closedBranches.length,
    partialHoursCount: partialHoursBranches.length,
    partialHoursNames: partialHoursBranches.map((branch) => branch.name).slice(0, 3),
    primaryBranch,
    firstBranchToFix,
    allActiveClear: activeBranches.every((branch) => branch.accepting_delivery || branch.delivery_paused || branch.temporarily_closed),
    allHoursComplete: partialHoursBranches.length === 0,
    primaryReady: primaryBranch ? isReadyForDelivery(primaryBranch) : false,
    pausedReviewed: pausedBranches.length + closedBranches.length === 0
  };
}

function StatusBadge({ label, tone }: { label: string; tone: "ready" | "warning" | "danger" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-black",
        tone === "ready" && "border-[#b8dcc5] bg-[#edf7ef] text-[#0f6944]",
        tone === "warning" && "border-[#f3d4ad] bg-[#fff7eb] text-[#a65f00]",
        tone === "danger" && "border-[#fac5bd] bg-[#fff1ed] text-[#c23b2a]",
        tone === "muted" && "border-[#e1ddd4] bg-[#fbfaf7] text-[#667166]"
      )}
    >
      {label}
    </span>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ready" | "warning" | "danger" | "muted";
}) {
  return (
    <div className="rounded-2xl border border-[#ece7dd] bg-[#fbfaf7] px-3 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-xl",
            tone === "ready" && "bg-[#edf7ef] text-[#0f6944]",
            tone === "warning" && "bg-[#fff7eb] text-[#a65f00]",
            tone === "danger" && "bg-[#fff1ed] text-[#c23b2a]",
            tone === "muted" && "bg-white text-[#667166]"
          )}
        >
          {icon}
        </span>
        <span>
          <span className="block text-[11px] font-bold text-[#667166]">{label}</span>
          <strong className="mt-0.5 block text-sm text-[#101813]">{value}</strong>
        </span>
      </div>
    </div>
  );
}

function ToggleInput({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-9 items-center justify-between gap-3 rounded-xl border border-[#ece7dd] bg-white px-3 py-2 text-xs font-bold text-[#303a32]">
      <span>{label}</span>
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="h-4 w-4 accent-[#0f6944]" />
    </label>
  );
}

function ReadinessRow({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#ece7dd] bg-white px-3 py-2">
      <span
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
          done ? "bg-[#edf7ef] text-[#0f6944]" : "bg-[#fff7eb] text-[#a65f00]"
        )}
      >
        {done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black text-[#101813]">{label}</span>
        <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-[#667166]">{detail}</span>
      </span>
    </div>
  );
}

function MultiBranchCommandCenter({
  branches,
  summary
}: {
  branches: BranchDeliverySettings[];
  summary: ReturnType<typeof summarizeBranches>;
}) {
  const readinessScore = branches.length
    ? Math.round(
        ((summary.readyCount / Math.max(1, summary.activeCount || branches.length)) * 50) +
          (summary.allHoursComplete ? 20 : 0) +
          (summary.primaryReady ? 20 : 0) +
          (summary.pausedReviewed ? 10 : 0)
      )
    : 0;
  const firstBranchStatus = summary.firstBranchToFix ? branchStatus(summary.firstBranchToFix) : null;

  return (
    <div className="dashboard-branch-command-center rounded-[18px] border border-[#dcebdc] bg-[linear-gradient(135deg,#f7fbf5,#fff8ee)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#0f6944]">Multi-branch readiness</p>
          <h4 className="mt-1 text-base font-black text-[#101813]">Trạng thái vận hành giao hàng toàn chuỗi</h4>
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-[#667166]">
            Ưu tiên xử lý chi nhánh đang làm lệch quote giao hàng, thiếu giờ nhận đơn hoặc chi nhánh chính chưa sẵn sàng.
          </p>
        </div>
        <div className="min-w-[116px] rounded-2xl border border-[#cfe8d8] bg-white px-4 py-3 text-center">
          <p className="text-[11px] font-black text-[#667166]">Sẵn sàng</p>
          <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-[#0f6944]">{Math.min(100, readinessScore)}%</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-2 sm:grid-cols-2">
          <ReadinessRow
            done={summary.readyCount === summary.activeCount && summary.activeCount > 0}
            label="Chi nhánh active đã rõ trạng thái"
            detail={`${summary.readyCount}/${summary.activeCount} chi nhánh đang sẵn sàng nhận giao.`}
          />
          <ReadinessRow
            done={summary.allHoursComplete}
            label="Giờ giao hàng đầy đủ"
            detail={summary.allHoursComplete ? "Không có chi nhánh thiếu mốc giờ." : `${summary.partialHoursCount} chi nhánh cần nhập đủ giờ mở và ngưng nhận.`}
          />
          <ReadinessRow
            done={summary.primaryReady}
            label="Chi nhánh chính có thể nhận đơn"
            detail={summary.primaryBranch ? `${summary.primaryBranch.name}: ${branchStatus(summary.primaryBranch).label}.` : "Chưa xác định chi nhánh chính."}
          />
          <ReadinessRow
            done={summary.pausedReviewed}
            label="Pause/đóng tạm đã được kiểm soát"
            detail={summary.pausedReviewed ? "Không có chi nhánh đang pause hoặc đóng tạm." : `${summary.pausedCount + summary.closedCount} trạng thái cần rà soát trước giờ cao điểm.`}
          />
        </div>

        <aside className="rounded-2xl border border-[#f3d4ad] bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#a65f00]">Việc cần làm trước</p>
          {summary.firstBranchToFix && firstBranchStatus ? (
            <div className="mt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#101813]">{summary.firstBranchToFix.name}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#667166]">
                    {hasPartialDeliveryHours(summary.firstBranchToFix)
                      ? "Nhập đủ giờ giao hàng để tránh quote sai."
                      : summary.firstBranchToFix.is_primary
                        ? "Chi nhánh chính cần bật nhận giao hoặc bỏ pause."
                        : "Rà lại trạng thái nhận giao trước khi mở ca."}
                  </p>
                </div>
                <StatusBadge label={firstBranchStatus.label} tone={firstBranchStatus.tone} />
              </div>
              <p className="mt-3 rounded-xl bg-[#fff7eb] px-3 py-2 text-[11px] font-bold leading-4 text-[#a65f00]">
                Sửa ngay trong thẻ chi nhánh bên dưới, bấm Lưu để đồng bộ quote giao hàng.
              </p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-[#b8dcc5] bg-[#edf7ef] px-3 py-3 text-xs font-bold leading-5 text-[#0f6944]">
              Tất cả chi nhánh đang sạch trạng thái. Có thể mở cao điểm mà không cần chỉnh thêm.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function BranchDeliveryControls({ branches }: { branches: BranchDeliverySettings[] }) {
  const [state, formAction, pending] = useActionState(updateBranchDeliveryAvailabilityAction, undefined);
  const summary = summarizeBranches(branches);

  return (
    <section className="dashboard-branch-delivery-controls rounded-[14px] border border-[#dcebdc] bg-white p-4 shadow-[0_1px_2px_rgba(29,39,32,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-extrabold text-[#101813]">Điều phối giao hàng theo chi nhánh</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-[#667166]">
            Bật/tắt giao hàng, pause khi bếp quá tải và đặt giờ giao riêng cho từng chi nhánh.
          </p>
        </div>
        <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d7e5d9] bg-[#f3faf4] px-3 text-xs font-black text-[#0f6944]">
          <Truck size={15} />
          {branches.length} chi nhánh
        </span>
      </div>

      {branches.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[#f3d4ad] bg-[#fff7eb] px-4 py-3 text-sm font-bold text-[#a65f00]">
          Chưa có chi nhánh trong `store_branches`. Khi mở nhiều điểm bán, phần này sẽ cho phép kiểm soát giao hàng riêng từng điểm.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <MultiBranchCommandCenter branches={branches} summary={summary} />

          <div className="dashboard-branch-summary-grid grid gap-2 md:grid-cols-4">
            <SummaryCard icon={<Store size={16} />} label="Đang hoạt động" value={`${summary.activeCount}/${branches.length}`} tone="muted" />
            <SummaryCard icon={<CheckCircle2 size={16} />} label="Sẵn sàng nhận giao" value={`${summary.readyCount}`} tone="ready" />
            <SummaryCard icon={<PauseCircle size={16} />} label="Đang pause/tắt giao" value={`${summary.pausedCount}`} tone={summary.pausedCount ? "warning" : "muted"} />
            <SummaryCard icon={<AlertTriangle size={16} />} label="Đóng tạm/ẩn" value={`${summary.closedCount}`} tone={summary.closedCount ? "danger" : "muted"} />
          </div>

          {summary.partialHoursCount > 0 ? (
            <div className="rounded-xl border border-[#f3d4ad] bg-[#fff7eb] px-4 py-3 text-sm font-bold text-[#a65f00]">
              {summary.partialHoursCount} chi nhánh đang thiếu một mốc giờ giao: {summary.partialHoursNames.join(", ")}
              {summary.partialHoursCount > summary.partialHoursNames.length ? "..." : ""}. Hãy nhập đủ cả giờ mở giao và ngưng nhận.
            </div>
          ) : null}

          {branches.map((branch) => {
            const status = branchStatus(branch);
            const partialHours = hasPartialDeliveryHours(branch);
            return (
              <form key={branch.id} action={formAction} className="dashboard-branch-delivery-card rounded-2xl border border-[#ece7dd] bg-[#fbfaf7] p-3">
                <input type="hidden" name="branchId" value={branch.id} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf7ef] text-[#0f6944]">
                        <Store size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#101813]">{branch.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-[#667166]">
                          <MapPin size={12} />
                          {branch.address || "Chưa có địa chỉ"}
                        </p>
                      </div>
                      {branch.is_primary ? <StatusBadge label="Chính" tone="ready" /> : null}
                      <StatusBadge label={status.label} tone={status.tone} />
                    </div>
                  </div>
                  <div className="grid gap-1 text-right text-[11px] font-bold text-[#667166]">
                    <span>{Number(branch.delivery_radius_km).toFixed(1)} km</span>
                    <span>{formatVnd(Number(branch.delivery_base_fee))} + {formatVnd(Number(branch.delivery_fee_per_km))}/km</span>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <ToggleInput name="acceptingDelivery" label="Nhận giao hàng" defaultChecked={branch.accepting_delivery} />
                  <ToggleInput name="deliveryPaused" label="Pause giao hàng" defaultChecked={branch.delivery_paused} />
                  <ToggleInput name="temporarilyClosed" label="Đóng tạm chi nhánh" defaultChecked={branch.temporarily_closed} />
                </div>

                <div className="dashboard-branch-delivery-fields mt-3 grid gap-2 md:grid-cols-[120px_120px_minmax(0,1fr)_auto]">
                  <label className="grid gap-1 text-xs font-bold text-[#566052]">
                    Mở giao
                    <input name="deliveryOpeningTime" type="time" defaultValue={timeValue(branch.delivery_opening_time)} className="h-10 rounded-lg border border-[#e1ddd4] bg-white px-2 text-sm font-semibold text-[#101813] outline-none" />
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-[#566052]">
                    Ngưng nhận
                    <input name="deliveryClosingTime" type="time" defaultValue={timeValue(branch.delivery_closing_time)} className="h-10 rounded-lg border border-[#e1ddd4] bg-white px-2 text-sm font-semibold text-[#101813] outline-none" />
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-[#566052]">
                    Ghi chú hiển thị nội bộ
                    <input name="deliveryAvailabilityNote" defaultValue={branch.delivery_availability_note ?? ""} maxLength={160} placeholder="Ví dụ: bếp quá tải, sửa đường trước quán..." className="h-10 rounded-lg border border-[#e1ddd4] bg-white px-3 text-sm font-semibold text-[#101813] outline-none" />
                  </label>
                  <Button disabled={pending} className="mt-5 h-10 rounded-lg bg-[#0f6944] text-white hover:bg-[#0b5738] md:w-auto">
                    <Save size={15} />
                    Lưu
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-[#667166]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1">
                    <Clock3 size={12} />
                    Pickup {branch.pickup_eta_minutes}p
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1">
                    <Truck size={12} />
                    Delivery {branch.delivery_eta_minutes}p
                  </span>
                  {branch.delivery_paused ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7eb] px-2 py-1 text-[#a65f00]">
                      <PauseCircle size={12} />
                      Đang loại khỏi quote giao hàng
                    </span>
                  ) : null}
                  {partialHours ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7eb] px-2 py-1 text-[#a65f00]">
                      <AlertTriangle size={12} />
                      Thiếu một mốc giờ giao
                    </span>
                  ) : null}
                </div>
              </form>
            );
          })}
        </div>
      )}

      {state?.error ? <p role="alert" className="mt-3 rounded-xl bg-[#fff1ed] px-4 py-3 text-sm font-extrabold text-[#c23b2a]">{state.error}</p> : null}
      {state?.success ? <p aria-live="polite" className="mt-3 rounded-xl bg-[#edf7ef] px-4 py-3 text-sm font-extrabold text-[#0f6944]">{state.success}</p> : null}
    </section>
  );
}
