"use client";

/* RealPromotionsWorkspaceV2 — production /dashboard/promotions.
 * Layout: Toolbar + KPI + FilterTabs + card grid + Drawer (giống demo v2).
 * Backend giữ nguyên 1:1: 5 server actions, mọi field name.
 */

import { useMemo, useState } from "react";
import {
  CalendarRange,
  Eye,
  EyeOff,
  Gift,
  Pause,
  Pencil,
  Percent,
  Play,
  Plus,
  QrCode,
  Send,
  Sparkles,
  Store,
  Tag,
  Ticket,
  Trash2,
  TrendingUp,
  Truck
} from "lucide-react";
import {
  createPromotionAction,
  deletePromotionAction,
  togglePromotionAction,
  togglePromotionDisplayAction,
  updatePromotionAction
} from "@/app/dashboard/actions";
import { ConfirmActionButton } from "@/components/dashboard/confirm-action-button";
import { Badge, EmptyState, MetricCard } from "../primitives";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { NextSteps } from "../cross-link";
import { RealtimeStatusBadge } from "../realtime";
import { useDashboardRealtime } from "@/hooks/use-dashboard-realtime";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Promotion, PromotionStatus, PromotionUsageSummary } from "@/services/promotion-service";

type PromotionWithStatus = Promotion & { computedStatus: PromotionStatus };
type StatusFilter = PromotionStatus | "all";
type FreeItemOption = {
  id: string;
  name: string;
  categoryName: string;
  price: number;
  isAvailable: boolean;
};

function statusLabel(s: PromotionStatus) {
  if (s === "active") return "Đang chạy";
  if (s === "scheduled") return "Sắp diễn ra";
  if (s === "paused") return "Tạm dừng";
  return "Đã kết thúc";
}

function statusToneV2(s: PromotionStatus): "ok" | "orange" | "neutral" | "danger" {
  if (s === "active") return "ok";
  if (s === "scheduled") return "orange";
  if (s === "paused") return "neutral";
  return "danger";
}

function channelLabel(ch: string) {
  if (ch === "IN_STORE") return "Tại quán";
  if (ch === "QR_MENU") return "QR Menu";
  if (ch === "WEBSITE") return "Website";
  return "Email";
}

function discountScopeLabel(scope: Promotion["discount_scope"]) {
  return scope === "DELIVERY_FEE" ? "Phí giao hàng" : "Đơn hàng";
}

function campaignBenefitLabel(c: Promotion) {
  if (c.reward_type === "FREE_ITEM") {
    const q = Math.max(1, c.free_item_quantity ?? 1);
    return q > 1 ? `Tặng ${q} món` : "Tặng 1 món";
  }
  if (c.discount_scope === "DELIVERY_FEE" && c.discount_type === "PERCENT" && c.discount_value >= 100) {
    return "Miễn phí giao hàng";
  }
  const v = c.discount_type === "PERCENT" ? `${c.discount_value}%` : formatVnd(c.discount_value);
  return c.discount_scope === "DELIVERY_FEE" ? `Giảm ${v} phí giao hàng` : `Giảm ${v}`;
}

function benefitDisplay(c: Promotion) {
  if (c.reward_type === "FREE_ITEM") return campaignBenefitLabel(c);
  if (c.discount_scope === "DELIVERY_FEE" && c.discount_type === "PERCENT" && c.discount_value >= 100) return "Free ship";
  if (c.discount_type === "PERCENT") return `-${c.discount_value}%`;
  return `-${formatVnd(c.discount_value)}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "Vĩnh viễn";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

function formatDateShort(value: string | null) {
  if (!value) return "Vĩnh viễn";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function formatDateTimeLocal(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function hasChannel(c: Promotion, ch: string) {
  return c.channels.includes(ch);
}

function freeItemName(options: FreeItemOption[], id: string | null) {
  if (!id) return "Chưa chọn món";
  const item = options.find((o) => o.id === id);
  return item ? `${item.name} · ${formatVnd(item.price)}` : "Món không còn trong menu";
}

const inputCls =
  "h-10 w-full rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20";
const selectCls = inputCls + " font-semibold";

export function RealPromotionsWorkspaceV2({
  restaurantId,
  campaigns,
  usage,
  freeItemOptions
}: {
  restaurantId: string;
  campaigns: PromotionWithStatus[];
  usage: PromotionUsageSummary[];
  freeItemOptions: FreeItemOption[];
}) {
  const [tab, setTab] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const rtState = useDashboardRealtime({
    restaurantId,
    workspace: "promotions",
    tables: [{ table: "promotions" }]
  });

  const usageById = useMemo(() => new Map(usage.map((u) => [u.promotionId, u])), [usage]);
  const totalUses = useMemo(() => usage.reduce((s, u) => s + u.orders, 0), [usage]);
  const totalDiscount = useMemo(() => usage.reduce((s, u) => s + u.discount, 0), [usage]);

  const counts = useMemo(
    () => ({
      all: campaigns.length,
      active: campaigns.filter((c) => c.computedStatus === "active").length,
      scheduled: campaigns.filter((c) => c.computedStatus === "scheduled").length,
      paused: campaigns.filter((c) => c.computedStatus === "paused").length,
      ended: campaigns.filter((c) => c.computedStatus === "ended").length
    }),
    [campaigns]
  );
  const visible = useMemo(
    () => (tab === "all" ? campaigns : campaigns.filter((c) => c.computedStatus === tab)),
    [campaigns, tab]
  );
  const selected = selectedId ? campaigns.find((c) => c.id === selectedId) ?? null : null;

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Marketing" title="Khuyến mãi">
        <RealtimeStatusBadge state={rtState} />
        <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> Tạo khuyến mãi</Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Tag size={18} />} label="Đang chạy" value={String(counts.active)} helper={`${counts.all} tổng chiến dịch`} tone="jade" />
        <MetricCard icon={<Gift size={18} />} label="Lượt áp" value={String(totalUses)} helper={formatVnd(totalDiscount)} tone="orange" />
        <MetricCard icon={<TrendingUp size={18} />} label="Sắp diễn ra" value={String(counts.scheduled)} helper="Chiến dịch lên lịch" tone="info" />
        <MetricCard icon={<Sparkles size={18} />} label="Đang ẩn" value={String(campaigns.filter((c) => !c.show_on_customer_menu).length)} helper="Khách không thấy" tone="neutral" />
      </section>

      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as StatusFilter)}
        tabs={[
          { key: "all", label: "Tất cả", count: counts.all },
          { key: "active", label: "Đang chạy", count: counts.active },
          { key: "scheduled", label: "Sắp diễn ra", count: counts.scheduled },
          { key: "paused", label: "Tạm dừng", count: counts.paused },
          { key: "ended", label: "Đã kết thúc", count: counts.ended }
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<Tag size={20} />}
          title="Chưa có khuyến mãi"
          description="Tạo chương trình để tăng lượt khách giờ vắng."
          action={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> Tạo khuyến mãi</Button>}
        />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <PromoCard key={c.id} campaign={c} usage={usageById.get(c.id)} onOpen={() => setSelectedId(c.id)} />
          ))}
        </div>
      )}

      {selected ? (
        <DetailDrawer
          campaign={selected}
          usage={usageById.get(selected.id)}
          freeItemOptions={freeItemOptions}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {creating ? <CreateModal freeItemOptions={freeItemOptions} onClose={() => setCreating(false)} /> : null}

      <NextSteps
        items={[
          { href: "/dashboard/menu", label: "Menu món", hint: "Chọn món tặng / combo", icon: <Tag size={14} /> },
          { href: "/dashboard/online", label: "Bán online", hint: "Kích hoạt khuyến mãi online", icon: <Gift size={14} /> },
          { href: "/dashboard/analytics", label: "Báo cáo", hint: "Hiệu quả chiến dịch", icon: <TrendingUp size={14} /> }
        ]}
      />
    </div>
  );
}

function PromoCard({
  campaign,
  usage,
  onOpen
}: {
  campaign: PromotionWithStatus;
  usage: PromotionUsageSummary | undefined;
  onOpen: () => void;
}) {
  const used = usage?.orders ?? 0;
  const cap = campaign.total_usage_limit ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : null;
  const Icon = campaign.discount_scope === "DELIVERY_FEE" ? Truck : Percent;

  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]">
      <header className="flex items-start justify-between gap-2 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
        <div className="min-w-0">
          <p className="d-eyebrow text-[var(--d-orange-600)]">{discountScopeLabel(campaign.discount_scope)} · <span className="font-mono">{campaign.code}</span></p>
          <p className="mt-1 truncate text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{campaign.name}</p>
          <p className="d-num mt-1 inline-flex items-center gap-1 text-[length:var(--d-fs-display)] font-bold text-[var(--d-orange-600)]">
            <Icon size={18} className="text-[var(--d-orange-600)]" /> {benefitDisplay(campaign)}
          </p>
        </div>
        <Badge tone={statusToneV2(campaign.computedStatus)}>{statusLabel(campaign.computedStatus)}</Badge>
      </header>

      <div className="px-[var(--d-s-4)] pb-3">
        <div className="flex items-center justify-between gap-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          <span>Đã dùng</span>
          <span className="d-num font-semibold text-[var(--d-text)]">
            {used}{cap ? ` / ${cap}` : ""}
          </span>
        </div>
        {pct !== null ? (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--d-surface-3)]">
            <span className="block h-full rounded-full bg-[var(--d-jade)]" style={{ width: `${pct}%` }} />
          </div>
        ) : (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--d-surface-3)]">
            <span className="block h-full w-full rounded-full bg-[var(--d-sage)]" />
          </div>
        )}
        <p className="mt-2 inline-flex items-center gap-1 text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
          <CalendarRange size={11} />
          {formatDateShort(campaign.starts_at)} → {formatDateShort(campaign.ends_at)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {campaign.channels.slice(0, 3).map((ch) => (
            <Badge key={ch} tone="info">{channelLabel(ch)}</Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-[var(--d-line)]">
        <ToggleActiveButton campaign={campaign} />
        <button
          type="button"
          onClick={onOpen}
          className="flex h-11 items-center justify-center gap-1.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-primary)] hover:bg-[var(--d-primary-soft)]"
        >
          <Pencil size={14} /> Sửa
        </button>
      </div>
    </article>
  );
}

function ToggleActiveButton({ campaign }: { campaign: PromotionWithStatus }) {
  return (
    <form action={togglePromotionAction} className="contents">
      <input type="hidden" name="promotionId" value={campaign.id} />
      <input type="hidden" name="isActive" value={String(!campaign.is_active)} />
      <button
        type="submit"
        className="flex h-11 items-center justify-center gap-1.5 border-r border-[var(--d-line)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] hover:bg-[var(--d-surface-2)]"
      >
        {campaign.is_active ? <><Pause size={14} /> Tạm dừng</> : <><Play size={14} /> Kích hoạt</>}
      </button>
    </form>
  );
}

function DetailDrawer({
  campaign,
  usage,
  freeItemOptions,
  onClose
}: {
  campaign: PromotionWithStatus;
  usage: PromotionUsageSummary | undefined;
  freeItemOptions: FreeItemOption[];
  onClose: () => void;
}) {
  const orders = usage?.orders ?? 0;
  const discount = usage?.discount ?? 0;

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={campaign.name}
      subtitle={`Mã ${campaign.code}`}
      headerMeta={<Badge tone={statusToneV2(campaign.computedStatus)}>{statusLabel(campaign.computedStatus)}</Badge>}
    >
      <div className="flex flex-col gap-[var(--d-s-5)]">
        <section className="grid grid-cols-3 gap-[var(--d-s-2)]">
          <Tile label="Đã áp" value={String(orders)} />
          <Tile label="Tổng giảm" value={formatVnd(discount)} />
          <Tile label="Phạm vi" value={discountScopeLabel(campaign.discount_scope)} />
        </section>

        <section className="grid gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)]/50 p-[var(--d-s-4)]">
          <p className="d-eyebrow">Thông tin nhanh</p>
          <div className="grid grid-cols-2 gap-3 text-[length:var(--d-fs-sm)]">
            <Info label="Loại giảm" value={campaignBenefitLabel(campaign)} />
            <Info label="Tối thiểu" value={campaign.min_order_amount > 0 ? formatVnd(campaign.min_order_amount) : "Không yêu cầu"} />
            <Info label="Bắt đầu" value={formatDateTime(campaign.starts_at)} />
            <Info label="Kết thúc" value={formatDateTime(campaign.ends_at)} />
            <Info label="Mỗi khách" value={campaign.per_customer_usage_limit ? `${campaign.per_customer_usage_limit} lượt` : "Không giới hạn"} />
            <Info label="Tổng lượt" value={campaign.total_usage_limit ? `${orders}/${campaign.total_usage_limit}` : "Không giới hạn"} />
            <Info label="Món tặng" value={campaign.reward_type === "FREE_ITEM" ? freeItemName(freeItemOptions, campaign.free_item_menu_item_id) : "Không áp dụng"} full />
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {campaign.channels.map((ch) => <Badge key={ch} tone="info">{channelLabel(ch)}</Badge>)}
          </div>
        </section>

        <section className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={togglePromotionDisplayAction}>
              <input type="hidden" name="promotionId" value={campaign.id} />
              <input type="hidden" name="showOnCustomerMenu" value={String(!campaign.show_on_customer_menu)} />
              <Button type="submit" variant="secondary" className="w-full">
                {campaign.show_on_customer_menu ? <><EyeOff size={14} /> Ẩn khỏi menu khách</> : <><Eye size={14} /> Hiện trên menu khách</>}
              </Button>
            </form>
            <form action={togglePromotionAction}>
              <input type="hidden" name="promotionId" value={campaign.id} />
              <input type="hidden" name="isActive" value={String(!campaign.is_active)} />
              <Button type="submit" variant="secondary" className="w-full">
                {campaign.is_active ? <><Pause size={14} /> Tạm dừng chiến dịch</> : <><Play size={14} /> Kích hoạt</>}
              </Button>
            </form>
          </div>
        </section>

        <UpdateForm campaign={campaign} freeItemOptions={freeItemOptions} />

        <section className="rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/25 bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <h4 className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-danger-fg)]">Vùng xoá chiến dịch</h4>
          <p className="mt-1 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Chỉ xoá khi bạn chắc chắn không cần dùng lại mã này.</p>
          <form action={deletePromotionAction} className="mt-3">
            <input type="hidden" name="promotionId" value={campaign.id} />
            <ConfirmActionButton
              type="submit"
              variant="ghost"
              className="w-full border-[var(--d-danger-fg)]/30 text-[var(--d-danger-fg)] hover:bg-[var(--d-danger-bg)]"
              confirmTitle="Xoá chiến dịch ưu đãi"
              confirmDescription={`Mã ${campaign.code} sẽ bị xoá và không còn hiển thị với khách.`}
              confirmLabel="Xoá chiến dịch"
            >
              <Trash2 size={15} /> Xoá chiến dịch
            </ConfirmActionButton>
          </form>
        </section>
      </div>
    </Drawer>
  );
}

function Info({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={cn(full && "col-span-2")}>
      <p className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="mt-0.5 font-semibold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3 text-center">
      <p className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="d-num mt-1 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

function UpdateForm({
  campaign,
  freeItemOptions
}: {
  campaign: PromotionWithStatus;
  freeItemOptions: FreeItemOption[];
}) {
  return (
    <form action={updatePromotionAction} className="grid gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
      <input type="hidden" name="promotionId" value={campaign.id} />
      <p className="d-eyebrow">Cập nhật</p>
      <h4 className="text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Sửa cấu hình chiến dịch</h4>

      <Field label="Tên chiến dịch">
        <input name="name" defaultValue={campaign.name} required className={inputCls} />
      </Field>
      <Field label="Mã khuyến mãi">
        <input name="code" defaultValue={campaign.code} required className={inputCls + " font-mono uppercase"} />
      </Field>
      <Field label="Kiểu ưu đãi">
        <select name="rewardType" defaultValue={campaign.reward_type ?? "DISCOUNT"} className={selectCls}>
          <option value="DISCOUNT">Giảm tiền / phần trăm</option>
          <option value="FREE_ITEM">Tặng món trong đơn</option>
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phạm vi ưu đãi">
          <select name="discountScope" defaultValue={campaign.discount_scope ?? "ORDER"} className={selectCls}>
            <option value="ORDER">Giảm giá đơn hàng</option>
            <option value="DELIVERY_FEE">Giảm / miễn phí giao hàng</option>
          </select>
        </Field>
        <Field label="Loại ưu đãi">
          <select name="discountType" defaultValue={campaign.discount_type} className={selectCls}>
            <option value="PERCENT">Giảm theo phần trăm</option>
            <option value="FIXED">Giảm tiền trực tiếp</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mức giảm">
          <input name="discountValue" type="number" min={1} defaultValue={campaign.discount_value} required className={inputCls} />
        </Field>
        <Field label="Hóa đơn tối thiểu">
          <input name="minOrderAmount" type="number" min={0} step={1000} defaultValue={campaign.min_order_amount} className={inputCls} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Món tặng">
          <select name="freeItemMenuItemId" defaultValue={campaign.free_item_menu_item_id ?? ""} className={selectCls}>
            <option value="">Không áp dụng</option>
            {freeItemOptions.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.isAvailable}>{item.name} · {item.categoryName} · {formatVnd(item.price)}</option>
            ))}
          </select>
        </Field>
        <Field label="Số lượng tặng">
          <input name="freeItemQuantity" type="number" min={1} max={50} step={1} defaultValue={campaign.free_item_quantity ?? 1} className={inputCls} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tổng lượt dùng">
          <input name="totalUsageLimit" type="number" min={1} step={1} defaultValue={campaign.total_usage_limit ?? ""} placeholder="Không giới hạn" className={inputCls} />
        </Field>
        <Field label="Lượt mỗi khách">
          <input name="perCustomerUsageLimit" type="number" min={1} step={1} defaultValue={campaign.per_customer_usage_limit ?? ""} placeholder="Không giới hạn" className={inputCls} />
        </Field>
      </div>

      <Field label="Thời gian áp dụng">
        <div className="grid grid-cols-2 gap-2">
          <input name="startsAt" type="datetime-local" defaultValue={formatDateTimeLocal(campaign.starts_at)} className={inputCls} />
          <input name="endsAt" type="datetime-local" defaultValue={formatDateTimeLocal(campaign.ends_at)} className={inputCls} />
        </div>
      </Field>
      <fieldset className="grid gap-2">
        <legend className="text-[length:var(--d-fs-xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Kênh áp dụng</legend>
        <div className="grid grid-cols-2 gap-2">
          <ChannelCheckbox name="channels" value="IN_STORE" label="Tại quán" icon={<Store size={14} />} defaultChecked={hasChannel(campaign, "IN_STORE")} />
          <ChannelCheckbox name="channels" value="QR_MENU" label="QR Menu" icon={<QrCode size={14} />} defaultChecked={hasChannel(campaign, "QR_MENU")} />
          <ChannelCheckbox name="channels" value="WEBSITE" label="Website" icon={<Send size={14} />} defaultChecked={hasChannel(campaign, "WEBSITE")} />
          <ChannelCheckbox name="channels" value="EMAIL" label="Email" icon={<Send size={14} />} defaultChecked={hasChannel(campaign, "EMAIL")} />
        </div>
      </fieldset>
      <Button variant="primary" size="lg" type="submit"><Ticket size={15} /> Lưu cấu hình</Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[length:var(--d-fs-xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</span>
      {children}
    </label>
  );
}

function ChannelCheckbox({ name, value, label, icon, defaultChecked }: { name: string; value: string; label: string; icon: React.ReactNode; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] font-medium">
      <input name={name} type="checkbox" value={value} defaultChecked={defaultChecked} />
      {icon}
      {label}
    </label>
  );
}

function CreateModal({ freeItemOptions, onClose }: { freeItemOptions: FreeItemOption[]; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Tạo khuyến mãi mới"
      subtitle="Marketing"
      size="lg"
    >
      <form action={createPromotionAction} className="grid gap-3">
        <Field label="Tên chiến dịch">
          <input name="name" required placeholder="VD: Giảm 20% đồ uống cuối tuần" className={inputCls} />
        </Field>
        <Field label="Mã khuyến mãi">
          <input name="code" required placeholder="WEEKEND20" className={inputCls + " font-mono uppercase"} />
        </Field>
        <Field label="Kiểu ưu đãi">
          <select name="rewardType" defaultValue="DISCOUNT" className={selectCls}>
            <option value="DISCOUNT">Giảm tiền / phần trăm</option>
            <option value="FREE_ITEM">Tặng món trong đơn</option>
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phạm vi">
            <select name="discountScope" className={selectCls}>
              <option value="ORDER">Đơn hàng</option>
              <option value="DELIVERY_FEE">Phí giao hàng</option>
            </select>
          </Field>
          <Field label="Loại">
            <select name="discountType" className={selectCls}>
              <option value="PERCENT">Phần trăm</option>
              <option value="FIXED">Tiền trực tiếp</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mức giảm"><input name="discountValue" type="number" min={1} defaultValue={20} required className={inputCls} /></Field>
          <Field label="Hóa đơn tối thiểu"><input name="minOrderAmount" type="number" min={0} step={1000} defaultValue={0} className={inputCls} /></Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Món tặng">
            <select name="freeItemMenuItemId" defaultValue="" className={selectCls}>
              <option value="">Không áp dụng</option>
              {freeItemOptions.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.isAvailable}>{item.name} · {item.categoryName} · {formatVnd(item.price)}</option>
              ))}
            </select>
          </Field>
          <Field label="Số lượng tặng"><input name="freeItemQuantity" type="number" min={1} max={50} step={1} defaultValue={1} className={inputCls} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tổng lượt dùng"><input name="totalUsageLimit" type="number" min={1} step={1} placeholder="Không giới hạn" className={inputCls} /></Field>
          <Field label="Lượt mỗi khách"><input name="perCustomerUsageLimit" type="number" min={1} step={1} placeholder="Không giới hạn" className={inputCls} /></Field>
        </div>
        <Field label="Thời gian áp dụng">
          <div className="grid grid-cols-2 gap-2">
            <input name="startsAt" type="datetime-local" className={inputCls} />
            <input name="endsAt" type="datetime-local" className={inputCls} />
          </div>
        </Field>
        <fieldset className="grid gap-2">
          <legend className="text-[length:var(--d-fs-xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Kênh áp dụng</legend>
          <div className="grid grid-cols-2 gap-2">
            <ChannelCheckbox name="channels" value="IN_STORE" label="Tại quán" icon={<Store size={14} />} defaultChecked />
            <ChannelCheckbox name="channels" value="QR_MENU" label="QR Menu" icon={<QrCode size={14} />} defaultChecked />
            <ChannelCheckbox name="channels" value="WEBSITE" label="Website" icon={<Send size={14} />} />
            <ChannelCheckbox name="channels" value="EMAIL" label="Email" icon={<Send size={14} />} />
          </div>
        </fieldset>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary"><Plus size={15} /> Tạo khuyến mãi</Button>
        </div>
      </form>
    </Modal>
  );
}
