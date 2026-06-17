"use client";

/* RealSettingsWorkspaceV2 — production /dashboard/settings.
 * Layout: Toolbar + rail trái 240px (sticky) + panel phải 1 section.
 *  - Mobile: rail co thành horizontal pill scroll (như demo).
 *  - Section đổi qua client state + router.replace, không reload toàn page.
 *  - Deeplink ?section=X giữ tương thích 100%.
 *  - Billing có sub-step ?billingStep=X&paymentId=X giữ nguyên.
 *  - Server actions không đổi (giữ name= input).
 */

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Bike,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  Paintbrush,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  WalletCards,
  type LucideIcon
} from "lucide-react";
import { Toolbar } from "../workspace-ui";
import { Badge } from "../primitives";
import { cn } from "@/lib/utils";
import {
  AiSetupSection,
  BranchesSection,
  BrandSection,
  HoursSection,
  NotificationsSection,
  PaymentsSection,
  PermissionsSection,
  ProfileSection,
  ReceiptSection,
  TablesSection
} from "./settings/section-forms";
import { OnlineSectionV2 } from "./settings/online-section";
import { BillingPanelV2 } from "./settings/billing-panel";
import {
  isSettingsSection,
  normalizeBillingStep,
  type BillingStepKey,
  type SettingsSectionKey,
  type SettingsSectionState,
  type SettingsSectionStates,
  type SettingsSectionTone
} from "./settings/section-states";
import type { Database } from "@/types/supabase";
import type { listStoreBranchesForManagement } from "@/services/branch-service";
import type { BranchDeliverySettings } from "@/services/delivery/branch-delivery-settings-service";
import type { getMapOperationalMetrics } from "@/services/map-ops-service";
import type { ReportScheduleSettings, listRecentReportLogs } from "@/services/report-schedule-service";
import type { getRestaurantBillingPortal } from "@/services/subscription-service";
import type { buildStoreSetupReadiness } from "@/services/ai-setup-readiness";
import type { PlanFeatureKey } from "@/services/billing/plan-features";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type BranchSummaries = Awaited<ReturnType<typeof listStoreBranchesForManagement>>;
type BillingPortal = Awaited<ReturnType<typeof getRestaurantBillingPortal>>;
type MapMetrics = Awaited<ReturnType<typeof getMapOperationalMetrics>> | null;
type ReportLogs = Awaited<ReturnType<typeof listRecentReportLogs>>;
type Readiness = ReturnType<typeof buildStoreSetupReadiness>;

type SectionMeta = {
  key: SettingsSectionKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

const SECTIONS: ReadonlyArray<SectionMeta> = [
  { key: "profile", label: "Hồ sơ quán", description: "Tên, loại hình, liên hệ; địa chỉ ghim trên bản đồ.", icon: Users },
  { key: "ai_setup", label: "Nhận diện thông minh", description: "AI tạo slogan, mô tả và logo cho quán.", icon: Sparkles },
  { key: "hours", label: "Giờ hoạt động", description: "Giờ mở cửa và QR cũ.", icon: Clock3 },
  { key: "branches", label: "Chi nhánh", description: "Chi nhánh mặc định, toạ độ và trạng thái.", icon: Store },
  { key: "tables", label: "Bàn & QR", description: "Bàn, khu vực và link QR.", icon: QrCode },
  { key: "online", label: "Đặt món online", description: "Đến lấy, giao hàng, phí ship.", icon: Bike },
  { key: "payments", label: "Thanh toán", description: "Ngân hàng nhận VietQR.", icon: CreditCard },
  { key: "billing", label: "Gói LogiVN", description: "Dùng thử, gia hạn và hoá đơn.", icon: WalletCards },
  { key: "notifications", label: "Thông báo", description: "Luồng cảnh báo, Telegram và Web Push.", icon: Bell },
  { key: "permissions", label: "Nhân quyền", description: "Tài khoản và phân quyền.", icon: ShieldCheck },
  { key: "receipt", label: "Mẫu in / hoá đơn", description: "Dòng cuối và QR hoá đơn.", icon: FileText },
  { key: "brand", label: "Thương hiệu", description: "Màu sắc và nhận diện.", icon: Paintbrush }
];

const SECTION_MAP: Record<SettingsSectionKey, SectionMeta> = SECTIONS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {} as Record<SettingsSectionKey, SectionMeta>);

const GROUPS: Array<{ title: string; keys: SettingsSectionKey[] }> = [
  { title: "Nền tảng cửa hàng", keys: ["profile", "hours", "branches", "brand", "receipt"] },
  { title: "Bán hàng & thanh toán", keys: ["tables", "online", "payments", "billing"] },
  { title: "Đội ngũ & tự động hoá", keys: ["ai_setup", "notifications", "permissions"] }
];

function onlineSettingsFingerprint(restaurant: RestaurantRow) {
  return [
    restaurant.online_ordering_enabled,
    restaurant.pickup_enabled,
    restaurant.delivery_enabled,
    restaurant.delivery_tracking_enabled,
    restaurant.online_payment_mode,
    restaurant.address,
    restaurant.store_lat,
    restaurant.store_lng,
    restaurant.delivery_radius_km,
    restaurant.free_delivery_radius_km,
    restaurant.delivery_base_fee,
    restaurant.delivery_fee_per_km,
    restaurant.min_order_for_delivery,
    restaurant.pickup_eta_minutes,
    restaurant.delivery_eta_minutes,
    restaurant.map_geocoding_provider,
    restaurant.map_routing_provider,
    restaurant.map_default_zoom,
    restaurant.map_display_style,
    restaurant.show_store_marker_on_ordering,
    restaurant.show_customer_distance,
    restaurant.delivery_area_mode,
    restaurant.delivery_area_name,
    restaurant.delivery_area_note,
    restaurant.delivery_area_ward_count,
    restaurant.delivery_fee_enabled,
    restaurant.service_fee_enabled,
    restaurant.service_fee_type,
    restaurant.service_fee_percent,
    restaurant.service_fee_min,
    restaurant.service_fee_max,
    restaurant.allow_outside_delivery_area,
    restaurant.show_delivery_eta,
    restaurant.require_outside_area_confirmation,
    restaurant.auto_suggest_nearest_branch,
    JSON.stringify(restaurant.delivery_fee_tiers ?? null),
    JSON.stringify(restaurant.delivery_area_polygon ?? null),
    JSON.stringify(restaurant.delivery_exclusion_zones ?? null)
  ]
    .map((value) => String(value ?? ""))
    .join("|");
}

function toneBadge(tone: SettingsSectionTone): "ok" | "orange" | "info" | "neutral" {
  return tone;
}

type Props = {
  restaurant: RestaurantRow;
  branches: BranchSummaries;
  branchDeliverySettings: BranchDeliverySettings[];
  mapOperationalMetrics: MapMetrics;
  reportSchedule: ReportScheduleSettings | null;
  reportLogs: ReportLogs;
  billingPortal: BillingPortal | null;
  setupReadiness: Readiness;
  sectionStates: SettingsSectionStates;
  initialSection: SettingsSectionKey;
  initialBillingStep: BillingStepKey;
  initialBillingPaymentId: string | null;
  billingError: string | null;
  gatedFeatureKey: PlanFeatureKey | null;
  sessionEmail: string;
  tableCount: number;
  menuItemCount: number;
  staffCount: number;
  qrMenuUrl: string;
  onlineOrderUrl: string;
  restaurantName: string;
};

export function RealSettingsWorkspaceV2(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /* State derived 100% from URL — useSearchParams re-renders on URL change.
   * Tránh local state + useEffect (cảnh báo react-hooks/set-state-in-effect). */
  const sectionParam = searchParams.get("section") ?? undefined;
  const active: SettingsSectionKey = isSettingsSection(sectionParam) ? sectionParam : props.initialSection;
  const billingStep: BillingStepKey = normalizeBillingStep(searchParams.get("billingStep") ?? undefined);
  const billingPaymentId: string | null = searchParams.get("paymentId");

  const meta = SECTION_MAP[active];
  const Icon = meta.icon;
  const groupTitle = useMemo(() => GROUPS.find((g) => g.keys.includes(active))?.title ?? "", [active]);
  const state: SettingsSectionState = props.sectionStates[active];

  function selectSection(next: SettingsSectionKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", next);
    if (next !== "billing") {
      params.delete("billingStep");
      params.delete("paymentId");
      params.delete("billingError");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow="Hệ thống" title="Cài đặt">
        <span className="inline-flex h-9 items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
          Sẵn sàng <span className="d-num font-bold text-[var(--d-text)]">{props.setupReadiness.score}%</span>
        </span>
        <span className="hidden h-9 items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)] sm:inline-flex">
          Bàn <span className="d-num font-bold text-[var(--d-text)]">{props.tableCount}</span>
        </span>
        <span className="hidden h-9 items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)] sm:inline-flex">
          Món <span className="d-num font-bold text-[var(--d-text)]">{props.menuItemCount}</span>
        </span>
      </Toolbar>

      {/* Mobile / tablet: pill scroll thay rail */}
      <nav aria-label="Cài đặt" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
        {SECTIONS.map((s) => {
          const on = s.key === active;
          const tone = props.sectionStates[s.key].tone;
          const SIcon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => selectSection(s.key)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--d-r-pill)] border px-3 text-[length:var(--d-fs-sm)] font-semibold transition",
                on
                  ? "border-[var(--d-jade)] bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                  : "border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)]"
              )}
            >
              <SIcon size={14} />
              {s.label}
              <span className={cn(
                "ml-1 h-1.5 w-1.5 rounded-full",
                tone === "ok" && (on ? "bg-white/80" : "bg-[var(--d-ok-fg)]"),
                tone === "orange" && "bg-[var(--d-orange)]",
                tone === "info" && (on ? "bg-white/80" : "bg-[var(--d-info-fg)]"),
                tone === "neutral" && "bg-[var(--d-text-faint)]"
              )} />
            </button>
          );
        })}
      </nav>

      <div className="grid gap-[var(--d-s-4)] lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Rail desktop */}
        <nav className="hidden self-start overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] lg:sticky lg:top-[calc(var(--d-topbar-h)+var(--d-s-4))] lg:block">
          {GROUPS.map((g, gi) => (
            <div key={g.title}>
              <p className={cn("px-3 pb-1.5 pt-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]", gi > 0 && "border-t border-[var(--d-line)]")}>
                {g.title}
              </p>
              <div className="flex flex-col px-1.5 pb-1.5">
                {g.keys.map((k) => {
                  const item = SECTION_MAP[k];
                  const on = active === k;
                  const summary = props.sectionStates[k];
                  const SIcon = item.icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => selectSection(k)}
                      className={cn(
                        "flex items-center gap-2 rounded-[var(--d-r-md)] px-2 py-1.5 text-left transition-colors",
                        on
                          ? "bg-[var(--d-primary-soft)] text-[var(--d-primary)]"
                          : "text-[var(--d-text-muted)] hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"
                      )}
                      aria-current={on ? "page" : undefined}
                    >
                      <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-[var(--d-r-sm)]", on ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "text-[var(--d-text-faint)]")}>
                        <SIcon size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[length:var(--d-fs-xs)] font-semibold">{item.label}</span>
                      <Badge tone={toneBadge(summary.tone)} className="hidden 2xl:inline-flex">{summary.label}</Badge>
                      {on ? <ChevronRight size={13} className="flex-none text-[var(--d-primary)]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Panel chính */}
        <div className="min-w-0">
          <header className="mb-[var(--d-s-4)] flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]">
                <Icon size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="d-eyebrow text-[var(--d-orange-600)]">{groupTitle}</p>
                <h2 className="mt-0.5 text-[length:var(--d-fs-h1)] font-bold text-[var(--d-text)]">{meta.label}</h2>
                <p className="mt-1 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{meta.description}</p>
              </div>
            </div>
            <Badge tone={toneBadge(state.tone)}>{state.label}</Badge>
          </header>

          <section className="min-w-0">
            {active === "profile" ? <ProfileSection restaurant={props.restaurant} email={props.sessionEmail} /> : null}
            {active === "ai_setup" ? <AiSetupSection setupReadiness={props.setupReadiness} restaurantName={props.restaurantName} /> : null}
            {active === "hours" ? <HoursSection restaurant={props.restaurant} /> : null}
            {active === "branches" ? <BranchesSection branches={props.branches} /> : null}
            {active === "tables" ? <TablesSection restaurant={props.restaurant} tableCount={props.tableCount} qrMenuUrl={props.qrMenuUrl} /> : null}
            {active === "online" ? (
              <OnlineSectionV2
                key={`online-${onlineSettingsFingerprint(props.restaurant)}`}
                settings={props.restaurant as unknown as Parameters<typeof OnlineSectionV2>[0]["settings"]}
                onlineUrl={props.onlineOrderUrl}
                branchDeliverySettings={props.branchDeliverySettings}
                mapOperationalMetrics={props.mapOperationalMetrics}
              />
            ) : null}
            {active === "payments" ? <PaymentsSection restaurant={props.restaurant} /> : null}
            {active === "notifications" ? (
              <NotificationsSection
                restaurant={props.restaurant}
                branches={props.branches}
                reportSchedule={props.reportSchedule}
                reportLogs={props.reportLogs}
              />
            ) : null}
            {active === "permissions" ? <PermissionsSection /> : null}
            {active === "receipt" ? <ReceiptSection restaurant={props.restaurant} /> : null}
            {active === "brand" ? <BrandSection restaurant={props.restaurant} /> : null}
            {active === "billing" && props.billingPortal ? (
              <BillingPanelV2
                billing={props.billingPortal}
                billingError={props.billingError}
                tableCount={props.tableCount}
                menuItemCount={props.menuItemCount}
                staffCount={props.staffCount}
                activeStep={billingStep}
                selectedPaymentId={billingPaymentId}
                gatedFeatureKey={props.gatedFeatureKey}
              />
            ) : null}
            {active === "billing" && !props.billingPortal ? (
              <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-6)] text-center text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                Đang tải dữ liệu gói LogiVN…
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
