"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Eye, EyeOff, Gift, Percent, Plus, QrCode, Search, Send, Store, Tag, Ticket, Trash2, TrendingUp, Truck, X } from "lucide-react";
import { createPromotionAction, deletePromotionAction, togglePromotionAction, togglePromotionDisplayAction, updatePromotionAction } from "@/app/dashboard/actions";
import { ConfirmActionButton } from "@/components/dashboard/confirm-action-button";
import { DashboardMetricCard, DashboardSectionHeader } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import type { Promotion, PromotionStatus, PromotionUsageSummary } from "@/services/promotion-service";

type PromotionWithStatus = Promotion & { computedStatus: PromotionStatus };
type StatusFilter = PromotionStatus | "all";
type PromotionPanelMode = "closed" | "create" | "detail";
type FreeItemOption = {
  id: string;
  name: string;
  categoryName: string;
  price: number;
  isAvailable: boolean;
};

function statusLabel(status: PromotionStatus) {
  if (status === "active") return "Đang chạy";
  if (status === "scheduled") return "Sắp diễn ra";
  if (status === "paused") return "Tạm dừng";
  return "Đã kết thúc";
}

function statusTone(status: PromotionStatus) {
  if (status === "active") return "green";
  if (status === "scheduled") return "yellow";
  if (status === "paused") return "neutral";
  return "red";
}

function channelLabel(channel: string) {
  if (channel === "IN_STORE") return "Tại quán";
  if (channel === "QR_MENU") return "QR Menu";
  if (channel === "WEBSITE") return "Website";
  return "Email";
}

function discountScopeLabel(scope: Promotion["discount_scope"]) {
  return scope === "DELIVERY_FEE" ? "Phí giao hàng" : "Đơn hàng";
}

function campaignBenefitLabel(campaign: Promotion) {
  if (campaign.reward_type === "FREE_ITEM") {
    const quantity = Math.max(1, campaign.free_item_quantity ?? 1);
    return quantity > 1 ? `Tặng ${quantity} món` : "Tặng 1 món";
  }
  if (campaign.discount_scope === "DELIVERY_FEE" && campaign.discount_type === "PERCENT" && campaign.discount_value >= 100) {
    return "Miễn phí giao hàng";
  }
  const value = campaign.discount_type === "PERCENT" ? `${campaign.discount_value}%` : formatVnd(campaign.discount_value);
  return campaign.discount_scope === "DELIVERY_FEE" ? `Giảm ${value} phí giao hàng` : `Giảm ${value}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "Không giới hạn";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function hasChannel(campaign: Promotion, channel: string) {
  return campaign.channels.includes(channel);
}

function freeItemName(options: FreeItemOption[], menuItemId: string | null) {
  if (!menuItemId) return "Chưa chọn món";
  const item = options.find((option) => option.id === menuItemId);
  return item ? `${item.name} · ${formatVnd(item.price)}` : "Món không còn trong menu";
}

function hasCustomerOrderingChannel(campaign: Promotion) {
  return hasChannel(campaign, "QR_MENU") || hasChannel(campaign, "WEBSITE");
}

function campaignReadiness(campaign: PromotionWithStatus) {
  const issues: string[] = [];
  if (!campaign.is_active) issues.push("Đang tạm dừng");
  if (campaign.computedStatus === "scheduled") issues.push("Chưa tới thời gian bắt đầu");
  if (campaign.computedStatus === "ended") issues.push("Đã hết thời gian áp dụng");
  if (!campaign.show_on_customer_menu) issues.push("Đang ẩn khỏi menu khách");
  if (!hasCustomerOrderingChannel(campaign)) issues.push("Chưa bật kênh QR Menu hoặc Website");
  if (campaign.discount_scope === "DELIVERY_FEE" && !hasChannel(campaign, "WEBSITE")) {
    issues.push("Mã phí giao hàng nên bật Website");
  }

  if (issues.length === 0) {
    return {
      tone: "green" as const,
      title: "Sẵn sàng cho khách dùng",
      detail: "Đang hoạt động, hiện với khách và có kênh đặt món phù hợp.",
      issues
    };
  }

  return {
    tone: campaign.computedStatus === "ended" ? "red" as const : "yellow" as const,
    title: campaign.computedStatus === "ended" ? "Không còn chạy" : "Cần rà lại cấu hình",
    detail: issues[0],
    issues
  };
}

export function PromotionsWorkspace({
  campaigns,
  usage,
  freeItemOptions
}: {
  campaigns: PromotionWithStatus[];
  usage: PromotionUsageSummary[];
  freeItemOptions: FreeItemOption[];
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [panelMode, setPanelMode] = useState<PromotionPanelMode>("closed");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeCampaigns = campaigns.filter((campaign) => campaign.computedStatus === "active");
  const usageById = useMemo(() => new Map(usage.map((item) => [item.promotionId, item])), [usage]);
  const usedOrders = useMemo(() => usage.reduce((sum, item) => sum + item.orders, 0), [usage]);
  const discountTotal = useMemo(() => usage.reduce((sum, item) => sum + item.discount, 0), [usage]);
  const customerVisibleCampaigns = campaigns.filter((campaign) => campaign.show_on_customer_menu && campaign.computedStatus === "active" && hasCustomerOrderingChannel(campaign));
  const qrVisibleCampaigns = customerVisibleCampaigns.filter((campaign) => hasChannel(campaign, "QR_MENU"));
  const websiteVisibleCampaigns = customerVisibleCampaigns.filter((campaign) => hasChannel(campaign, "WEBSITE"));
  const attentionCampaigns = campaigns
    .filter((campaign) => campaignReadiness(campaign).tone !== "green")
    .sort((left, right) => {
      const leftEnded = left.computedStatus === "ended" ? 1 : 0;
      const rightEnded = right.computedStatus === "ended" ? 1 : 0;
      return rightEnded - leftEnded;
    })
    .slice(0, 4);
  const filteredCampaigns = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const matchesStatus = statusFilter === "all" || campaign.computedStatus === statusFilter;
      const matchesChannel = channelFilter === "all" || campaign.channels.includes(channelFilter);
      const matchesKeyword = !keyword || campaign.name.toLowerCase().includes(keyword) || campaign.code.toLowerCase().includes(keyword);
      return matchesStatus && matchesChannel && matchesKeyword;
    });
  }, [campaigns, channelFilter, query, statusFilter]);

  const topCampaigns = [...campaigns]
    .sort((a, b) => (usageById.get(b.id)?.orders ?? 0) - (usageById.get(a.id)?.orders ?? 0))
    .slice(0, 3);
  const selectedCampaign = selectedId ? campaigns.find((campaign) => campaign.id === selectedId) ?? null : null;

  const stats = [
    { label: "Chiến dịch đang chạy", value: activeCampaigns.length, meta: `${campaigns.length} tổng chiến dịch`, icon: Tag },
    { label: "Khách đang thấy", value: customerVisibleCampaigns.length, meta: `${qrVisibleCampaigns.length} QR · ${websiteVisibleCampaigns.length} Website`, icon: Ticket },
    { label: "Sắp diễn ra", value: campaigns.filter((campaign) => campaign.computedStatus === "scheduled").length, meta: "Theo ngày bắt đầu", icon: TrendingUp },
    { label: "Đã áp mã", value: usedOrders, meta: `Giảm ${formatVnd(discountTotal)}`, icon: BarChart3 }
  ];

  function openCreateDrawer() {
    setSelectedId(null);
    setPanelMode("create");
  }

  function openDetailDrawer(promotionId: string) {
    setSelectedId(promotionId);
    setPanelMode("detail");
  }

  function closeDrawer() {
    setPanelMode("closed");
    setSelectedId(null);
  }

  return (
    <div className="grid gap-3">
      <section className="dashboard-promotions-metric-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          return (
            <DashboardMetricCard key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} meta={stat.meta} tone={stat.value ? "green" : "yellow"} />
          );
        })}
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <div className="dashboard-panel p-4">
          <DashboardSectionHeader
            className="mb-4"
            title="Danh sách khuyến mãi"
            description="Màn chính chỉ giữ danh sách và chỉ số quan trọng. Mọi cấu hình chi tiết được mở trong drawer riêng."
            action={
              <Button type="button" onClick={openCreateDrawer} className="shadow-none hover:shadow-none">
                <Plus size={16} />
                Tạo khuyến mãi
              </Button>
            }
          />

          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_110px]">
            <label className="relative grid gap-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Tìm kiếm
              <Search className="pointer-events-none absolute bottom-4 left-3 h-4 w-4 text-[var(--outline)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tên chiến dịch hoặc mã..."
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-sm font-medium normal-case tracking-normal outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Trạng thái
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal outline-none">
                <option value="all">Tất cả</option>
                <option value="active">Đang chạy</option>
                <option value="scheduled">Sắp diễn ra</option>
                <option value="paused">Tạm dừng</option>
                <option value="ended">Đã kết thúc</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Kênh áp dụng
              <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal outline-none">
                <option value="all">Tất cả</option>
                <option value="IN_STORE">Tại quán</option>
                <option value="QR_MENU">QR Menu</option>
                <option value="WEBSITE">Website</option>
                <option value="EMAIL">Email</option>
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              className="self-end shadow-none hover:shadow-none"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setChannelFilter("all");
              }}
            >
              Xoá lọc
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="dashboard-muted-header grid grid-cols-[1.35fr_1fr_1fr_0.8fr_0.8fr_100px] gap-3 px-4 py-3 text-xs font-semibold uppercase max-lg:hidden">
              <span>Chiến dịch</span>
              <span>Điều kiện</span>
              <span>Kênh</span>
              <span>Sử dụng</span>
              <span>Trạng thái</span>
              <span>Chi tiết</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {filteredCampaigns.length === 0 && (
                <div className="grid min-h-52 place-items-center px-5 py-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  Chưa có chiến dịch phù hợp.
                </div>
              )}
              {filteredCampaigns.map((campaign, index) => {
                const condition = campaign.min_order_amount > 0 ? `Hóa đơn từ ${formatVnd(campaign.min_order_amount)}` : "Không yêu cầu tối thiểu";
                const usageRow = usageById.get(campaign.id);
                const CampaignIcon = campaign.discount_scope === "DELIVERY_FEE" ? Truck : Percent;
                return (
                  <div key={campaign.id} className="dashboard-selectable-row grid gap-3 px-4 py-3 lg:grid-cols-[1.35fr_1fr_1fr_0.8fr_0.8fr_100px]">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-11 w-11 place-items-center rounded-xl ${index === 0 ? "bg-[var(--accent)] text-white" : "bg-[var(--primary-soft)] text-[var(--primary)]"}`}>
                        <CampaignIcon size={18} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{campaign.name}</span>
                        <span className="font-mono text-xs font-semibold text-[var(--muted-foreground)]">Mã: {campaign.code}</span>
                        <span className="mt-1 block text-xs font-semibold text-[var(--primary)]">{campaignBenefitLabel(campaign)}</span>
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-[var(--muted-foreground)]">{condition}</span>
                    <span className="flex flex-wrap gap-2">
                      {campaign.channels.map((channel) => (
                        <Badge key={channel} tone="blue">{channelLabel(channel)}</Badge>
                      ))}
                    </span>
                    <span className="text-sm font-semibold text-[var(--muted-foreground)]">
                      {usageRow ? `${usageRow.orders} đơn · ${formatVnd(usageRow.discount)}` : "Chưa dùng"}
                    </span>
                    <span><Badge tone={statusTone(campaign.computedStatus)}>{statusLabel(campaign.computedStatus)}</Badge></span>
                    <div className="flex justify-start lg:justify-end">
                      <Button type="button" variant="secondary" className="h-9 px-3 shadow-none hover:shadow-none" onClick={() => openDetailDrawer(campaign.id)}>
                        Xem
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-3 text-sm font-semibold text-[var(--muted-foreground)]">
              Đang hiển thị {filteredCampaigns.length} / {campaigns.length} chiến dịch
            </div>
          </div>
        </div>

        <aside className="grid gap-3">
          <div className="dashboard-panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Khuyến mãi nổi bật</h2>
              <Gift className="text-[var(--accent)]" size={18} />
            </div>
            <div className="mt-4 grid gap-3">
              {topCampaigns.length === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] px-4 py-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  Chưa có chiến dịch nào để gợi ý.
                </div>
              )}
              {topCampaigns.map((campaign) => {
                const usageRow = usageById.get(campaign.id);
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => openDetailDrawer(campaign.id)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-left transition hover:border-[var(--primary)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{campaign.name}</p>
                        <p className="mt-1 font-mono text-xs font-semibold text-[var(--muted-foreground)]">{campaign.code}</p>
                      </div>
                      <Badge tone={statusTone(campaign.computedStatus)}>{statusLabel(campaign.computedStatus)}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[var(--muted-foreground)]">Số đơn</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">{usageRow?.orders ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)]">Mức giảm</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">{formatVnd(usageRow?.discount ?? 0)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dashboard-panel p-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Menu khách đang thấy gì?</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                  <QrCode size={16} className="text-[var(--primary)]" />
                  Mã hiện trên header
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{qrVisibleCampaigns.length}</p>
                <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">{websiteVisibleCampaigns.length} mã đang hiện ở đặt món online.</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                  <CheckCircle2 size={16} className="text-[var(--primary)]" />
                  Mã sẵn sàng
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{customerVisibleCampaigns.length}</p>
                <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Đang chạy, hiện với khách và có kênh phù hợp.</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                  <AlertTriangle size={16} className="text-[var(--accent)]" />
                  Cần rà lại
                </div>
                <div className="mt-3 grid gap-2">
                  {attentionCampaigns.length === 0 ? (
                    <p className="text-sm font-medium text-[var(--muted-foreground)]">Không có cảnh báo cấu hình.</p>
                  ) : (
                    attentionCampaigns.map((campaign) => {
                      const readiness = campaignReadiness(campaign);
                      return (
                        <button
                          key={campaign.id}
                          type="button"
                          onClick={() => openDetailDrawer(campaign.id)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left"
                        >
                          <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{campaign.code}</span>
                          <span className="mt-0.5 block text-xs font-medium text-[var(--muted-foreground)]">{readiness.detail}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">Gợi ý cấu hình tốt</p>
                <ul className="mt-2 grid gap-2 text-sm font-medium text-[var(--muted-foreground)]">
                  <li>- Giữ 1-2 mã đang chạy cùng lúc để khách dễ chọn.</li>
                  <li>- Ưu tiên mã theo giờ vắng hoặc món bán chậm.</li>
                  <li>- Bật `QR Menu` cho các mã chủ lực để tăng tỷ lệ áp dụng.</li>
                </ul>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {panelMode !== "closed" && (
        <div className="fixed inset-0 z-[var(--z-dashboard-drawer)] overflow-hidden overscroll-contain">
          <button type="button" className="drawer-backdrop absolute inset-0 z-0" aria-label="Đóng khuyến mãi" onClick={closeDrawer} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="promotion-drawer-title"
            className="drawer-panel absolute inset-y-0 right-0 z-[1] flex h-dvh max-h-dvh w-full max-w-[480px] flex-col border-l border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
              <div>
                <p className="dashboard-eyebrow text-[var(--muted-foreground)]">Khuyến mãi</p>
                <h3 id="promotion-drawer-title" className="dashboard-section-title mt-1">
                  {panelMode === "create" ? "Tạo chiến dịch mới" : selectedCampaign?.name ?? "Chi tiết chiến dịch"}
                </h3>
              </div>
              <button type="button" onClick={closeDrawer} className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]" aria-label="Đóng khuyến mãi">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5">
              {panelMode === "create" && (
                <form action={createPromotionAction} className="grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold">
                    Tên chiến dịch
                    <Input name="name" placeholder="VD: Giảm 20% đồ uống cuối tuần" required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Mã khuyến mãi
                    <Input name="code" className="font-mono uppercase" placeholder="WEEKEND20" required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Kiểu ưu đãi
                    <select name="rewardType" defaultValue="DISCOUNT" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-semibold outline-none">
                      <option value="DISCOUNT">Giảm tiền / phần trăm</option>
                      <option value="FREE_ITEM">Tặng món trong đơn</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Phạm vi ưu đãi
                    <select name="discountScope" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-semibold outline-none">
                      <option value="ORDER">Giảm giá đơn hàng</option>
                      <option value="DELIVERY_FEE">Giảm / miễn phí giao hàng</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Loại ưu đãi
                    <select name="discountType" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-semibold outline-none">
                      <option value="PERCENT">Giảm theo phần trăm</option>
                      <option value="FIXED">Giảm tiền trực tiếp</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Mức giảm
                    <Input name="discountValue" type="number" min={1} defaultValue="20" required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Hóa đơn tối thiểu
                    <Input name="minOrderAmount" type="number" min={0} step={1000} defaultValue={0} />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold">
                      Món tặng
                      <select name="freeItemMenuItemId" defaultValue="" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-semibold outline-none">
                        <option value="">Không áp dụng</option>
                        {freeItemOptions.map((item) => (
                          <option key={item.id} value={item.id} disabled={!item.isAvailable}>
                            {item.name} · {item.categoryName} · {formatVnd(item.price)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Số lượng tặng
                      <Input name="freeItemQuantity" type="number" min={1} max={50} step={1} defaultValue={1} />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold">
                      Tổng lượt dùng
                      <Input name="totalUsageLimit" type="number" min={1} step={1} placeholder="Không giới hạn" />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Lượt mỗi khách
                      <Input name="perCustomerUsageLimit" type="number" min={1} step={1} placeholder="Không giới hạn" />
                    </label>
                  </div>
                  <label className="grid gap-2 text-sm font-semibold">
                    Thời gian áp dụng
                    <div className="grid grid-cols-2 gap-2">
                      <Input name="startsAt" type="datetime-local" />
                      <Input name="endsAt" type="datetime-local" />
                    </div>
                  </label>
                  <div className="grid gap-2 text-sm font-semibold">
                    Kênh áp dụng
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium"><input name="channels" type="checkbox" value="IN_STORE" defaultChecked /> <Store size={14} /> Tại quán</label>
                      <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium"><input name="channels" type="checkbox" value="QR_MENU" defaultChecked /> <QrCode size={14} /> QR Menu</label>
                      <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium"><input name="channels" type="checkbox" value="WEBSITE" /> <Send size={14} /> Website</label>
                      <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium"><input name="channels" type="checkbox" value="EMAIL" /> Email</label>
                    </div>
                  </div>
                  <Button className="mt-2 shadow-none hover:shadow-none">
                    <Plus size={16} />
                    Tạo khuyến mãi
                  </Button>
                </form>
              )}

              {panelMode === "detail" && selectedCampaign && (
                <div className="grid gap-4">
                  {(() => {
                    const readiness = campaignReadiness(selectedCampaign);
                    return (
                      <div className={`rounded-xl border p-4 ${readiness.tone === "green" ? "border-[var(--primary)]/20 bg-[var(--primary-soft)]" : readiness.tone === "red" ? "border-[var(--accent)]/25 bg-[var(--accent-soft)]" : "border-[var(--warning)]/25 bg-[var(--warning-soft)]"}`}>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 text-[var(--foreground)]">
                            {readiness.tone === "green" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--foreground)]">{readiness.title}</p>
                            <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">{readiness.detail}</p>
                            {readiness.issues.length > 1 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {readiness.issues.slice(1).map((issue) => (
                                  <Badge key={issue} tone="yellow">{issue}</Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Tổng quan</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-[var(--foreground)]">{selectedCampaign.code}</p>
                      </div>
                      <Badge tone={statusTone(selectedCampaign.computedStatus)}>{statusLabel(selectedCampaign.computedStatus)}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[var(--muted-foreground)]">Loại giảm</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">{campaignBenefitLabel(selectedCampaign)}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)]">Phạm vi</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">{discountScopeLabel(selectedCampaign.discount_scope)}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)]">Món tặng</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">
                          {selectedCampaign.reward_type === "FREE_ITEM" ? freeItemName(freeItemOptions, selectedCampaign.free_item_menu_item_id) : "Không áp dụng"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)]">Tối thiểu</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">{selectedCampaign.min_order_amount > 0 ? formatVnd(selectedCampaign.min_order_amount) : "Không yêu cầu"}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)]">Giới hạn dùng</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">
                          {selectedCampaign.total_usage_limit ? `${usageById.get(selectedCampaign.id)?.orders ?? 0}/${selectedCampaign.total_usage_limit} lượt` : "Không giới hạn"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)]">Mỗi khách</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">
                          {selectedCampaign.per_customer_usage_limit ? `${selectedCampaign.per_customer_usage_limit} lượt` : "Không giới hạn"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)]">Bắt đầu</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">{formatDateTime(selectedCampaign.starts_at)}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)]">Kết thúc</p>
                        <p className="mt-1 font-semibold text-[var(--foreground)]">{formatDateTime(selectedCampaign.ends_at)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">Hiệu quả thực tế</h4>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                        <p className="text-[var(--muted-foreground)]">Số đơn đã áp</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{usageById.get(selectedCampaign.id)?.orders ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                        <p className="text-[var(--muted-foreground)]">Tổng giảm giá</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{formatVnd(usageById.get(selectedCampaign.id)?.discount ?? 0)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedCampaign.channels.map((channel) => (
                        <Badge key={channel} tone="blue">{channelLabel(channel)}</Badge>
                      ))}
                    </div>
                  </div>

                  <form action={updatePromotionAction} className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <input type="hidden" name="promotionId" value={selectedCampaign.id} />
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">Cấu hình chiến dịch</h4>
                      <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Sửa trực tiếp điều kiện áp dụng, mã và kênh hiển thị.</p>
                    </div>
                    <label className="grid gap-2 text-sm font-semibold">
                      Tên chiến dịch
                      <Input name="name" defaultValue={selectedCampaign.name} required />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Mã khuyến mãi
                      <Input name="code" className="font-mono uppercase" defaultValue={selectedCampaign.code} required />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Kiểu ưu đãi
                      <select name="rewardType" defaultValue={selectedCampaign.reward_type ?? "DISCOUNT"} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-semibold outline-none">
                        <option value="DISCOUNT">Giảm tiền / phần trăm</option>
                        <option value="FREE_ITEM">Tặng món trong đơn</option>
                      </select>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm font-semibold">
                        Phạm vi ưu đãi
                        <select name="discountScope" defaultValue={selectedCampaign.discount_scope ?? "ORDER"} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-semibold outline-none">
                          <option value="ORDER">Giảm giá đơn hàng</option>
                          <option value="DELIVERY_FEE">Giảm / miễn phí giao hàng</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-semibold">
                        Loại ưu đãi
                        <select name="discountType" defaultValue={selectedCampaign.discount_type} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-semibold outline-none">
                          <option value="PERCENT">Giảm theo phần trăm</option>
                          <option value="FIXED">Giảm tiền trực tiếp</option>
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm font-semibold">
                        Mức giảm
                        <Input name="discountValue" type="number" min={1} defaultValue={selectedCampaign.discount_value} required />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold">
                        Hóa đơn tối thiểu
                        <Input name="minOrderAmount" type="number" min={0} step={1000} defaultValue={selectedCampaign.min_order_amount} />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm font-semibold">
                        Món tặng
                        <select name="freeItemMenuItemId" defaultValue={selectedCampaign.free_item_menu_item_id ?? ""} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-semibold outline-none">
                          <option value="">Không áp dụng</option>
                          {freeItemOptions.map((item) => (
                            <option key={item.id} value={item.id} disabled={!item.isAvailable}>
                              {item.name} · {item.categoryName} · {formatVnd(item.price)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-semibold">
                        Số lượng tặng
                        <Input name="freeItemQuantity" type="number" min={1} max={50} step={1} defaultValue={selectedCampaign.free_item_quantity ?? 1} />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm font-semibold">
                        Tổng lượt dùng
                        <Input name="totalUsageLimit" type="number" min={1} step={1} defaultValue={selectedCampaign.total_usage_limit ?? ""} placeholder="Không giới hạn" />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold">
                        Lượt mỗi khách
                        <Input name="perCustomerUsageLimit" type="number" min={1} step={1} defaultValue={selectedCampaign.per_customer_usage_limit ?? ""} placeholder="Không giới hạn" />
                      </label>
                    </div>
                    <label className="grid gap-2 text-sm font-semibold">
                      Thời gian áp dụng
                      <div className="grid grid-cols-2 gap-2">
                        <Input name="startsAt" type="datetime-local" defaultValue={formatDateTimeLocal(selectedCampaign.starts_at)} />
                        <Input name="endsAt" type="datetime-local" defaultValue={formatDateTimeLocal(selectedCampaign.ends_at)} />
                      </div>
                    </label>
                    <div className="grid gap-2 text-sm font-semibold">
                      Kênh áp dụng
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium"><input name="channels" type="checkbox" value="IN_STORE" defaultChecked={hasChannel(selectedCampaign, "IN_STORE")} /> <Store size={14} /> Tại quán</label>
                        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium"><input name="channels" type="checkbox" value="QR_MENU" defaultChecked={hasChannel(selectedCampaign, "QR_MENU")} /> <QrCode size={14} /> QR Menu</label>
                        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium"><input name="channels" type="checkbox" value="WEBSITE" defaultChecked={hasChannel(selectedCampaign, "WEBSITE")} /> <Send size={14} /> Website</label>
                        <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium"><input name="channels" type="checkbox" value="EMAIL" defaultChecked={hasChannel(selectedCampaign, "EMAIL")} /> Email</label>
                      </div>
                    </div>
                    <Button className="shadow-none hover:shadow-none">
                      <Ticket size={16} />
                      Lưu cấu hình
                    </Button>
                  </form>

                  <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">Thao tác nhanh</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <form action={togglePromotionDisplayAction}>
                        <input type="hidden" name="promotionId" value={selectedCampaign.id} />
                        <input type="hidden" name="showOnCustomerMenu" value={String(!selectedCampaign.show_on_customer_menu)} />
                        <Button type="submit" variant="secondary" className="w-full shadow-none hover:shadow-none">
                          {selectedCampaign.show_on_customer_menu ? <EyeOff size={16} /> : <Eye size={16} />}
                          {selectedCampaign.show_on_customer_menu ? "Ẩn khỏi menu khách" : "Hiện trên menu khách"}
                        </Button>
                      </form>
                      <form action={togglePromotionAction}>
                        <input type="hidden" name="promotionId" value={selectedCampaign.id} />
                        <input type="hidden" name="isActive" value={String(!selectedCampaign.is_active)} />
                        <Button type="submit" variant="secondary" className="w-full shadow-none hover:shadow-none">
                          <Ticket size={16} />
                          {selectedCampaign.is_active ? "Tạm dừng chiến dịch" : "Kích hoạt lại"}
                        </Button>
                      </form>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--surface)] p-4">
                    <h4 className="text-sm font-semibold text-[var(--accent-strong)]">Vùng xoá chiến dịch</h4>
                    <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Chỉ xoá khi bạn chắc chắn không cần dùng lại mã này.</p>
                    <form action={deletePromotionAction} className="mt-4">
                      <input type="hidden" name="promotionId" value={selectedCampaign.id} />
                      <ConfirmActionButton
                        type="submit"
                        variant="ghost"
                        className="w-full border-[var(--accent)]/30 text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
                        confirmTitle="Xoá chiến dịch ưu đãi"
                        confirmDescription={`Mã ${selectedCampaign.code} sẽ bị xoá và không còn hiển thị trong menu khách.`}
                        confirmLabel="Xoá chiến dịch"
                      >
                        <Trash2 size={16} />
                        Xoá chiến dịch
                      </ConfirmActionButton>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
