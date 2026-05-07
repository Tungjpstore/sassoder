import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Bell,
  Bike,
  Clock3,
  CreditCard,
  ExternalLink,
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
import { requestSubscriptionPaymentAction, updateReportScheduleAction, updateRestaurantSettingsAction } from "@/app/dashboard/actions";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AiSetupStudio } from "@/components/dashboard/ai-setup-studio";
import { OrderingSettingsForm } from "@/components/dashboard/ordering-settings-form";
import { PaymentSettingsForm } from "@/components/dashboard/payment-settings-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDashboardAccessForSettings } from "@/lib/dashboard-access";
import { formatVnd } from "@/lib/money";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { cn } from "@/lib/utils";
import { getReportScheduleForRestaurant, listRecentReportLogs, type ReportScheduleSettings } from "@/services/report-schedule-service";
import { getRestaurantDashboard } from "@/services/restaurant-service";
import { buildStoreSetupReadiness } from "@/services/ai-setup-readiness";
import { getRestaurantBillingPortal } from "@/services/subscription-service";
import type { Database } from "@/types/supabase";

export const dynamic = "force-dynamic";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type BillingPortal = Awaited<ReturnType<typeof getRestaurantBillingPortal>>;
type SettingsSectionKey =
  | "profile"
  | "ai_setup"
  | "hours"
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
  { key: "profile", label: "Hồ sơ quán", description: "Tên, loại hình, liên hệ, địa chỉ", icon: Users },
  { key: "ai_setup", label: "AI setup", description: "Thiết lập quán theo từng bước", icon: Sparkles },
  { key: "hours", label: "Giờ hoạt động", description: "Giờ mở cửa và QR cũ", icon: Clock3 },
  { key: "tables", label: "Bàn & QR", description: "Bàn, khu vực và link QR", icon: QrCode },
  { key: "online", label: "Đặt món online", description: "Đến lấy, giao hàng, phí ship", icon: Bike },
  { key: "payments", label: "Thanh toán", description: "Ngân hàng nhận VietQR", icon: CreditCard },
  { key: "billing", label: "Gói LogiVN", description: "Trial, gia hạn và hoá đơn SaaS", icon: WalletCards },
  { key: "notifications", label: "Thông báo", description: "Cảnh báo đơn và thanh toán", icon: Bell },
  { key: "permissions", label: "Nhân quyền", description: "Tài khoản và phân quyền", icon: ShieldCheck },
  { key: "receipt", label: "Mẫu in/hóa đơn", description: "Dòng cuối và QR hóa đơn", icon: FileText },
  { key: "brand", label: "Thương hiệu", description: "Màu sắc và nhận diện", icon: Paintbrush }
];

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
      <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProfileSettingsForm({ restaurant, email }: { restaurant: RestaurantRow; email: string }) {
  return (
    <form action={updateRestaurantSettingsAction}>
      <input type="hidden" name="settingsSection" value="profile" />
      <FieldGroup title="Profile cửa hàng">
        <div className="mb-5 overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <div className="h-24 bg-[linear-gradient(135deg,#0F4D3A_0%,#174F43_45%,#F28C28_100%)]" />
          <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
            <div className="-mt-10 grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-4 border-white bg-[var(--soft-surface)] text-[var(--primary)]">
              {restaurant.logo_url ? (
                <Image src={restaurant.logo_url} alt={`Logo ${restaurant.name}`} width={80} height={80} className="h-full w-full object-cover" />
              ) : (
                <Store size={30} />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-3">
              <h2 className="truncate text-xl font-semibold text-[var(--foreground)]">{restaurant.name}</h2>
              <p className="mt-1 truncate text-sm font-medium text-[var(--muted-foreground)]">{restaurant.slug}.logivn.com · {restaurant.hotline || "Chưa có hotline"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-5">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-[1fr_190px]">
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
            <label className="grid gap-2 text-sm font-black">
              Địa chỉ
              <Input name="address" defaultValue={restaurant.address ?? ""} placeholder="Địa chỉ quán" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
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
                className="min-h-24 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm font-medium outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
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
        <div className="mt-5 flex justify-end">
          <Button>Lưu giờ hoạt động</Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function TablesSettingsPanel({ restaurant, tableCount, qrMenuUrl }: { restaurant: RestaurantRow; tableCount: number; qrMenuUrl: string }) {
  return (
    <FieldGroup title="Bàn & QR">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
          <p className="metric-number text-2xl font-semibold text-[var(--foreground)]">{tableCount}</p>
          <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Bàn đang quản lý</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
          <p className="metric-number text-2xl font-semibold text-[var(--foreground)]">{restaurant.allow_legacy_qr ? "Bật" : "Tắt"}</p>
          <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">QR cũ</p>
        </div>
        <a href="/dashboard/tables" className="inline-flex min-h-20 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white">
          <QrCode size={18} />
          Quản lý bàn & QR
        </a>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
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
              <div className="grid gap-3 md:grid-cols-4">
                <label className="grid gap-2 text-sm font-semibold">
                  Chu kỳ
                  <select name="frequency" defaultValue={reportSchedule.frequency} className="h-11 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold outline-none">
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
                  <select name="sendDayOfWeek" defaultValue={reportSchedule.sendDayOfWeek} className="h-11 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold outline-none">
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
                  Đính kèm JSON
                </label>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm">
                <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Lần gửi gần nhất</span><strong>{formatDateTime(reportSchedule.lastSentAt)}</strong></div>
                <div className="mt-2 flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Lần gửi tiếp theo</span><strong>{formatDateTime(reportSchedule.nextRunAt)}</strong></div>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button>Lưu lịch gửi báo cáo</Button>
            </div>
          </FieldGroup>
        </form>
      ) : null}

      <FieldGroup title="Audit log gửi báo cáo">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {reportLogs.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm font-medium text-[var(--muted-foreground)]">Chưa có lần gửi báo cáo nào.</div>
          ) : (
            reportLogs.map((log) => (
              <div key={log.id} className="grid gap-2 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0 md:grid-cols-[1fr_110px_1.3fr]">
                <span>
                  <span className="block font-semibold">{log.period_type} · {log.period_start} - {log.period_end}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{formatDateTime(log.sent_at ?? log.created_at)}</span>
                </span>
                <span className={`font-semibold ${log.status === "sent" ? "text-[#15945B]" : log.status === "failed" ? "text-[#BE123C]" : "text-[var(--muted-foreground)]"}`}>{log.status}</span>
                <span className="truncate text-[var(--muted-foreground)]">{log.error_message ?? log.recipient_emails.join(", ")}</span>
              </div>
            ))
          )}
        </div>
      </FieldGroup>
    </div>
  );
}

function PermissionsPanel() {
  return (
    <FieldGroup title="Nhân quyền">
      <div className="grid gap-3 md:grid-cols-2">
        <a href="/dashboard/staff" className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white">
          <ShieldCheck size={18} />
          Thêm nhân viên
        </a>
        <a href="/dashboard/staff" className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--primary)]">
          Xem danh sách nhân viên
        </a>
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

function SubscriptionSettingsPanel({ billing }: { billing: BillingPortal }) {
  const statusLabels: Record<string, string> = {
    trialing: "Đang dùng thử",
    pending_payment: "Chờ thanh toán",
    active: "Đang hoạt động",
    past_due: "Quá hạn",
    suspended: "Tạm dừng",
    cancelled: "Đã huỷ",
    expired: "Hết hạn"
  };
  const pending = billing.pendingPayment;
  const sortedPlans = billing.plans.filter((plan) => plan.monthly_price > 0);
  const pendingPlan = pending ? billing.plans.find((plan) => plan.id === pending.plan_id) : null;
  const accessStatusLabel =
    billing.usable && (pending || billing.subscription.status === "pending_payment")
      ? "Đang hoạt động - chờ xác minh kỳ mới"
      : statusLabels[billing.subscription.status] ?? billing.subscription.status;

  return (
    <section className="grid gap-3">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--accent)]">Gói LogiVN</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{billing.currentPlan.name}</h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--muted-foreground)]">
              {billing.currentPlan.description || "Gói SaaS đang gắn với cửa hàng của bạn."}
            </p>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm font-black text-[var(--primary)]">
            {accessStatusLabel}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="admin-stat-tile rounded-[14px] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">Giá gói</p>
            <p className="mt-3 metric-number text-xl font-semibold text-[var(--foreground)]">{formatVnd(billing.currentPlan.monthly_price)}</p>
            <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">/ tháng</p>
          </div>
          <div className="admin-stat-tile rounded-[14px] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">Còn lại</p>
            <p className="mt-3 metric-number text-xl font-semibold text-[var(--foreground)]">{billing.daysLeft} ngày</p>
            <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">
              Hết hạn: {billing.subscription.current_period_end ? new Intl.DateTimeFormat("vi-VN").format(new Date(billing.subscription.current_period_end)) : "Chưa có"}
            </p>
          </div>
          <div className="admin-stat-tile rounded-[14px] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">Trial</p>
            <p className="mt-3 metric-number text-xl font-semibold text-[var(--foreground)]">{billing.currentPlan.trial_days} ngày</p>
            <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Dùng thử miễn phí ban đầu</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        {pending ? (
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <Image src={pending.qrUrl} alt="QR gia hạn LogiVN" width={200} height={200} className="mx-auto rounded-xl border border-[var(--border)] bg-white p-2" />
            <div className="grid content-start gap-2 text-sm font-semibold">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Giao dịch đang chờ xác minh</h3>
              <p className="text-sm font-medium leading-6 text-[var(--muted-foreground)]">
                Quán vẫn dùng được nếu kỳ hiện tại còn hạn. LogiVN sẽ kích hoạt kỳ/gói mới sau khi xác minh chuyển khoản.
              </p>
              <p className="flex justify-between gap-3"><span>Gói đích</span><strong>{pendingPlan?.name ?? billing.currentPlan.name}</strong></p>
              <p className="flex justify-between gap-3"><span>Số tiền</span><strong>{formatVnd(pending.amount)}</strong></p>
              <p className="flex justify-between gap-3"><span>Ngân hàng</span><strong>{billing.billing.bankCode}</strong></p>
              <p className="flex justify-between gap-3"><span>STK</span><strong>{billing.billing.bankAccount}</strong></p>
              <p className="grid gap-1"><span>Nội dung</span><strong className="break-all font-mono text-[var(--accent)]">{pending.transfer_content}</strong></p>
            </div>
          </div>
        ) : (
          <form action={requestSubscriptionPaymentAction} className="grid gap-3">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Gia hạn bằng VietQR</h3>
            <p className="text-sm font-medium leading-6 text-[var(--muted-foreground)]">
              Tạo QR gia hạn gói hiện tại. Việc nâng cấp/chuyển gói nằm ở danh sách gói bên dưới.
            </p>
            <input type="hidden" name="planCode" value={billing.currentPlan.code} />
            <label className="grid max-w-xs gap-2 text-sm font-black">
              Số tháng gia hạn
              <select name="months" defaultValue="1" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold">
                <option value="1">1 tháng</option>
                <option value="3">3 tháng</option>
                <option value="6">6 tháng</option>
                <option value="12">12 tháng</option>
              </select>
            </label>
            <Button type="submit" className="bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]">
              Tạo QR gia hạn
            </Button>
          </form>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Nâng cấp hoặc chuyển gói</h3>
          <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Mỗi yêu cầu tạo một QR mới. QR cũ đang chờ sẽ tự hết hiệu lực nếu bạn đổi gói/thời hạn.</p>
        </div>
        <div className="grid gap-2">
          {sortedPlans.map((plan) => {
            const isCurrentPlan = plan.id === billing.currentPlan.id;
            const isUpgrade = plan.monthly_price > billing.currentPlan.monthly_price;
            const isDowngrade = plan.monthly_price < billing.currentPlan.monthly_price;
            const actionLabel = isCurrentPlan ? "Gia hạn" : isUpgrade ? "Nâng cấp" : "Chuyển gói";

            return (
              <details key={plan.id} className={cn("group rounded-xl border bg-white", isCurrentPlan ? "border-[var(--primary)]" : "border-[var(--border)]")}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-[var(--foreground)]">{plan.name}</h4>
                      {isCurrentPlan ? <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-black text-[var(--primary)]">Hiện tại</span> : null}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">{formatVnd(plan.monthly_price)}/tháng · {plan.features.length} tính năng</p>
                  </div>
                  <span className="text-sm font-black text-[var(--primary)]">Chi tiết</span>
                </summary>
                <div className="grid gap-3 border-t border-[var(--border)] p-3">
                  <p className="text-sm font-medium leading-6 text-[var(--muted-foreground)]">{plan.description}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {plan.features.slice(0, 8).map((feature) => (
                      <div key={feature} className="flex items-center gap-2 rounded-lg bg-[var(--soft-surface)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
                        <ShieldCheck size={15} className="text-[var(--primary)]" />
                        {feature}
                      </div>
                    ))}
                  </div>
                  <form action={requestSubscriptionPaymentAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="planCode" value={plan.code} />
                    <label className="grid gap-2 text-sm font-black">
                      Thời hạn
                      <select name="months" defaultValue="1" className="h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold">
                        <option value="1">1 tháng</option>
                        <option value="3">3 tháng</option>
                        <option value="6">6 tháng</option>
                        <option value="12">12 tháng</option>
                      </select>
                    </label>
                    <Button
                      type="submit"
                      className={cn(
                        "self-end text-white",
                        isCurrentPlan ? "bg-[var(--primary)] hover:bg-[var(--primary-hover)]" : "bg-[var(--accent)] hover:bg-[var(--accent-strong)]"
                      )}
                    >
                      {actionLabel}
                    </Button>
                    {isDowngrade ? (
                      <p className="text-xs font-semibold leading-5 text-[var(--muted-foreground)] sm:col-span-2">
                        Chuyển gói sẽ có hiệu lực sau khi LogiVN xác minh thanh toán mới.
                      </p>
                    ) : null}
                  </form>
                </div>
              </details>
            );
          })}
        </div>

        <div className="mt-4 grid gap-2">
          {billing.paymentRequests.slice(0, 5).map((payment) => (
            <div key={payment.id} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
              <div className="flex justify-between gap-3 font-semibold text-[var(--foreground)]">
                <span>{formatVnd(payment.amount)}</span>
                <span>{payment.status === "confirmed" ? "Đã xác minh" : payment.status === "rejected" ? "Từ chối" : "Chờ xác minh"}</span>
              </div>
              <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">{payment.transfer_content}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SettingsHomeGrid({ activeSection }: { activeSection: SettingsSectionKey | null }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {settingsSections.map((item) => {
        const Icon = item.icon;
        const active = item.key === activeSection;
        return (
          <Link
            key={item.key}
            href={`/dashboard/settings?section=${item.key}`}
            className={cn(
              "group rounded-2xl border bg-white p-4 transition hover:-translate-y-0.5 hover:border-[var(--primary)]",
              active ? "border-[var(--primary)] ring-2 ring-[var(--primary-soft)]" : "border-[var(--border)]"
            )}
          >
            <span className="dashboard-stat-icon h-10 w-10">
              <Icon size={18} />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">{item.label}</h2>
            <p className="mt-1 text-sm font-medium leading-6 text-[var(--muted-foreground)]">{item.description}</p>
            <span className="mt-4 inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--primary)] group-hover:bg-[var(--primary)] group-hover:text-white">
              Mở panel
            </span>
          </Link>
        );
      })}
    </section>
  );
}

function renderActiveSection({
  activeSection,
  restaurant,
  sessionEmail,
  tableCount,
  qrMenuUrl,
  onlineOrderUrl,
  reportSchedule,
  reportLogs,
  billingPortal,
  setupReadiness
}: {
  activeSection: SettingsSectionKey;
  restaurant: RestaurantRow;
  sessionEmail: string;
  tableCount: number;
  qrMenuUrl: string;
  onlineOrderUrl: string;
  reportSchedule: ReportScheduleSettings | null;
  reportLogs: Awaited<ReturnType<typeof listRecentReportLogs>>;
  billingPortal: BillingPortal | null;
  setupReadiness: ReturnType<typeof buildStoreSetupReadiness>;
}) {
  if (activeSection === "profile") return <ProfileSettingsForm restaurant={restaurant} email={sessionEmail} />;
  if (activeSection === "ai_setup") return <AiSetupStudio readiness={setupReadiness} restaurantName={restaurant.name} />;
  if (activeSection === "hours") return <HoursSettingsForm restaurant={restaurant} />;
  if (activeSection === "tables") return <TablesSettingsPanel restaurant={restaurant} tableCount={tableCount} qrMenuUrl={qrMenuUrl} />;
  if (activeSection === "online") return <OrderingSettingsForm settings={restaurant} onlineUrl={onlineOrderUrl} />;
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
  if (activeSection === "billing" && billingPortal) return <SubscriptionSettingsPanel billing={billingPortal} />;
  if (activeSection === "permissions") return <PermissionsPanel />;
  if (activeSection === "receipt") return <ReceiptSettingsForm restaurant={restaurant} />;
  return <BrandSettingsForm restaurant={restaurant} />;
}

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ section?: string | string[]; feature?: string | string[]; gate?: string | string[] }>;
}) {
  const params = await searchParams;
  const activeSection = normalizeSection(params?.section);
  const { session, entitlement } = await getDashboardAccessForSettings();
  const dashboard = await getRestaurantDashboard(session.restaurantId);
  const restaurant = dashboard.restaurant;
  const billingPortal =
    activeSection === "billing"
      ? await getRestaurantBillingPortal({
          restaurantId: session.restaurantId,
          ownerEmail: session.email
        })
      : null;
  const [reportSchedule, reportLogs] =
    activeSection === "notifications"
      ? await Promise.all([
          getReportScheduleForRestaurant(session.restaurantId, restaurant.contact_email ?? session.email),
          listRecentReportLogs(session.restaurantId)
        ])
      : [null, []];
  const activeMeta = activeSection ? settingsSections.find((item) => item.key === activeSection) ?? null : null;
  const ActiveIcon = activeMeta?.icon ?? Store;
  const qrMenuUrl = buildTenantUrl(restaurant.slug, "/");
  const onlineOrderUrl = buildTenantUrl(restaurant.slug, "/");
  const setupReadiness = buildStoreSetupReadiness(restaurant, {
    tableCount: dashboard.tables,
    menuItemCount: dashboard.menuItems
  });

  return (
    <AdminShell
      title="Cài đặt"
      restaurantName={restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Chọn đúng vùng cần chỉnh, hệ thống mở drawer riêng để không làm rối màn hình vận hành"
    >
      <section className="min-h-[calc(100vh-190px)]">
        <SettingsHomeGrid activeSection={activeSection} />

        {activeSection && activeMeta ? (
          <div className="fixed inset-0 z-[90]">
            <Link href="/dashboard/settings" aria-label="Đóng panel cài đặt" className="absolute inset-0 bg-slate-950/25 backdrop-blur-[2px]" />
            <aside className="absolute right-0 top-0 flex h-full w-full max-w-[780px] flex-col border-l border-[var(--border)] bg-[var(--background)] shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
              <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="dashboard-stat-icon h-10 w-10 shrink-0">
                    <ActiveIcon size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Panel cài đặt</p>
                    <h1 className="truncate text-xl font-semibold text-[var(--foreground)]">{activeMeta.label}</h1>
                    <p className="mt-0.5 truncate text-sm font-medium text-[var(--muted-foreground)]">{activeMeta.description}</p>
                  </div>
                </div>
                <Link href="/dashboard/settings" className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--primary)] transition hover:bg-[var(--soft-surface)]">
                  Đóng
                </Link>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
                {renderActiveSection({
                  activeSection,
                  restaurant,
                  sessionEmail: session.email,
                  tableCount: dashboard.tables,
                  qrMenuUrl,
                  onlineOrderUrl,
                  reportSchedule,
                  reportLogs,
                  billingPortal,
                  setupReadiness
                })}
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </AdminShell>
  );
}
