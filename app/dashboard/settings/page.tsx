import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Bell,
  Bike,
  Check,
  Clock3,
  CreditCard,
  Crown,
  Download,
  ExternalLink,
  FileText,
  Hourglass,
  LockKeyhole,
  Paintbrush,
  MapPin,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  TimerReset,
  Users,
  WalletCards,
  X,
  type LucideIcon
} from "lucide-react";
import { requestSubscriptionPaymentAction, updateReportScheduleAction, updateRestaurantSettingsAction } from "@/app/dashboard/actions";
import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AiSetupStudio } from "@/components/dashboard/ai-setup-studio";
import { BranchDeliveryControls } from "@/components/dashboard/branch-delivery-controls";
import { BranchSettingsPanel } from "@/components/dashboard/branch-settings-panel";
import { MapOperationalMetricsPanel } from "@/components/dashboard/map-operational-metrics-panel";
import { OrderingSettingsForm } from "@/components/dashboard/ordering-settings-form";
import { PaymentSettingsForm } from "@/components/dashboard/payment-settings-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDashboardAccessForSettings } from "@/lib/dashboard-access";
import { formatVnd } from "@/lib/money";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { cn } from "@/lib/utils";
import { getReportScheduleForRestaurant, listRecentReportLogs, type ReportScheduleSettings } from "@/services/report-schedule-service";
import { getRestaurantDashboard, listRestaurantUsers } from "@/services/restaurant-service";
import { buildStoreSetupReadiness } from "@/services/ai-setup-readiness";
import { listStoreBranchesForManagement } from "@/services/branch-service";
import { listDeliveryBranchSettings, type BranchDeliverySettings } from "@/services/delivery/branch-delivery-settings-service";
import { getMapOperationalMetrics } from "@/services/map-ops-service";
import { getRestaurantBillingPortal } from "@/services/subscription-service";
import type { Database } from "@/types/supabase";

export const dynamic = "force-dynamic";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type BillingPortal = Awaited<ReturnType<typeof getRestaurantBillingPortal>>;
type SettingsSectionKey =
  | "profile"
  | "ai_setup"
  | "hours"
  | "branches"
  | "tables"
  | "online"
  | "payments"
  | "notifications"
  | "permissions"
  | "receipt"
  | "brand"
  | "billing";

type SettingsSection = {
  key: SettingsSectionKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

const settingsSections: SettingsSection[] = [
  { key: "profile", label: "Hồ sơ quán", description: "Tên, loại hình, liên hệ; địa chỉ lấy từ bản đồ", icon: Users },
  { key: "ai_setup", label: "Nhận diện thông minh", description: "Tạo slogan, mô tả và logo cho quán", icon: Sparkles },
  { key: "hours", label: "Giờ hoạt động", description: "Giờ mở cửa và QR cũ", icon: Clock3 },
  { key: "branches", label: "Chi nhánh", description: "Chi nhánh mặc định, tọa độ và trạng thái", icon: Store },
  { key: "tables", label: "Bàn & QR", description: "Bàn, khu vực và link QR", icon: QrCode },
  { key: "online", label: "Đặt món online", description: "Đến lấy, giao hàng, phí ship", icon: Bike },
  { key: "payments", label: "Thanh toán", description: "Ngân hàng nhận VietQR", icon: CreditCard },
  { key: "billing", label: "Gói LogiVN", description: "Dùng thử, gia hạn và hoá đơn", icon: WalletCards },
  { key: "notifications", label: "Thông báo", description: "Cảnh báo đơn và thanh toán", icon: Bell },
  { key: "permissions", label: "Nhân quyền", description: "Tài khoản và phân quyền", icon: ShieldCheck },
  { key: "receipt", label: "Mẫu in/hóa đơn", description: "Dòng cuối và QR hóa đơn", icon: FileText },
  { key: "brand", label: "Thương hiệu", description: "Màu sắc và nhận diện", icon: Paintbrush }
];

const settingsSectionMap = Object.fromEntries(settingsSections.map((item) => [item.key, item])) as Record<SettingsSectionKey, SettingsSection>;

const settingsSectionGroups: Array<{
  title: string;
  description: string;
  keys: SettingsSectionKey[];
}> = [
  {
    title: "Nền tảng cửa hàng",
    description: "Những gì khách và hệ thống luôn cần biết về quán.",
    keys: ["profile", "hours", "branches", "brand", "receipt"]
  },
  {
    title: "Bán hàng & thanh toán",
    description: "Tối ưu các luồng kiếm doanh thu và cấu hình nhận tiền.",
    keys: ["tables", "online", "payments", "billing"]
  },
  {
    title: "Đội ngũ & tự động hóa",
    description: "Nhận diện thương hiệu, cảnh báo vận hành và phân quyền nhân sự.",
    keys: ["ai_setup", "notifications", "permissions"]
  }
];

function publicUsageLabel(label: string) {
  return label
    .replace(/AI requests/gi, "Lượt trợ lý thông minh")
    .replace(/AI/gi, "Trợ lý thông minh")
    .replace(/quota/gi, "lượt dùng")
    .replace(/Export PDF/gi, "Xuất báo cáo");
}

type SettingsSectionState = {
  label: string;
  detail: string;
  tone: "success" | "warning" | "neutral";
};

function sectionStateTone(tone: SettingsSectionState["tone"]) {
  if (tone === "success") return "border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]";
  if (tone === "warning") return "border-[var(--accent)]/15 bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  return "border-[var(--border)] bg-[var(--surface-container)] text-[var(--muted-foreground)]";
}

function normalizeSection(value: string | string[] | undefined): SettingsSectionKey | null {
  const section = Array.isArray(value) ? value[0] : value;
  return settingsSections.some((item) => item.key === section) ? (section as SettingsSectionKey) : null;
}

function timeValue(value: string | null) {
  return value?.slice(0, 5) ?? "";
}

function FieldGroup({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-panel p-4">
      <h2 className="dashboard-section-title">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ProfileSettingsForm({ restaurant, email }: { restaurant: RestaurantRow; email: string }) {
  const hasPinnedLocation = restaurant.store_lat !== null && restaurant.store_lng !== null;

  return (
    <form action={updateRestaurantSettingsAction}>
      <input type="hidden" name="settingsSection" value="profile" />
      <FieldGroup title="Profile cửa hàng">
        <div className="mb-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="h-14 bg-[linear-gradient(135deg,#0F4D3A_0%,#174F43_45%,#F28C28_100%)]" />
          <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
            <div className="-mt-7 grid h-14 w-14 place-items-center overflow-hidden rounded-xl border-4 border-[var(--surface)] bg-[var(--soft-surface)] text-[var(--primary)]">
              {restaurant.logo_url ? (
                <Image src={restaurant.logo_url} alt={`Logo ${restaurant.name}`} width={80} height={80} className="h-full w-full object-cover" />
              ) : (
                <Store size={22} />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-2">
              <h2 className="truncate text-lg font-semibold text-[var(--foreground)]">{restaurant.name}</h2>
              <p className="mt-1 truncate text-sm font-medium text-[var(--muted-foreground)]">{restaurant.slug}.logivn.com · {restaurant.hotline || "Chưa có hotline"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-[1fr_190px]">
              <label className="grid gap-2 text-sm font-black">
                Tên quán
                <Input name="name" defaultValue={restaurant.name} required />
              </label>
              <label className="grid gap-2 text-sm font-black">
                Loại hình
                <select
                  name="businessType"
                  defaultValue={restaurant.business_type ?? ""}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="">Chưa chọn</option>
                  <option value="CAFE">Café</option>
                  <option value="RESTAURANT">Nhà hàng</option>
                  <option value="FAST_FOOD">Quán ăn nhanh</option>
                  <option value="BAR">Bar</option>
                  <option value="OTHER">Khác</option>
                </select>
              </label>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <MapPin size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[var(--foreground)]">Địa chỉ & ghim vị trí</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
                      {restaurant.address || "Chưa cấu hình địa chỉ quán."}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                      {hasPinnedLocation
                        ? `Đã ghim: ${restaurant.store_lat?.toFixed(5)}, ${restaurant.store_lng?.toFixed(5)}`
                        : "Chưa có toạ độ. Khách sẽ không đo được khoảng cách chính xác nếu quán bật giao hàng."}
                    </p>
                  </div>
                </div>
                <Link
                  href="/dashboard/settings?section=online"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-4 text-sm font-bold text-[var(--primary-strong)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--secondary-soft)]"
                >
                  Cập nhật trên bản đồ
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-black">
                Hotline
                <Input name="hotline" defaultValue={restaurant.hotline ?? ""} placeholder="0901234567" />
              </label>
              <label className="grid gap-2 text-sm font-black">
                Email
                <Input name="contactEmail" type="email" defaultValue={restaurant.contact_email ?? email} />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-black">
              Mô tả quán
              <textarea
                name="description"
                defaultValue={restaurant.description ?? ""}
                placeholder="Mô tả ngắn"
                className="min-h-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm font-medium outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button>Lưu hồ sơ quán</Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function HoursSettingsForm({ restaurant }: { restaurant: RestaurantRow }) {
  return (
    <form action={updateRestaurantSettingsAction}>
      <input type="hidden" name="settingsSection" value="hours" />
      <FieldGroup title="Giờ hoạt động">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-2 text-sm font-black">
            Giờ mở cửa
            <Input name="openingTime" type="time" defaultValue={timeValue(restaurant.opening_time)} />
          </label>
          <label className="grid gap-2 text-sm font-black">
            Giờ đóng cửa
            <Input name="closingTime" type="time" defaultValue={timeValue(restaurant.closing_time)} />
          </label>
          <label className="flex min-h-11 items-center gap-3 self-end rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black">
            <input type="checkbox" name="allowLegacyQr" value="true" defaultChecked={restaurant.allow_legacy_qr} className="h-5 w-5 accent-[var(--accent)]" />
            Cho phép QR cũ
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <Button>Lưu giờ hoạt động</Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function TablesSettingsPanel({ restaurant, tableCount, qrMenuUrl }: { restaurant: RestaurantRow; tableCount: number; qrMenuUrl: string }) {
  return (
    <FieldGroup title="Bàn & QR">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
          <p className="metric-number text-2xl font-semibold text-[var(--foreground)]">{tableCount}</p>
          <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Bàn đang quản lý</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
          <p className="metric-number text-2xl font-semibold text-[var(--foreground)]">{restaurant.allow_legacy_qr ? "Bật" : "Tắt"}</p>
          <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">QR cũ</p>
        </div>
        <Link href="/dashboard/tables" className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[#FFF7EB]">
          <QrCode size={18} />
          Quản lý bàn & QR
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{qrMenuUrl}</span>
        <a href={qrMenuUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white">
          <ExternalLink size={16} />
          Mở link
        </a>
      </div>
    </FieldGroup>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Chưa lên lịch";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function NotificationSettingsForm({
  restaurant,
  reportSchedule,
  reportLogs
}: {
  restaurant: RestaurantRow;
  reportSchedule: ReportScheduleSettings | null;
  reportLogs: Awaited<ReturnType<typeof listRecentReportLogs>>;
}) {
  return (
    <div className="grid gap-4">
      <form action={updateRestaurantSettingsAction}>
        <input type="hidden" name="settingsSection" value="notifications" />
        <FieldGroup title="Thông báo vận hành">
          <div className="grid gap-3">
            <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-4 text-sm font-semibold">
              Báo đơn mới
              <input type="checkbox" name="notifyNewOrder" value="true" defaultChecked={restaurant.notify_new_order} className="h-5 w-5 accent-[var(--accent)]" />
            </label>
            <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-4 text-sm font-semibold">
              Báo đơn chờ thanh toán
              <input type="checkbox" name="notifyPaymentWaiting" value="true" defaultChecked={restaurant.notify_payment_waiting} className="h-5 w-5 accent-[var(--accent)]" />
            </label>
            <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-4 text-sm font-semibold">
              Hiển thị mã khuyến mãi trên menu khách
              <input type="checkbox" name="showPromotionsOnMenu" value="true" defaultChecked={restaurant.show_promotions_on_menu} className="h-5 w-5 accent-[var(--accent)]" />
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <Button>Lưu thông báo</Button>
          </div>
        </FieldGroup>
      </form>

      {reportSchedule ? (
        <form action={updateReportScheduleAction}>
          <FieldGroup title="Báo cáo tự động qua email">
            <div className="grid gap-4">
              <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-4 text-sm font-semibold">
                Bật gửi báo cáo định kỳ
                <input type="checkbox" name="enabled" value="true" defaultChecked={reportSchedule.enabled} className="h-5 w-5 accent-[var(--accent)]" />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--muted-foreground)]">Lần gửi gần nhất</span>
                    <strong>{formatDateTime(reportSchedule.lastSentAt)}</strong>
                  </div>
                  <div className="mt-2 flex justify-between gap-4">
                    <span className="text-[var(--muted-foreground)]">Lần gửi tiếp theo</span>
                    <strong>{formatDateTime(reportSchedule.nextRunAt)}</strong>
                  </div>
                </div>
                <label className="grid gap-2 text-sm font-semibold">
                  Email nhận báo cáo
                  <textarea
                    name="recipients"
                    defaultValue={reportSchedule.recipients.join("\n")}
                    placeholder="chuquan@quan.vn&#10;ketoan@quan.vn"
                    className="min-h-24 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm font-medium outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                  />
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">Tối đa 10 email, cách nhau bằng xuống dòng hoặc dấu phẩy.</span>
                </label>
              </div>
              <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-[var(--foreground)]">Lịch gửi & file đính kèm</p>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">Chỉ mở phần này khi cần đổi chu kỳ hoặc loại file gửi kèm.</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
                    {reportSchedule.frequency}
                  </span>
                </summary>
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="grid gap-2 text-sm font-semibold">
                      Chu kỳ
                      <select name="frequency" defaultValue={reportSchedule.frequency} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none">
                        <option value="weekly">Hàng tuần</option>
                        <option value="monthly">Hàng tháng</option>
                        <option value="yearly">Hàng năm</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Giờ gửi
                      <Input name="sendHour" type="number" min={0} max={23} defaultValue={reportSchedule.sendHour} />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Thứ gửi
                      <select name="sendDayOfWeek" defaultValue={reportSchedule.sendDayOfWeek} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none">
                        <option value={1}>Thứ 2</option>
                        <option value={2}>Thứ 3</option>
                        <option value={3}>Thứ 4</option>
                        <option value={4}>Thứ 5</option>
                        <option value={5}>Thứ 6</option>
                        <option value={6}>Thứ 7</option>
                        <option value={7}>Chủ nhật</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Ngày gửi
                      <Input name="sendDayOfMonth" type="number" min={1} max={31} defaultValue={reportSchedule.sendDayOfMonth} />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr]">
                    <label className="grid gap-2 text-sm font-semibold">
                      Tháng gửi
                      <Input name="sendMonth" type="number" min={1} max={12} defaultValue={reportSchedule.sendMonth} />
                    </label>
                    <label className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold">
                      <input type="checkbox" name="includeCsv" value="true" defaultChecked={reportSchedule.includeCsv} className="h-5 w-5 accent-[var(--accent)]" />
                      Đính kèm CSV
                    </label>
                    <label className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold">
                      <input type="checkbox" name="includeJson" value="true" defaultChecked={reportSchedule.includeJson} className="h-5 w-5 accent-[var(--accent)]" />
                      Đính kèm dữ liệu chi tiết
                    </label>
                  </div>
                </div>
              </details>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
                Giữ vùng này gọn để chủ quán chỉ tập trung vào email nhận báo cáo và lịch gửi tiếp theo.
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button>Lưu lịch gửi báo cáo</Button>
            </div>
          </FieldGroup>
        </form>
      ) : null}

      <details className="dashboard-panel group overflow-hidden p-5 md:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xl font-semibold text-[var(--foreground)]">Lịch sử gửi báo cáo</p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Mở khi cần kiểm tra lịch sử gửi hoặc lỗi email.</p>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
            {reportLogs.length} bản ghi
          </span>
        </summary>
        <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {reportLogs.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm font-medium text-[var(--muted-foreground)]">Chưa có lần gửi báo cáo nào.</div>
          ) : (
            reportLogs.map((log) => (
              <div key={log.id} className="grid gap-2 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0 md:grid-cols-[1fr_110px_1.3fr]">
                <span>
                  <span className="block font-semibold">{log.period_type} · {log.period_start} - {log.period_end}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{formatDateTime(log.sent_at ?? log.created_at)}</span>
                </span>
                <span className={`font-semibold ${log.status === "sent" ? "text-[var(--primary)]" : log.status === "failed" ? "text-[var(--accent-strong)]" : "text-[var(--muted-foreground)]"}`}>{log.status}</span>
                <span className="truncate text-[var(--muted-foreground)]">{log.error_message ?? log.recipient_emails.join(", ")}</span>
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}

function PermissionsPanel() {
  return (
    <FieldGroup title="Nhân quyền">
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/dashboard/staff" className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[#FFF7EB]">
          <ShieldCheck size={18} />
          Thêm nhân viên
        </Link>
        <Link href="/dashboard/staff" className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]">
          Xem danh sách nhân viên
        </Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
          <p className="font-semibold text-[var(--foreground)]">ADMIN</p>
          <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">Cài đặt, báo cáo, nhân viên</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
          <p className="font-semibold text-[var(--foreground)]">STAFF</p>
          <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">Đơn hàng, bếp, thanh toán</p>
        </div>
      </div>
    </FieldGroup>
  );
}

function ReceiptSettingsForm({ restaurant }: { restaurant: RestaurantRow }) {
  return (
    <form action={updateRestaurantSettingsAction}>
      <input type="hidden" name="settingsSection" value="receipt" />
      <FieldGroup title="Mẫu in/hóa đơn">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <label className="grid gap-2 text-sm font-black">
            Dòng cuối hóa đơn
            <Input name="receiptFooter" defaultValue={restaurant.receipt_footer ?? ""} placeholder="Cảm ơn quý khách" />
          </label>
          <label className="flex min-h-11 items-center gap-3 self-end rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black">
            <input type="checkbox" name="receiptShowQr" value="true" defaultChecked={restaurant.receipt_show_qr} className="h-5 w-5 accent-[var(--accent)]" />
            In QR
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <Button>Lưu mẫu hóa đơn</Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function BrandSettingsForm({ restaurant }: { restaurant: RestaurantRow }) {
  return (
    <form action={updateRestaurantSettingsAction}>
      <input type="hidden" name="settingsSection" value="brand" />
      <FieldGroup title="Giao diện thương hiệu">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-black">
            Màu chính
            <Input name="brandPrimary" defaultValue={restaurant.brand_primary ?? "#0F4D3A"} />
          </label>
          <label className="grid gap-2 text-sm font-black">
            Màu nhấn
            <Input name="brandAccent" defaultValue={restaurant.brand_accent ?? "#F28C28"} />
          </label>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["Màu chính", restaurant.brand_primary ?? "#0F4D3A"],
            ["Màu nhấn", restaurant.brand_accent ?? "#F28C28"],
            ["Màu nền", "#FFF7EB"]
          ].map(([label, color]) => (
            <div key={label} className="flex h-14 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3">
              <span className="h-9 w-9 rounded-lg" style={{ background: color }} />
              <span>
                <span className="block text-xs font-bold text-[var(--muted-foreground)]">{label}</span>
                <span className="font-mono text-sm font-black">{color}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button>Lưu thương hiệu</Button>
        </div>
      </FieldGroup>
    </form>
  );
}

type BillingPlanView = BillingPortal["plans"][number];
type BillingPaymentView = BillingPortal["paymentRequests"][number];
type BillingStepKey = "current" | "compare" | "payment" | "processing" | "history" | "detail" | "manage";

const billingSteps: Array<{ key: BillingStepKey; index: number; title: string; subtitle: string }> = [
  { key: "current", index: 1, title: "Gói hiện tại", subtitle: "Xem nhanh gói đang dùng và mức sử dụng" },
  { key: "compare", index: 2, title: "So sánh gói", subtitle: "Dễ dàng so sánh và chọn gói phù hợp" },
  { key: "payment", index: 3, title: "Thanh toán", subtitle: "Thanh toán nhanh chóng qua VietQR" },
  { key: "processing", index: 4, title: "Đang xử lý", subtitle: "Theo dõi trạng thái thanh toán" },
  { key: "history", index: 5, title: "Lịch sử giao dịch", subtitle: "Tất cả giao dịch và hoá đơn của bạn" },
  { key: "detail", index: 6, title: "Chi tiết giao dịch", subtitle: "Thông tin chi tiết của hoá đơn" },
  { key: "manage", index: 7, title: "Quản lý gói", subtitle: "Nâng cấp, hạ cấp hoặc huỷ gói" }
];

function normalizeBillingStep(value: string | string[] | undefined): BillingStepKey {
  const step = Array.isArray(value) ? value[0] : value;
  return billingSteps.some((item) => item.key === step) ? (step as BillingStepKey) : "current";
}

function billingStepHref(step: BillingStepKey, paymentId?: string | null) {
  const params = new URLSearchParams({
    section: "billing",
    billingStep: step
  });
  if (paymentId) params.set("paymentId", paymentId);
  return `/dashboard/settings?${params.toString()}`;
}

function formatBillingDate(value: string | null | undefined) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatBillingDateTime(value: string | null | undefined) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function subscriptionStatusLabel(status: string, hasPendingPayment: boolean, usable: boolean) {
  if (usable && hasPendingPayment) return "Đang hoạt động";

  const labels: Record<string, string> = {
    trialing: "Đang dùng thử",
    pending_payment: "Chờ thanh toán",
    active: "Đang hoạt động",
    past_due: "Quá hạn",
    suspended: "Tạm dừng",
    cancelled: "Đã huỷ",
    expired: "Hết hạn"
  };

  return labels[status] ?? status;
}

function paymentStatusLabel(status: BillingPaymentView["status"]) {
  const labels: Record<BillingPaymentView["status"], string> = {
    waiting_confirm: "Đang xử lý",
    confirmed: "Thành công",
    rejected: "Thất bại",
    expired: "Hết hạn"
  };

  return labels[status] ?? status;
}

function paymentStatusClass(status: BillingPaymentView["status"]) {
  if (status === "confirmed") return "border-[#CFE8D8] bg-[#EAF7EF] text-[#0F6B3F]";
  if (status === "rejected" || status === "expired") return "border-[#F6D2C9] bg-[#FFF1EC] text-[#B94724]";
  return "border-[#F4D7AF] bg-[#FFF5E8] text-[#B96618]";
}

function planFeatureList(plan: BillingPlanView) {
  return Array.isArray(plan.features) ? plan.features.filter((feature): feature is string => typeof feature === "string") : [];
}

function planShortName(plan: Pick<BillingPlanView, "name" | "code">) {
  if (plan.code === "pro") return "PRO";
  if (plan.code === "premium") return "PREMIUM";
  return plan.name.replace(/^LogiVN\s*/i, "").toUpperCase();
}

function limitLabel(limit: number | null | undefined, unit: string | undefined) {
  if (limit === null || limit === undefined) return "Không giới hạn";
  return `${new Intl.NumberFormat("vi-VN").format(limit)}${unit ? ` ${unit}` : ""}`;
}

function usagePercent(used: number, limit: number | null | undefined) {
  if (!limit || limit <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function periodProgress(start: string | null | undefined, end: string | null | undefined, daysLeft: number) {
  const startTime = start ? new Date(start).getTime() : Number.NaN;
  const endTime = end ? new Date(end).getTime() : Number.NaN;
  const now = Date.now();

  if (!Number.isNaN(startTime) && !Number.isNaN(endTime) && endTime > startTime) {
    return Math.max(4, Math.min(100, Math.round(((now - startTime) / (endTime - startTime)) * 100)));
  }

  if (daysLeft <= 0) return 100;
  return Math.max(8, Math.min(100, 100 - Math.round((daysLeft / 30) * 100)));
}

function BillingStepHeader({ index, title, subtitle }: { index: number; title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-[var(--foreground)]">{index}. {title}</p>
      <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{subtitle}</p>
    </div>
  );
}

function BillingSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("billing-flow-surface rounded-[24px] border border-[#E7E0D6] bg-[#FFFDF8] shadow-[0_18px_55px_rgba(21,30,24,0.06)]", className)}>
      {children}
    </section>
  );
}

function SoftPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-semibold", className)}>
      {children}
    </span>
  );
}

function BillingProgress({ value, tone = "green" }: { value: number; tone?: "green" | "orange" }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#D8D0C3]">
      <div
        className={cn("h-full rounded-full", tone === "green" ? "bg-[#0F6B3F]" : "bg-[#F2983A]")}
        style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function UsageMiniCard({
  icon: Icon,
  label,
  value,
  meta,
  percent,
  tone = "green"
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  meta: string;
  percent: number;
  tone?: "green" | "orange";
}) {
  return (
    <div className="rounded-[16px] border border-[#E8E0D5] bg-[#FFFDF8] p-3">
      <div className="flex items-center gap-2">
        <span className={cn("grid h-6 w-6 place-items-center rounded-full", tone === "green" ? "bg-[#E8F4EC] text-[#0F6B3F]" : "bg-[#FFF0DB] text-[#CF741B]")}>
          <Icon size={13} aria-hidden="true" />
        </span>
        <p className="truncate text-xs font-black text-[#323831]">{label}</p>
      </div>
      <p className="mt-3 text-[15px] font-black tracking-[-0.02em] text-[#151915]">{value}</p>
      <BillingProgress value={percent} tone={tone} />
      <p className="mt-2 text-[11px] font-semibold text-[#7A817B]">{meta}</p>
    </div>
  );
}

function BillingReadinessItem({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex min-h-[74px] items-start gap-2 rounded-[14px] border border-[#E8E0D5] bg-white px-3 py-3">
      <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full", done ? "bg-[#EAF7EF] text-[#0F6B3F]" : "bg-[#FFF5E8] text-[#B96618]")}>
        {done ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black text-[#151915]">{label}</span>
        <span className="mt-1 block text-[11px] font-semibold leading-4 text-[#6F766F]">{detail}</span>
      </span>
    </div>
  );
}

function BillingCommandCenter({
  usable,
  daysLeft,
  accessStatusLabel,
  hasPendingPayment,
  pendingChangeSummary,
  waitingCount,
  failedCount,
  confirmedCount,
  aiPercent,
  exportPercent,
  actionHref,
  actionLabel,
  actionDetail
}: {
  usable: boolean;
  daysLeft: number;
  accessStatusLabel: string;
  hasPendingPayment: boolean;
  pendingChangeSummary?: string | null;
  waitingCount: number;
  failedCount: number;
  confirmedCount: number;
  aiPercent: number | null;
  exportPercent: number | null;
  actionHref: string;
  actionLabel: string;
  actionDetail: string;
}) {
  const quotaPressure = (aiPercent ?? 0) >= 85 || (exportPercent ?? 0) >= 85;
  const renewalReady = daysLeft > 7 || hasPendingPayment;
  const billingClean = failedCount === 0 && waitingCount === 0;
  const readinessScore = Math.min(
    100,
    Math.round((usable ? 35 : 0) + (renewalReady ? 25 : 0) + (!quotaPressure ? 20 : 0) + (billingClean ? 20 : 0))
  );

  return (
    <section className="mb-4 rounded-[22px] border border-[#E0E9DD] bg-[linear-gradient(135deg,#F3FAF4,#FFF7EB)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#0F6B3F]">Billing readiness</p>
          <h3 className="mt-1 text-base font-black text-[#151915]">Trung tâm quyết định gói & thanh toán</h3>
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-[#667069]">
            Gom trạng thái truy cập, gia hạn, quota AI/export và lịch sử thanh toán để chủ quán biết bước tiếp theo ngay.
          </p>
        </div>
        <div className="grid min-w-[180px] grid-cols-[76px_minmax(0,1fr)] gap-2 rounded-[18px] border border-[#CFE8D8] bg-white p-3">
          <div>
            <p className="text-[11px] font-black text-[#667069]">Sẵn sàng</p>
            <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-[#0F6B3F]">{readinessScore}%</p>
          </div>
          <div className="grid content-center gap-1 text-[11px] font-bold text-[#667069]">
            <span>{accessStatusLabel}</span>
            <span>{daysLeft > 0 ? `Còn ${daysLeft} ngày` : "Cần gia hạn"}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <BillingReadinessItem
            done={usable}
            label="Quyền truy cập"
            detail={usable ? "Dashboard và tính năng gói hiện tại đang dùng được." : "Gói đang không usable, cần xử lý thanh toán hoặc gia hạn."}
          />
          <BillingReadinessItem
            done={renewalReady}
            label="Gia hạn chu kỳ"
            detail={hasPendingPayment ? "Đã có yêu cầu thanh toán chờ xác nhận." : daysLeft > 7 ? "Chưa cần can thiệp trước ca vận hành." : "Sắp hết hạn, nên tạo VietQR gia hạn."}
          />
          <BillingReadinessItem
            done={!quotaPressure}
            label="Áp lực quota"
            detail={quotaPressure ? `AI ${aiPercent ?? 0}% · Export ${exportPercent ?? 0}%, nên cân nhắc nâng gói.` : "Quota AI/export vẫn trong ngưỡng an toàn."}
          />
          <BillingReadinessItem
            done={billingClean}
            label="Lịch sử thanh toán"
            detail={billingClean ? `Không có giao dịch kẹt. Thành công ${confirmedCount}.` : `${waitingCount} đang xử lý, ${failedCount} thất bại cần rà lại.`}
          />
        </div>

        <aside className="rounded-[18px] border border-[#F3D3AA] bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#B96618]">Hành động tiếp theo</p>
          <p className="mt-2 text-sm font-black leading-5 text-[#151915]">{actionLabel}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#667069]">{actionDetail}</p>
          {pendingChangeSummary ? (
            <p className="mt-3 rounded-xl bg-[#FFF5E8] px-3 py-2 text-[11px] font-bold leading-4 text-[#9B5417]">{pendingChangeSummary}</p>
          ) : null}
          <Link href={actionHref} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#075C38] px-4 text-sm font-black text-white transition hover:bg-[#064D30]">
            Đi tới bước xử lý
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </section>
  );
}

function PaymentStatusPill({ status }: { status: BillingPaymentView["status"] }) {
  return <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-black", paymentStatusClass(status))}>{paymentStatusLabel(status)}</span>;
}

function SubscriptionSettingsPanel({
  billing,
  billingError,
  tableCount,
  menuItemCount,
  staffCount,
  activeStep,
  selectedPaymentId
}: {
  billing: BillingPortal;
  billingError?: string | null;
  tableCount: number;
  menuItemCount: number;
  staffCount: number;
  activeStep: BillingStepKey;
  selectedPaymentId?: string | null;
}) {
  const pending = billing.pendingPayment;
  const pendingChange = billing.pendingChange;
  const sortedPlans = billing.plans.filter((plan) => plan.monthly_price > 0);
  const pendingPlan = pending ? billing.plans.find((plan) => plan.id === pending.plan_id) ?? null : null;
  const latestPayment = pending ?? billing.paymentRequests[0] ?? null;
  const selectedPayment = selectedPaymentId ? billing.paymentRequests.find((payment) => payment.id === selectedPaymentId) ?? latestPayment : latestPayment;
  const selectedPaymentPlan = selectedPayment ? billing.plans.find((plan) => plan.id === selectedPayment.plan_id) ?? billing.currentPlan : billing.currentPlan;
  const currentPeriodStart = billing.subscription.current_period_start || billing.subscription.trial_started_at || billing.subscription.created_at;
  const currentPeriodEnd = billing.subscription.current_period_end || billing.subscription.trial_ends_at;
  const elapsedPercent = periodProgress(currentPeriodStart, currentPeriodEnd, billing.daysLeft);
  const accessStatusLabel = subscriptionStatusLabel(billing.subscription.status, Boolean(pending), billing.usable);
  const tableFeature = billing.resolvedSnapshot.features.tables;
  const staffFeature = billing.resolvedSnapshot.features.staff;
  const aiQuota = billing.resolvedSnapshot.quotas.ai_chatbot ?? billing.resolvedSnapshot.quotas.ai_menu_generation ?? billing.resolvedSnapshot.features.ai_chatbot?.usage ?? null;
  const exportQuota = billing.resolvedSnapshot.quotas.export_pdf ?? billing.resolvedSnapshot.features.export_pdf?.usage ?? null;
  const currentBenefits = Object.values(billing.resolvedSnapshot.features)
    .filter((feature) => feature.state === "active" && feature.includedInPlan)
    .slice(0, 5);
  const confirmedCount = billing.paymentRequests.filter((payment) => payment.status === "confirmed").length;
  const waitingCount = billing.paymentRequests.filter((payment) => payment.status === "waiting_confirm").length;
  const failedCount = billing.paymentRequests.filter((payment) => payment.status === "rejected" || payment.status === "expired").length;
  const aiUsagePercent = aiQuota ? usagePercent(aiQuota.used, aiQuota.limit) : null;
  const exportUsagePercent = exportQuota ? usagePercent(exportQuota.used, exportQuota.limit) : null;
  const quotaPressure = (aiUsagePercent ?? 0) >= 85 || (exportUsagePercent ?? 0) >= 85;
  const billingAction = pending
    ? {
        href: billingStepHref("processing", pending.id),
        label: "Theo dõi thanh toán đang chờ xác nhận",
        detail: `Yêu cầu ${pending.transfer_content} đang chờ kích hoạt gói.`
      }
    : !billing.usable
      ? {
          href: billingStepHref("payment"),
          label: "Tạo hoặc hoàn tất thanh toán để mở lại quyền",
          detail: "Gói hiện tại chưa usable, ưu tiên xử lý trước khi vận hành ca."
        }
      : billing.daysLeft <= 7
        ? {
            href: billingStepHref("payment"),
            label: "Gia hạn trước khi hết chu kỳ",
            detail: billing.daysLeft > 0 ? `Còn ${billing.daysLeft} ngày, nên tạo VietQR gia hạn ngay.` : "Chu kỳ đã hết hạn, cần tạo thanh toán mới."
          }
        : quotaPressure
          ? {
              href: billingStepHref("compare"),
              label: "Rà quota và cân nhắc nâng gói",
              detail: `AI ${aiUsagePercent ?? 0}% · Export ${exportUsagePercent ?? 0}% trong chu kỳ hiện tại.`
            }
          : {
              href: billingStepHref("current"),
              label: "Gói đang ổn, tiếp tục theo dõi sử dụng",
              detail: "Không có thanh toán kẹt hoặc quota vượt ngưỡng trong chu kỳ này."
            };
  const activeStepIndex = Math.max(0, billingSteps.findIndex((step) => step.key === activeStep));
  const activeStepMeta = billingSteps[activeStepIndex] ?? billingSteps[0];
  const previousStep = billingSteps[activeStepIndex - 1]?.key ?? null;
  const nextStep = billingSteps[activeStepIndex + 1]?.key ?? null;
  const detailPaymentId = selectedPayment?.id ?? null;
  const processingSteps = pending
    ? [
        { label: "Đã nhận yêu cầu", state: "done" },
        { label: "Đang xác nhận", state: "active" },
        { label: "Kích hoạt gói", state: "pending" }
      ]
    : latestPayment?.status === "confirmed"
      ? [
          { label: "Đã nhận yêu cầu", state: "done" },
          { label: "Đã xác nhận", state: "done" },
          { label: "Đã kích hoạt", state: "done" }
        ]
      : [
          { label: "Tạo thanh toán", state: "pending" },
          { label: "Xác nhận", state: "pending" },
          { label: "Kích hoạt", state: "pending" }
        ];
  let pageContent: ReactNode;

  if (activeStep === "current") {
    pageContent = (
      <BillingSurface className="h-full min-h-[520px] overflow-y-auto p-5 lg:p-6">
        <div className="grid min-h-[520px] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid content-start gap-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#F2EEE5] text-sm font-black text-[#0F6B3F]">
                  {billing.restaurant.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#151915]">{billing.restaurant.name}</p>
                  <p className="truncate text-xs font-semibold text-[#7A817B]">/{billing.restaurant.slug}</p>
                </div>
              </div>
              <SoftPill className="border-[#CFE8D8] bg-[#EAF7EF] text-[#0F6B3F]">{accessStatusLabel}</SoftPill>
            </div>

            <div className="rounded-[22px] border border-[#E8E0D5] bg-[#FFF9EF] p-5">
              <SoftPill className="border-[#F3D3AA] bg-[#FFF0DB] text-[#E37A1F]">
                <Crown size={13} className="mr-1" aria-hidden="true" />
                {planShortName(billing.currentPlan)}
              </SoftPill>
              <p className="mt-5 text-[34px] font-black tracking-[-0.05em] text-[#111713]">{formatVnd(billing.currentPlan.monthly_price)}<span className="ml-1 text-sm font-bold tracking-normal text-[#7A817B]">/ tháng</span></p>
              <p className="mt-4 text-sm font-semibold text-[#6F766F]">
                Gia hạn vào <strong className="text-[#151915]">{formatBillingDate(currentPeriodEnd)}</strong>
                {billing.daysLeft > 0 ? ` (còn ${billing.daysLeft} ngày)` : ""}
              </p>
              <div className="mt-3">
                <BillingProgress value={elapsedPercent} />
              </div>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <form action={requestSubscriptionPaymentAction}>
                  <input type="hidden" name="planCode" value={billing.currentPlan.code} />
                  <input type="hidden" name="months" value="1" />
                  <Button type="submit" className="w-full rounded-[10px] bg-[#075C38] text-white shadow-none hover:bg-[#064D30]">
                    Gia hạn ngay
                  </Button>
                </form>
                <Link
                  href={billingStepHref("compare")}
                  className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[#DED6CA] bg-white px-4 text-sm font-black text-[#151915] transition hover:border-[#0F6B3F] hover:text-[#0F6B3F]"
                >
                  Nâng cấp gói
                </Link>
              </div>
            </div>

            <div>
              <p className="text-sm font-black text-[#151915]">Sử dụng tài nguyên</p>
              <p className="mt-1 text-xs font-medium text-[#7A817B]">Chu kỳ hiện tại: {formatBillingDate(currentPeriodStart)} - {formatBillingDate(currentPeriodEnd)}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <UsageMiniCard
                  icon={QrCode}
                  label="Bàn"
                  value={`${tableCount}/${limitLabel(tableFeature?.limit, tableFeature?.unit)}`}
                  meta={tableFeature?.limit ? `${usagePercent(tableCount, tableFeature.limit)}%` : "Không giới hạn"}
                  percent={usagePercent(tableCount, tableFeature?.limit)}
                />
                <UsageMiniCard
                  icon={Users}
                  label="Nhân viên"
                  value={`${staffCount}/${limitLabel(staffFeature?.limit, staffFeature?.unit)}`}
                  meta={staffFeature?.limit ? `${usagePercent(staffCount, staffFeature.limit)}%` : "Không giới hạn"}
                  percent={usagePercent(staffCount, staffFeature?.limit)}
                />
                <UsageMiniCard
                  icon={Sparkles}
                  label={publicUsageLabel(aiQuota?.label ?? "Lượt trợ lý thông minh")}
                  value={aiQuota ? `${new Intl.NumberFormat("vi-VN").format(aiQuota.used)}/${limitLabel(aiQuota.limit, aiQuota.unit)}` : "Chưa ghi nhận"}
                  meta={aiQuota ? `${usagePercent(aiQuota.used, aiQuota.limit)}%` : "Dữ liệu chưa ghi nhận"}
                  percent={aiQuota ? usagePercent(aiQuota.used, aiQuota.limit) : 0}
                  tone="orange"
                />
                <UsageMiniCard
                  icon={ReceiptText}
                  label={exportQuota?.label ?? "Export PDF"}
                  value={exportQuota ? `${new Intl.NumberFormat("vi-VN").format(exportQuota.used)}/${limitLabel(exportQuota.limit, exportQuota.unit)}` : `${menuItemCount} món`}
                  meta={exportQuota ? `${usagePercent(exportQuota.used, exportQuota.limit)}%` : "Menu thật trong hệ thống"}
                  percent={exportQuota ? usagePercent(exportQuota.used, exportQuota.limit) : 100}
                />
              </div>
            </div>
          </div>

          <aside className="rounded-[22px] border border-[#E8E0D5] bg-white p-5">
            <p className="text-sm font-black text-[#151915]">Quyền lợi gói {planShortName(billing.currentPlan)}</p>
            <div className="mt-4 grid gap-3">
              {currentBenefits.map((feature) => (
                <div key={feature.key} className="flex items-start gap-2 text-sm font-semibold leading-5 text-[#465049]">
                  <Check size={15} className="mt-0.5 shrink-0 text-[#0F6B3F]" aria-hidden="true" />
                  <span>{feature.label}</span>
                </div>
              ))}
            </div>
            <Link href={billingStepHref("compare")} className="mt-5 inline-flex items-center gap-1 text-sm font-black text-[#0F6B3F]">
              Xem tất cả quyền lợi <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </BillingSurface>
    );
  } else if (activeStep === "compare") {
    pageContent = (
      <BillingSurface className="h-full min-h-[520px] overflow-y-auto p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-black text-[#151915]">So sánh gói</h3>
          <div className="inline-flex rounded-full border border-[#E3DBCF] bg-[#F8F3EA] p-1 text-[11px] font-black">
            <span className="rounded-full bg-white px-3 py-1.5 text-[#0F6B3F] shadow-sm">Tháng</span>
            <span className="px-3 py-1.5 text-[#7A817B]">Nhiều tháng</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {sortedPlans.map((plan) => {
            const isCurrentPlan = plan.id === billing.currentPlan.id;
            const isUpgrade = plan.monthly_price > billing.currentPlan.monthly_price;
            const isDowngrade = plan.monthly_price < billing.currentPlan.monthly_price;
            const downgradeDisabled = isDowngrade && billing.usable;
            const isPremium = plan.code === "premium";
            const features = planFeatureList(plan);

            return (
              <article
                key={plan.id}
                className={cn(
                  "relative rounded-[22px] border bg-white p-5 transition",
                  isPremium ? "border-[#F2B36E] shadow-[0_18px_50px_rgba(242,140,40,0.12)]" : "border-[#E8E0D5]",
                  isCurrentPlan && "ring-1 ring-[#0F6B3F]"
                )}
              >
                {isPremium ? (
                  <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F2983A] px-4 py-1 text-[11px] font-black text-white">
                    Phổ biến nhất
                  </span>
                ) : null}
                <div className="text-center">
                  <p className="text-[15px] font-black tracking-[-0.01em] text-[#151915]">{planShortName(plan)}</p>
                  <p className={cn("mt-3 text-[28px] font-black tracking-[-0.04em]", isPremium ? "text-[#E37A1F]" : "text-[#111713]")}>
                    {formatVnd(plan.monthly_price)}
                  </p>
                  <p className="text-xs font-bold text-[#7A817B]">/ tháng</p>
                </div>

                <form action={requestSubscriptionPaymentAction} className="mt-5 grid gap-3">
                  <input type="hidden" name="planCode" value={plan.code} />
                  <select name="months" defaultValue="1" className="h-10 rounded-[10px] border border-[#E3DBCF] bg-[#FFFDF8] px-3 text-sm font-bold text-[#151915]">
                    <option value="1">1 tháng</option>
                    <option value="3">3 tháng</option>
                    <option value="6">6 tháng</option>
                    <option value="12">12 tháng</option>
                  </select>
                  <Button
                    type="submit"
                    disabled={downgradeDisabled}
                    className={cn(
                      "rounded-[10px] shadow-none",
                      isPremium ? "bg-[#075C38] text-white hover:bg-[#064D30]" : "border border-[#DED6CA] bg-white text-[#151915] hover:bg-[#F8F3EA]",
                      downgradeDisabled && "cursor-not-allowed opacity-50"
                    )}
                  >
                    {isCurrentPlan ? "Gia hạn gói" : isUpgrade ? "Chọn gói" : "Hạ gói"}
                  </Button>
                </form>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {features.slice(0, 8).map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-xs font-semibold leading-5 text-[#465049]">
                      <Check size={14} className="mt-0.5 shrink-0 text-[#0F6B3F]" aria-hidden="true" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                {downgradeDisabled ? (
                  <p className="mt-4 rounded-[12px] border border-[#F4D7AF] bg-[#FFF5E8] p-3 text-[11px] font-semibold leading-5 text-[#9B5417]">
                    Hạ gói sẽ được xử lý an toàn sau kỳ hiện tại để tránh mất quyền đang dùng.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
        <p className="mt-5 text-center text-xs font-semibold text-[#7A817B]">Tất cả gói đều bao gồm: QR Order, Menu, Đơn hàng, Khách hàng, Báo cáo cơ bản.</p>
      </BillingSurface>
    );
  } else if (activeStep === "payment") {
    pageContent = (
      <BillingSurface className="h-full min-h-[520px] overflow-y-auto p-5 lg:p-6">
        {pending ? (
          <div className="grid min-h-[520px] items-center gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-5">
              <div>
                <h3 className="text-xl font-black text-[#151915]">Thanh toán gói {planShortName(pendingPlan ?? billing.currentPlan)}</h3>
                <p className="mt-1 text-sm font-semibold text-[#7A817B]">Quét mã QR để thanh toán</p>
              </div>
              <div className="flex items-start gap-3 rounded-[14px] bg-[#FFF3E5] p-3 text-xs font-semibold leading-5 text-[#9B5417]">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>Vui lòng chuyển đúng nội dung và số tiền để hệ thống xác nhận tự động.</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-[#7A817B]">Số tiền thanh toán</p>
                  <p className="mt-1 text-[30px] font-black tracking-[-0.04em] text-[#111713]">{formatVnd(pending.amount)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#7A817B]">Ngân hàng nhận</p>
                  <p className="mt-1 font-black text-[#151915]">{billing.billing.bankCode}</p>
                  <p className="mt-1 text-xs font-bold text-[#667069]">{billing.billing.bankAccountName}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-[#7A817B]">Nội dung chuyển khoản</p>
                  <p className="mt-2 inline-flex max-w-full rounded-[10px] bg-[#F3EFE6] px-3 py-2 font-mono text-xs font-black text-[#151915]">{pending.transfer_content}</p>
                </div>
              </div>
              <Link href={billingStepHref("processing")} className="inline-flex min-h-11 w-fit items-center justify-center rounded-[10px] bg-[#075C38] px-5 text-sm font-black text-white transition hover:bg-[#064D30]">
                Tôi đã thanh toán
              </Link>
            </div>
            <div className="rounded-[22px] border border-[#E8E0D5] bg-white p-4 text-center">
              <Image src={pending.qrUrl} alt="QR thanh toán gói LogiVN" width={260} height={260} className="mx-auto rounded-[14px]" />
              <p className="mt-4 text-[11px] font-semibold text-[#7A817B]">Tạo lúc</p>
              <p className="text-xs font-black text-[#151915]">{formatBillingDateTime(pending.created_at)}</p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[520px] content-center gap-4 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#EAF7EF] text-[#0F6B3F]">
              <QrCode size={24} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xl font-black text-[#151915]">Chưa có QR thanh toán</h3>
              <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-[#667069]">Chọn gói hoặc gia hạn để hệ thống tạo VietQR bằng dữ liệu thanh toán thật.</p>
            </div>
            <div className="mx-auto grid w-full max-w-xs gap-3">
              <Link href={billingStepHref("compare")} className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[#075C38] px-4 text-sm font-black text-white transition hover:bg-[#064D30]">
                Chọn gói
              </Link>
              <form action={requestSubscriptionPaymentAction}>
                <input type="hidden" name="planCode" value={billing.currentPlan.code} />
                <input type="hidden" name="months" value="1" />
                <Button type="submit" className="w-full rounded-[10px] border border-[#DED6CA] bg-white text-[#151915] shadow-none hover:bg-[#F8F3EA]">
                  Tạo QR gia hạn
                </Button>
              </form>
            </div>
          </div>
        )}
      </BillingSurface>
    );
  } else if (activeStep === "processing") {
    pageContent = (
      <BillingSurface className="h-full min-h-[520px] overflow-y-auto p-5 lg:p-6">
        <div className="grid min-h-[520px] content-center gap-6">
          <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-[#EAF7EF] text-[#0F6B3F] shadow-[inset_0_0_0_14px_#D8F0E1]">
            <Hourglass size={38} aria-hidden="true" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-black text-[#151915]">{pending ? "Chúng tôi đang xác nhận thanh toán" : latestPayment?.status === "confirmed" ? "Giao dịch gần nhất đã hoàn tất" : "Không có thanh toán đang xử lý"}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-[#667069]">
              {pending ? "Bạn sẽ được chuyển hưởng quyền gói mới ngay khi thanh toán thành công." : "Khi có yêu cầu mới, trạng thái sẽ được cập nhật tại đây."}
            </p>
          </div>
          <div className="mx-auto grid w-full max-w-sm gap-3">
            {processingSteps.map((step) => (
              <div key={step.label} className="flex items-center gap-3 rounded-[14px] border border-[#E8E0D5] bg-white p-3">
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border text-[10px] font-black",
                    step.state === "done" && "border-[#0F6B3F] bg-[#0F6B3F] text-white",
                    step.state === "active" && "border-[#0F6B3F] bg-[#EAF7EF] text-[#0F6B3F]",
                    step.state === "pending" && "border-[#DED6CA] bg-white text-[#A59D91]"
                  )}
                >
                  {step.state === "done" ? <Check size={13} aria-hidden="true" /> : step.state === "active" ? <TimerReset size={13} aria-hidden="true" /> : ""}
                </span>
                <span className={cn("text-sm font-black", step.state === "pending" ? "text-[#9A9287]" : "text-[#151915]")}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </BillingSurface>
    );
  } else if (activeStep === "history") {
    pageContent = (
      <BillingSurface className="h-full min-h-[520px] overflow-y-auto p-5 lg:p-6">
        <div className="mb-5 flex flex-wrap gap-2 text-[11px] font-black">
          <span className="rounded-full border border-[#CFE8D8] bg-[#EAF7EF] px-3 py-1.5 text-[#0F6B3F]">Tất cả {billing.paymentRequests.length}</span>
          <span className="rounded-full border border-[#E3DBCF] bg-white px-3 py-1.5 text-[#667069]">Thành công {confirmedCount}</span>
          <span className="rounded-full border border-[#E3DBCF] bg-white px-3 py-1.5 text-[#667069]">Đang xử lý {waitingCount}</span>
          <span className="rounded-full border border-[#E3DBCF] bg-white px-3 py-1.5 text-[#667069]">Thất bại {failedCount}</span>
        </div>
        {billing.paymentRequests.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-[#7A817B]">
                <tr className="border-b border-[#ECE5DB]">
                  <th className="py-3 pr-4 font-black">Ngày thanh toán</th>
                  <th className="py-3 pr-4 font-black">Gói dịch vụ</th>
                  <th className="py-3 pr-4 font-black">Số tiền</th>
                  <th className="py-3 pr-4 font-black">Trạng thái</th>
                  <th className="py-3 text-right font-black">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {billing.paymentRequests.slice(0, 8).map((payment) => {
                  const plan = billing.plans.find((item) => item.id === payment.plan_id) ?? billing.currentPlan;

                  return (
                    <tr key={payment.id} className="border-b border-[#F0E9DE] last:border-0">
                      <td className="py-4 pr-4 font-semibold text-[#465049]">{formatBillingDate(payment.confirmed_at ?? payment.created_at)}</td>
                      <td className="py-4 pr-4 font-black text-[#151915]">{planShortName(plan)}</td>
                      <td className="py-4 pr-4 font-black text-[#151915]">{formatVnd(payment.amount)}</td>
                      <td className="py-4 pr-4"><PaymentStatusPill status={payment.status} /></td>
                      <td className="py-4 text-right">
                        <Link href={billingStepHref("detail", payment.id)} className="inline-flex h-8 items-center rounded-full border border-[#DED6CA] bg-white px-3 text-[11px] font-black text-[#0F6B3F] transition hover:border-[#0F6B3F]">
                          Xem
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-[430px] place-items-center rounded-[18px] border border-dashed border-[#DED6CA] bg-[#FFFDF8] text-center">
            <div>
              <ReceiptText size={34} className="mx-auto text-[#9A9287]" aria-hidden="true" />
              <p className="mt-3 text-sm font-black text-[#151915]">Chưa có giao dịch</p>
              <p className="mt-1 text-xs font-medium text-[#667069]">Giao dịch mới sẽ xuất hiện sau khi tạo VietQR.</p>
            </div>
          </div>
        )}
      </BillingSurface>
    );
  } else if (activeStep === "detail") {
    pageContent = (
      <BillingSurface className="h-full min-h-[520px] overflow-y-auto p-5 lg:p-6">
        {selectedPayment ? (
          <div className="grid min-h-[520px] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid content-start gap-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-base font-black text-[#151915]">#{selectedPayment.transfer_content}</p>
                  <p className="mt-1 text-xs font-semibold text-[#7A817B]">{formatBillingDateTime(selectedPayment.created_at)}</p>
                </div>
                <PaymentStatusPill status={selectedPayment.status} />
              </div>
              <div className="rounded-[18px] border border-[#E8E0D5] bg-[#FFFDF8] p-4">
                <p className="text-sm font-black text-[#151915]">Thông tin thanh toán</p>
                <div className="mt-4 grid gap-3 text-xs font-semibold text-[#667069]">
                  <p className="flex justify-between gap-4"><span>Gói dịch vụ</span><strong className="text-[#151915]">{planShortName(selectedPaymentPlan)}</strong></p>
                  <p className="flex justify-between gap-4"><span>Chu kỳ</span><strong className="text-[#151915]">{selectedPayment.months} tháng</strong></p>
                  <p className="flex justify-between gap-4"><span>Phương thức</span><strong className="text-[#151915]">{selectedPayment.method}</strong></p>
                  <p className="flex justify-between gap-4"><span>Mã giao dịch</span><strong className="break-all text-right font-mono text-[#151915]">{selectedPayment.transfer_content}</strong></p>
                  <p className="flex justify-between gap-4"><span>Ngày xác nhận</span><strong className="text-right text-[#151915]">{formatBillingDateTime(selectedPayment.confirmed_at)}</strong></p>
                </div>
              </div>
              {selectedPayment.rejected_reason ? (
                <div className="rounded-[14px] border border-[#F6D2C9] bg-[#FFF1EC] p-3 text-xs font-semibold leading-5 text-[#B94724]">
                  {selectedPayment.rejected_reason}
                </div>
              ) : null}
            </div>
            <aside className="rounded-[18px] border border-[#E8E0D5] bg-[#FFFDF8] p-4">
              <p className="text-sm font-black text-[#151915]">Chi tiết hoá đơn</p>
              <div className="mt-4 grid gap-3 text-xs font-semibold text-[#667069]">
                <p className="flex justify-between gap-4"><span>Tạm tính</span><strong className="text-[#151915]">{formatVnd(selectedPayment.amount)}</strong></p>
                <p className="flex justify-between gap-4"><span>VAT (0%)</span><strong className="text-[#151915]">{formatVnd(0)}</strong></p>
                <p className="flex justify-between gap-4 border-t border-[#E8E0D5] pt-3 text-sm"><span>Tổng cộng</span><strong className="text-[#151915]">{formatVnd(selectedPayment.amount)}</strong></p>
              </div>
              <button type="button" disabled className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#DED6CA] bg-white px-4 text-sm font-black text-[#A59D91]">
                <Download size={16} aria-hidden="true" />
                Tải hoá đơn
              </button>
            </aside>
          </div>
        ) : (
          <div className="grid min-h-[520px] place-items-center text-center">
            <div>
              <ReceiptText size={34} className="mx-auto text-[#9A9287]" aria-hidden="true" />
              <p className="mt-3 text-sm font-black text-[#151915]">Chưa có chi tiết giao dịch</p>
              <p className="mt-1 text-xs font-medium text-[#667069]">Tạo thanh toán để xem mã giao dịch và QR.</p>
            </div>
          </div>
        )}
      </BillingSurface>
    );
  } else {
    pageContent = (
      <BillingSurface className="h-full min-h-[520px] overflow-y-auto p-5 lg:p-6">
        <div className="grid min-h-[520px] items-center gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-[22px] border border-[#E8E0D5] bg-[#FFF9EF] p-5 text-center">
            <SoftPill className="mx-auto border-[#F3D3AA] bg-[#FFF0DB] text-[#E37A1F]">
              <Crown size={13} className="mr-1" aria-hidden="true" />
              {planShortName(billing.currentPlan)}
            </SoftPill>
            <p className="mt-5 text-[28px] font-black tracking-[-0.04em] text-[#111713]">{formatVnd(billing.currentPlan.monthly_price)}</p>
            <p className="text-xs font-bold text-[#7A817B]">/ tháng</p>
            <SoftPill className="mt-4 border-[#CFE8D8] bg-[#EAF7EF] text-[#0F6B3F]">{accessStatusLabel}</SoftPill>
            <p className="mt-5 text-xs font-semibold text-[#6F766F]">Gia hạn vào</p>
            <p className="mt-1 text-sm font-black text-[#151915]">{formatBillingDate(currentPeriodEnd)} {billing.daysLeft > 0 ? `(còn ${billing.daysLeft} ngày)` : ""}</p>
            <div className="mt-3">
              <BillingProgress value={elapsedPercent} />
            </div>
          </div>
          <div className="grid gap-4">
            {pendingChange ? (
              <div className="rounded-[14px] border border-[#F4D7AF] bg-[#FFF5E8] p-3 text-xs font-semibold leading-5 text-[#9B5417]">
                {pendingChange.summary}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <Link href={billingStepHref("compare")} className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[#075C38] px-4 text-sm font-black text-white transition hover:bg-[#064D30]">
                Nâng cấp gói
              </Link>
              <form action={requestSubscriptionPaymentAction}>
                <input type="hidden" name="planCode" value={billing.currentPlan.code} />
                <input type="hidden" name="months" value="1" />
                <Button type="submit" className="w-full rounded-[10px] border border-[#DED6CA] bg-white text-[#151915] shadow-none hover:bg-[#F8F3EA]">
                  Gia hạn gói
                </Button>
              </form>
              <button type="button" disabled className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[#F2D6D0] bg-white px-4 text-sm font-black text-[#D13F2F] opacity-60">
                <LockKeyhole size={15} aria-hidden="true" />
                Huỷ gói qua hỗ trợ
              </button>
            </div>
            <div className="rounded-[18px] border border-[#E8E0D5] bg-white p-4">
              <p className="text-sm font-black text-[#151915]">Nguyên tắc xử lý gói</p>
              <div className="mt-3 grid gap-2 text-xs font-semibold leading-5 text-[#667069]">
                <p>Gia hạn nối tiếp kỳ hiện tại, không làm mất ngày còn lại.</p>
                <p>Nâng cấp đổi quyền ngay sau khi xác minh thanh toán.</p>
                <p>Hạ gói cần xử lý an toàn để tránh mất quyền đang dùng.</p>
              </div>
            </div>
          </div>
        </div>
      </BillingSurface>
    );
  }

  return (
    <section className="billing-flow-shell dashboard-operations-stack flex min-h-[calc(100dvh-132px)] flex-col rounded-[30px] bg-[#FAF8F2] p-3 text-[#151915] sm:p-4 lg:h-[calc(100dvh-132px)] lg:p-6">
      {billingError ? (
        <div className="mb-4 flex items-start gap-3 rounded-[18px] border border-[#F4D7AF] bg-[#FFF5E8] p-4 text-sm font-semibold leading-6 text-[#9B5417]">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{billingError}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <BillingStepHeader index={activeStepMeta.index} title={activeStepMeta.title} subtitle={activeStepMeta.subtitle} />
        <SoftPill className="border-[#CFE8D8] bg-[#EAF7EF] text-[#0F6B3F]">{accessStatusLabel}</SoftPill>
      </div>

      <nav aria-label="Billing flow" className="mb-4 overflow-hidden rounded-[20px] border border-[#E7E0D6] bg-[#FFFDF8] p-2">
        <div className="dashboard-segmented-scroll flex gap-2 overflow-x-auto pb-1">
          {billingSteps.map((step) => {
            const active = step.key === activeStep;
            return (
              <Link
                key={step.key}
                href={billingStepHref(step.key, step.key === "detail" ? detailPaymentId : undefined)}
                className={cn(
                  "inline-flex min-h-12 min-w-[145px] shrink-0 items-center gap-2 rounded-[14px] border px-3 text-left transition",
                  active ? "border-[#0F6B3F] bg-[#EAF7EF] text-[#0F6B3F]" : "border-transparent bg-[#FAF8F2] text-[#687169] hover:border-[#DCD3C6] hover:bg-white"
                )}
              >
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black", active ? "bg-[#0F6B3F] text-white" : "bg-white text-[#7A817B]")}>{step.index}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black">{step.title}</span>
                  <span className="block truncate text-[10px] font-semibold opacity-70">{step.subtitle}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <BillingCommandCenter
        usable={billing.usable}
        daysLeft={billing.daysLeft}
        accessStatusLabel={accessStatusLabel}
        hasPendingPayment={Boolean(pending)}
        pendingChangeSummary={pendingChange?.summary ?? null}
        waitingCount={waitingCount}
        failedCount={failedCount}
        confirmedCount={confirmedCount}
        aiPercent={aiUsagePercent}
        exportPercent={exportUsagePercent}
        actionHref={billingAction.href}
        actionLabel={billingAction.label}
        actionDetail={billingAction.detail}
      />

      <div className="billing-flow-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">{pageContent}</div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {previousStep ? (
          <Link href={billingStepHref(previousStep, previousStep === "detail" ? detailPaymentId : undefined)} className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[#DED6CA] bg-white px-4 text-sm font-black text-[#151915] transition hover:border-[#0F6B3F] hover:text-[#0F6B3F]">
            <ArrowLeft size={16} aria-hidden="true" />
            Quay lại
          </Link>
        ) : (
          <span />
        )}
        {nextStep ? (
          <Link href={billingStepHref(nextStep, nextStep === "detail" ? detailPaymentId : undefined)} className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[#075C38] px-5 text-sm font-black text-white transition hover:bg-[#064D30]">
            Tiếp tục
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <Link href="/dashboard/settings" className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[#075C38] px-5 text-sm font-black text-white transition hover:bg-[#064D30]">
            Hoàn tất
          </Link>
        )}
      </div>
    </section>
  );
}

function SettingsHomeGrid({
  activeSection,
  sectionStates,
  readiness,
  tableCount,
  menuItemCount,
  entitlementWarning
}: {
  activeSection: SettingsSectionKey | null;
  sectionStates: Record<SettingsSectionKey, SettingsSectionState>;
  readiness: ReturnType<typeof buildStoreSetupReadiness>;
  tableCount: number;
  menuItemCount: number;
  entitlementWarning: string | null;
}) {
  return (
    <div className="dashboard-operations-stack grid gap-3">
      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="admin-hero-panel relative overflow-hidden px-4 py-4">
          <div className="relative z-[1]">
            <p className="dashboard-eyebrow">Settings cockpit</p>
            <h1 className="dashboard-page-title mt-1">Cài đặt vận hành</h1>
            <p className="dashboard-body-copy mt-1 max-w-2xl">Chọn đúng vùng, chỉnh nhanh, quay lại tổng quan.</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { href: "/dashboard/settings?section=profile", label: "Hồ sơ quán" },
                { href: "/dashboard/settings?section=online", label: "Đặt món online" },
                { href: "/dashboard/settings?section=payments", label: "VietQR" },
                { href: "/dashboard/settings?section=billing", label: "Gói LogiVN" }
              ].map((action) => (
                <Link key={action.href} href={action.href} className="dashboard-secondary-action">
                  {action.label}
                </Link>
              ))}
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container)] p-3">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Mức sẵn sàng</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{readiness.score}%</p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{readiness.completedCount}/{readiness.totalCount} mục xong</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container)] p-3">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Việc chặn vận hành</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{readiness.criticalMissing.length}</p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Cần xử lý trước</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container)] p-3">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Tài sản vận hành</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{tableCount} bàn</p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{menuItemCount} món</p>
              </div>
            </div>
          </div>
        </div>

        <aside className="dashboard-panel p-4">
          <p className="dashboard-eyebrow">Next actions</p>
          <h2 className="dashboard-section-title mt-1">Việc nên làm tiếp</h2>

          <div className="mt-3 grid gap-2">
            {readiness.nextActions.slice(0, 3).map((action) => (
              <Link
                key={action.key}
                href={action.route}
                className="group flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-container)] px-3 py-2.5 transition hover:border-[var(--primary)]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--foreground)]">{action.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--muted-foreground)]">{action.action}</span>
                </span>
                <ArrowRight size={16} className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition group-hover:text-[var(--primary)]" />
              </Link>
            ))}
          </div>

          {entitlementWarning ? (
            <div className="mt-3 rounded-xl border border-[var(--accent)]/15 bg-[var(--accent-soft)] px-3 py-2">
              <p className="text-sm font-semibold text-[var(--accent)]">Gói LogiVN cần chú ý</p>
              <p className="mt-0.5 text-xs leading-5 text-[var(--muted-foreground)]">{entitlementWarning}</p>
            </div>
          ) : null}
        </aside>
      </section>

      <section className="dashboard-settings-grid grid gap-3 xl:grid-cols-3">
        {settingsSectionGroups.map((group) => (
          <section key={group.title} className="dashboard-panel p-3">
            <div className="px-2 pb-2 pt-1">
              <p className="dashboard-eyebrow">{group.title}</p>
            </div>
            <div className="grid gap-2">
              {group.keys.map((key) => {
                const item = settingsSectionMap[key];
                const Icon = item.icon;
                const active = item.key === activeSection;
                const summary = sectionStates[item.key];

                return (
                  <Link
                    key={item.key}
                    href={`/dashboard/settings?section=${item.key}`}
                    className={cn(
                      "group flex items-start gap-3 rounded-xl border p-3 transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]",
                      active ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] bg-[var(--surface-container)]"
                    )}
                  >
                    <span className="dashboard-stat-icon h-10 w-10 shrink-0">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--foreground)]">{item.label}</span>
                        <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", sectionStateTone(summary.tone))}>
                          {summary.label}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">{summary.detail}</span>
                    </span>
                    <ArrowRight size={16} className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition group-hover:text-[var(--primary)]" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}



function renderActiveSection({
  activeSection,
  restaurant,
  branchSettings,
  branchDeliverySettings,
  mapOperationalMetrics,
  sessionEmail,
  tableCount,
  menuItemCount,
  staffCount,
  qrMenuUrl,
  onlineOrderUrl,
  reportSchedule,
  reportLogs,
  billingPortal,
  setupReadiness,
  billingError,
  billingStep,
  billingPaymentId
}: {
  activeSection: SettingsSectionKey;
  restaurant: RestaurantRow;
  branchSettings: Awaited<ReturnType<typeof listStoreBranchesForManagement>>;
  branchDeliverySettings: BranchDeliverySettings[];
  mapOperationalMetrics: Awaited<ReturnType<typeof getMapOperationalMetrics>> | null;
  sessionEmail: string;
  tableCount: number;
  menuItemCount: number;
  staffCount: number;
  qrMenuUrl: string;
  onlineOrderUrl: string;
  reportSchedule: ReportScheduleSettings | null;
  reportLogs: Awaited<ReturnType<typeof listRecentReportLogs>>;
  billingPortal: BillingPortal | null;
  setupReadiness: ReturnType<typeof buildStoreSetupReadiness>;
  billingError?: string | null;
  billingStep: BillingStepKey;
  billingPaymentId?: string | null;
}) {
  if (activeSection === "profile") return <ProfileSettingsForm restaurant={restaurant} email={sessionEmail} />;
  if (activeSection === "ai_setup") return <AiSetupStudio readiness={setupReadiness} restaurantName={restaurant.name} />;
  if (activeSection === "hours") return <HoursSettingsForm restaurant={restaurant} />;
  if (activeSection === "branches") return <BranchSettingsPanel branches={branchSettings} />;
  if (activeSection === "tables") return <TablesSettingsPanel restaurant={restaurant} tableCount={tableCount} qrMenuUrl={qrMenuUrl} />;
  if (activeSection === "online") {
    return (
      <div className="grid gap-4">
        <BranchDeliveryControls branches={branchDeliverySettings} />
        {mapOperationalMetrics ? <MapOperationalMetricsPanel metrics={mapOperationalMetrics} /> : null}
        <OrderingSettingsForm settings={restaurant} onlineUrl={onlineOrderUrl} compact />
      </div>
    );
  }
  if (activeSection === "payments") {
    return (
      <PaymentSettingsForm
        bankCode={restaurant.bank_code}
        bankAccount={restaurant.bank_account}
        bankAccountName={restaurant.bank_account_name}
      />
    );
  }
  if (activeSection === "notifications") {
    return <NotificationSettingsForm restaurant={restaurant} reportSchedule={reportSchedule} reportLogs={reportLogs} />;
  }
  if (activeSection === "billing" && billingPortal) {
    return (
      <SubscriptionSettingsPanel
        billing={billingPortal}
        billingError={billingError}
        tableCount={tableCount}
        menuItemCount={menuItemCount}
        staffCount={staffCount}
        activeStep={billingStep}
        selectedPaymentId={billingPaymentId}
      />
    );
  }
  if (activeSection === "permissions") return <PermissionsPanel />;
  if (activeSection === "receipt") return <ReceiptSettingsForm restaurant={restaurant} />;
  return <BrandSettingsForm restaurant={restaurant} />;
}

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{
    section?: string | string[];
    feature?: string | string[];
    gate?: string | string[];
    billingStep?: string | string[];
    paymentId?: string | string[];
    billingError?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const activeSection = normalizeSection(params?.section);
  const billingStep = normalizeBillingStep(params?.billingStep);
  const billingPaymentIdParam = Array.isArray(params?.paymentId) ? params?.paymentId[0] : params?.paymentId;
  const billingPaymentId = billingPaymentIdParam ? billingPaymentIdParam.slice(0, 80) : null;
  const billingErrorParam = Array.isArray(params?.billingError) ? params?.billingError[0] : params?.billingError;
  const billingError = billingErrorParam ? billingErrorParam.slice(0, 240) : null;
  const { session, entitlement } = await getDashboardAccessForSettings(activeSection);
  const dashboard = await getRestaurantDashboard(session.restaurantId);
  const restaurant = dashboard.restaurant;
  const billingPortal =
    activeSection === "billing"
      ? await getRestaurantBillingPortal({
          restaurantId: session.restaurantId,
          ownerEmail: session.email
        })
      : null;
  const restaurantUsers = activeSection === "billing" ? await listRestaurantUsers(session.restaurantId) : [];
  const branchSettings = await listStoreBranchesForManagement(session.restaurantId);
  const [branchDeliverySettings, mapOperationalMetrics] =
    activeSection === "online"
      ? await Promise.all([
          listDeliveryBranchSettings(session.restaurantId),
          getMapOperationalMetrics(session.restaurantId, 24)
        ])
      : [[], null];
  const [reportSchedule, reportLogs] =
    activeSection === "notifications"
      ? await Promise.all([
          getReportScheduleForRestaurant(session.restaurantId, restaurant.contact_email ?? session.email),
          listRecentReportLogs(session.restaurantId)
        ])
      : [null, []];
  const setupReadiness = buildStoreSetupReadiness(restaurant, {
    tableCount: dashboard.tables,
    menuItemCount: dashboard.menuItems
  });
  const profileLocationReady = Boolean(restaurant.address && restaurant.store_lat !== null && restaurant.store_lng !== null);
  const profileMissingCount = [restaurant.business_type, restaurant.hotline, restaurant.contact_email].filter((value) => !value).length + (profileLocationReady ? 0 : 1);
  const paymentConfigured = Boolean(restaurant.bank_code && restaurant.bank_account && restaurant.bank_account_name);
  const hoursConfigured = Boolean(restaurant.opening_time && restaurant.closing_time);
  const notificationCoverage = [restaurant.notify_new_order, restaurant.notify_payment_waiting].filter(Boolean).length;
  const onlineFlowCount = [restaurant.pickup_enabled, restaurant.delivery_enabled].filter(Boolean).length;
  const activeBranchCount = branchSettings.filter((branch) => branch.is_active).length;
  const primaryBranch = branchSettings.find((branch) => branch.is_primary && branch.is_active) ?? branchSettings.find((branch) => branch.is_active);
  const sectionStates: Record<SettingsSectionKey, SettingsSectionState> = {
    profile:
      profileMissingCount === 0
        ? { label: "Đủ thông tin", detail: "Tên, liên hệ và ghim vị trí đã sẵn sàng cho hóa đơn, đặt bàn và đơn online.", tone: "success" }
        : { label: `Thiếu ${profileMissingCount} mục`, detail: "Bổ sung hồ sơ và ghim vị trí để mọi luồng khách dùng cùng một địa chỉ.", tone: "warning" },
    ai_setup:
      restaurant.logo_url && (restaurant.description || restaurant.receipt_footer)
        ? { label: "Brand sẵn sàng", detail: "Logo, slogan hoặc mô tả đã có thể hiển thị đồng bộ trên hồ sơ quán.", tone: "success" }
        : { label: "Cần nhận diện", detail: "Tạo slogan, mô tả và logo rồi áp dụng trực tiếp vào hồ sơ quán.", tone: "neutral" },
    hours:
      hoursConfigured
        ? { label: "Đã cấu hình", detail: `${timeValue(restaurant.opening_time)} - ${timeValue(restaurant.closing_time)}`, tone: "success" }
        : { label: "Chưa đủ giờ bán", detail: "Cần giờ mở và đóng cửa để đồng bộ trải nghiệm khách.", tone: "neutral" },
    branches:
      activeBranchCount > 0 && primaryBranch
        ? { label: `${activeBranchCount} hoạt động`, detail: `Mặc định: ${primaryBranch.name}. Không cần tạo thủ công nếu quán chỉ có một điểm bán.`, tone: "success" }
        : { label: "Đang khởi tạo", detail: "Hệ thống sẽ tạo một chi nhánh chính để gán quyền cho quán hiện hành.", tone: "warning" },
    tables:
      dashboard.tables > 0
        ? { label: `${dashboard.tables} bàn`, detail: restaurant.allow_legacy_qr ? "QR cũ đang bật cho khách quen." : "QR cũ đang tắt.", tone: "success" }
        : { label: "Chưa có bàn", detail: "Tạo sơ đồ bàn trước khi in QR hoặc phục vụ tại chỗ.", tone: "warning" },
    online:
      !restaurant.online_ordering_enabled
        ? { label: "Đang tắt", detail: "Mở khi quán sẵn sàng nhận pickup hoặc delivery.", tone: "neutral" }
        : onlineFlowCount > 0
          ? { label: "Đang bán online", detail: `${onlineFlowCount === 2 ? "Pickup và delivery" : restaurant.pickup_enabled ? "Pickup" : "Delivery"} đang hoạt động.`, tone: "success" }
          : { label: "Thiếu luồng phục vụ", detail: "Bật online nhưng chưa chọn pickup hoặc delivery.", tone: "warning" },
    payments:
      paymentConfigured
        ? { label: "VietQR sẵn sàng", detail: "Tài khoản nhận tiền đã đủ cho đơn tại bàn và đơn online.", tone: "success" }
        : { label: "Thiếu tài khoản", detail: "Cần mã ngân hàng, số tài khoản và tên chủ tài khoản.", tone: "warning" },
    notifications:
      notificationCoverage === 2
        ? { label: "Đã bật cảnh báo", detail: "Đơn mới và đơn chờ thanh toán đều có thông báo.", tone: "success" }
        : { label: "Thiếu cảnh báo", detail: "Bật đủ thông báo để không bỏ sót tình huống quan trọng.", tone: "warning" },
    permissions: { label: "Đi tới staff", detail: "Thêm admin hoặc staff khi quán tăng ca hoặc mở chi nhánh.", tone: "neutral" },
    receipt:
      restaurant.receipt_footer || restaurant.receipt_show_qr
        ? { label: "Đã có mẫu in", detail: restaurant.receipt_show_qr ? "Hóa đơn đang kèm QR." : "Có thể thêm QR nếu cần dẫn khách quay lại.", tone: "success" }
        : { label: "Mẫu in cơ bản", detail: "Có thể thêm lời cảm ơn và QR để hoàn thiện trải nghiệm sau bán.", tone: "neutral" },
    brand:
      restaurant.logo_url
        ? { label: "Có nhận diện", detail: "Logo đã hiện diện, tiếp theo có thể tinh chỉnh màu thương hiệu.", tone: "success" }
        : { label: "Chưa có logo", detail: "Có thể cập nhật màu và logo để đồng bộ toàn bộ điểm chạm.", tone: "neutral" },
    billing:
      !entitlement.allowed
        ? { label: "Cần gia hạn", detail: entitlement.reason ?? "Gói LogiVN chưa hợp lệ.", tone: "warning" }
        : entitlement.warning
          ? { label: "Sắp hết hạn", detail: entitlement.warning.message, tone: "warning" }
          : { label: "Đang hoạt động", detail: `${entitlement.planName} · ${entitlement.daysLeft} ngày còn lại`, tone: "success" }
  };
  const activeMeta = activeSection ? settingsSectionMap[activeSection] : null;
  const ActiveIcon = activeMeta?.icon ?? Store;
  const qrMenuUrl = buildTenantUrl(restaurant.slug, "/");
  const onlineOrderUrl = buildTenantUrl(restaurant.slug, "/");
  const activeSummary = activeSection ? sectionStates[activeSection] : null;

  return (
    <AdminShell
      title="Cài đặt"
      restaurantName={restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Chỉnh nhanh theo từng vùng vận hành"
    >
      <section className="dashboard-operations-stack min-h-[calc(100vh-128px)]">
        <SettingsHomeGrid
          activeSection={activeSection}
          sectionStates={sectionStates}
          readiness={setupReadiness}
          tableCount={dashboard.tables}
          menuItemCount={dashboard.menuItems}
          entitlementWarning={entitlement.warning?.message ?? null}
        />

        {activeSection && activeMeta ? (
          <div className="fixed inset-0 z-[var(--z-dashboard-drawer)] overflow-hidden overscroll-contain flex justify-end">
            <Link
              href="/dashboard/settings"
              className="drawer-backdrop absolute inset-0 z-0 bg-black/40 backdrop-blur-[2px]"
              aria-hidden="true"
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-drawer-title"
              className={cn(
                "drawer-panel relative z-10 flex h-dvh max-h-dvh w-full flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl",
                activeSection === "billing" || activeSection === "online" || activeSection === "notifications"
                  ? "max-w-[768px]"
                  : "max-w-[540px]"
              )}
            >
              <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="dashboard-stat-icon h-10 w-10 shrink-0">
                    <ActiveIcon size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="dashboard-eyebrow text-[var(--muted-foreground)]">Cài đặt vận hành</p>
                    <h2 id="settings-drawer-title" className="dashboard-section-title mt-0.5 truncate">{activeMeta.label}</h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeSummary ? (
                    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", sectionStateTone(activeSummary.tone))}>
                      {activeSummary.label}
                    </span>
                  ) : null}
                  <Link
                    href="/dashboard/settings"
                    aria-label="Đóng cài đặt"
                    className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)]"
                  >
                    <X size={18} aria-hidden="true" />
                  </Link>
                </div>
              </header>

              <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5">
                {renderActiveSection({
                  activeSection,
                  restaurant,
                  branchSettings,
                  branchDeliverySettings,
                  mapOperationalMetrics,
                  sessionEmail: session.email,
                  tableCount: dashboard.tables,
                  menuItemCount: dashboard.menuItems,
                  staffCount: restaurantUsers.length,
                  qrMenuUrl,
                  onlineOrderUrl,
                  reportSchedule,
                  reportLogs,
                  billingPortal,
                  setupReadiness,
                  billingError,
                  billingStep,
                  billingPaymentId
                })}
              </main>
            </aside>
          </div>
        ) : null}
      </section>
    </AdminShell>
  );
}
