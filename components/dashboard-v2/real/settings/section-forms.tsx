"use client";

/* SectionForms — toàn bộ form section của Settings v2.
 * - Giữ nguyên 100% name= của input để 3 server actions hiện hữu nhận đúng dữ liệu.
 * - Không nhồi card-in-card, dùng tokens v2.
 * - Form Notifications/Online/Payments/Branches/AI-setup được embed lại từ
 *   các client component đã tồn tại (giữ logic, chỉ wrap shell ngoài).
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  Bike,
  Check,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  MapPin,
  Paintbrush,
  PenLine,
  Plus,
  QrCode,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Upload
} from "lucide-react";
import { Panel, Badge, SwitchControl } from "@/components/dashboard-v2/primitives";
import { Button } from "@/components/dashboard-v2/button";
import { cn } from "@/lib/utils";
import {
  requestSubscriptionPaymentAction,
  applyAiSetupBrandAction,
  createStoreBranchAction,
  updateStoreBranchAction,
  updatePaymentSettingsAction,
  updateReportScheduleAction,
  updateRestaurantSettingsAction
} from "@/app/dashboard/actions";
import { BranchDeliveryControls } from "@/components/dashboard/branch-delivery-controls";
import { MapOperationalMetricsPanel } from "@/components/dashboard/map-operational-metrics-panel";
import { OrderingSettingsForm } from "@/components/dashboard/ordering-settings-form";
import { TelegramConnectPanel } from "@/components/dashboard/telegram-connect-panel";
import { useToast } from "@/components/dashboard/toast-provider";
import type { ReportScheduleSettings, listRecentReportLogs } from "@/services/report-schedule-service";
import type { listStoreBranchesForManagement } from "@/services/branch-service";
import type { BranchDeliverySettings } from "@/services/delivery/branch-delivery-settings-service";
import type { getMapOperationalMetrics } from "@/services/map-ops-service";
import type { buildStoreSetupReadiness } from "@/services/ai-setup-readiness";
import type { Database } from "@/types/supabase";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];

const inputCls = "h-10 w-full rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20";
const selectCls = inputCls + " appearance-none";
const textareaCls = "min-h-20 w-full rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20";

function Field({ label, children, full, hint }: { label: string; children: ReactNode; full?: boolean; hint?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</span>
      {children}
      {hint ? <span className="text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-faint)]">{hint}</span> : null}
    </label>
  );
}

type SettingsState = { error?: string; success?: string } | undefined;
type SettingsAction = (state: SettingsState, formData: FormData) => Promise<{ error?: string; success?: string }>;

/* SwitchField — bọc primitive SwitchControl (controlled) + hidden input để
 * submit đúng "true"/"false" mà server action đang đọc (=== "true"). */
function SwitchField({
  name,
  label,
  hint,
  defaultChecked,
  icon,
  className
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const [on, setOn] = useState(Boolean(defaultChecked));
  return (
    <div
      className={cn(
        "flex min-h-[68px] items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3 transition hover:border-[var(--d-line-strong)]",
        className
      )}
    >
      {icon ? <span className="grid h-9 w-9 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{label}</span>
        {hint ? <span className="mt-0.5 block text-[length:var(--d-fs-xs)] leading-5 text-[var(--d-text-muted)]">{hint}</span> : null}
      </span>
      <SwitchControl checked={on} onChange={setOn} label={label} />
      <input type="hidden" name={name} value={on ? "true" : "false"} />
    </div>
  );
}

/* FormFeedback — banner lỗi/thành công nhất quán với chuẩn v2 (OnlineSection). */
function FormFeedback({ state }: { state: SettingsState }) {
  if (state?.error) {
    return (
      <div className="flex items-start gap-2 rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-danger-fg)]">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>{state.error}</span>
      </div>
    );
  }
  if (state?.success) {
    return (
      <div className="flex items-start gap-2 rounded-[var(--d-r-md)] border border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-primary)]">
        <Check size={15} className="mt-0.5 shrink-0" />
        <span>{state.success}</span>
      </div>
    );
  }
  return null;
}

function FormFooter({ label = "Lưu thay đổi", pending }: { label?: string; pending?: boolean }) {
  return (
    <div className="flex justify-end">
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        <Save size={15} /> {pending ? "Đang lưu…" : label}
      </Button>
    </div>
  );
}

/* SettingsForm — wrapper dùng chung cho các form Settings dùng useActionState.
 * Hiển thị banner feedback + footer pending (disable nút + chữ "Đang lưu…"). */
function SettingsForm({
  action,
  footerLabel,
  encType,
  children
}: {
  action: SettingsAction;
  footerLabel?: string;
  encType?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(action, undefined);
  const refreshedSuccessRef = useRef<string | null>(null);
  const reportedErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state?.success || refreshedSuccessRef.current === state.success) return;
    refreshedSuccessRef.current = state.success;
    toast.success({ title: state.success, message: "Dữ liệu đã được lưu và đồng bộ lại từ hệ thống." });
    router.refresh();
  }, [router, state?.success, toast]);

  useEffect(() => {
    if (!state?.error || reportedErrorRef.current === state.error) return;
    reportedErrorRef.current = state.error;
    toast.error({ title: "Không lưu được thay đổi", message: state.error });
  }, [state?.error, toast]);

  return (
    <form action={formAction} encType={encType} className="flex flex-col gap-[var(--d-s-4)]">
      <FormFeedback state={state} />
      {children}
      <FormFooter label={footerLabel} pending={pending} />
    </form>
  );
}

function timeValue(value: string | null) {
  return value?.slice(0, 5) ?? "";
}

export function ProfileSection({ restaurant, email }: { restaurant: RestaurantRow; email: string }) {
  const pinned = restaurant.store_lat !== null && restaurant.store_lng !== null;
  return (
    <SettingsForm action={updateRestaurantSettingsAction} footerLabel="Lưu hồ sơ quán" encType="multipart/form-data">
      <input type="hidden" name="settingsSection" value="profile" />

      <Panel className="overflow-hidden">
        <div className="h-12 bg-[linear-gradient(135deg,var(--d-jade-900),var(--d-jade-700)_45%,var(--d-orange))]" />
        <div className="flex flex-wrap items-end gap-3 px-[var(--d-s-5)] pb-[var(--d-s-4)]">
          <div className="-mt-7 grid h-14 w-14 place-items-center overflow-hidden rounded-[var(--d-r-md)] border-4 border-[var(--d-surface)] bg-[var(--d-surface-2)] text-[var(--d-primary)]">
            {restaurant.logo_url ? (
              <Image src={restaurant.logo_url} alt={`Logo ${restaurant.name}`} width={80} height={80} className="h-full w-full object-cover" />
            ) : <Store size={22} />}
          </div>
          <div className="min-w-0 flex-1 pt-2">
            <p className="truncate text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{restaurant.name}</p>
            <p className="truncate text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{restaurant.slug}.logivn.com · {restaurant.hotline || "Chưa có hotline"}</p>
          </div>
        </div>
      </Panel>

      <Panel className="p-[var(--d-s-5)]">
        <p className="d-eyebrow">Hồ sơ quán</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Tên quán">
            <input name="name" defaultValue={restaurant.name} required className={inputCls} />
          </Field>
          <Field label="Loại hình">
            <select name="businessType" defaultValue={restaurant.business_type ?? ""} className={selectCls}>
              <option value="">Chưa chọn</option>
              <option value="CAFE">Café</option>
              <option value="RESTAURANT">Nhà hàng</option>
              <option value="FAST_FOOD">Quán ăn nhanh</option>
              <option value="BAR">Bar</option>
              <option value="OTHER">Khác</option>
            </select>
          </Field>
          <Field label="Hotline"><input name="hotline" defaultValue={restaurant.hotline ?? ""} placeholder="0901234567" className={inputCls} /></Field>
          <Field label="Email"><input name="contactEmail" type="email" defaultValue={restaurant.contact_email ?? email} className={inputCls} /></Field>
          <Field label="Mô tả quán" full hint="Mô tả ngắn dùng cho menu khách và SEO.">
            <textarea name="description" defaultValue={restaurant.description ?? ""} placeholder="Mô tả ngắn" className={textareaCls} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
          <div className="flex min-w-0 gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]"><MapPin size={18} /></span>
            <div className="min-w-0">
              <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">Địa chỉ &amp; ghim vị trí</p>
              <p className="mt-1 text-[length:var(--d-fs-sm)] leading-5 text-[var(--d-text-muted)]">{restaurant.address || "Chưa cấu hình địa chỉ quán."}</p>
              <p className="mt-1 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-faint)]">
                {pinned ? `Đã ghim: ${restaurant.store_lat?.toFixed(5)}, ${restaurant.store_lng?.toFixed(5)}` : "Chưa có toạ độ. Khách sẽ không đo được khoảng cách chính xác."}
              </p>
            </div>
          </div>
          <Link href="/dashboard/settings?section=online" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-jade)] bg-[var(--d-primary-soft)] px-3 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] transition hover:bg-[var(--d-primary-soft)]">
            Cập nhật trên bản đồ <ExternalLink size={13} />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-primary)] sm:h-28 sm:w-28">
            {restaurant.logo_url ? <Image src={restaurant.logo_url} alt="Logo" width={112} height={112} className="h-full w-full object-cover" /> : <Store size={26} />}
          </div>
          <div className="min-w-0 grid gap-2">
            <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">Logo quán</p>
            <p className="text-[length:var(--d-fs-xs)] leading-5 text-[var(--d-text-muted)]">JPG / PNG / WebP, tối đa 5MB. Dùng cho menu online, hoá đơn, thông báo.</p>
            <label className="flex h-10 items-center gap-2 rounded-[var(--d-r-md)] border border-dashed border-[var(--d-jade)]/40 bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:bg-[var(--d-primary-soft)]">
              <Upload size={15} className="text-[var(--d-primary)]" />
              <input name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" className="min-w-0 flex-1 text-[length:var(--d-fs-sm)] file:mr-2 file:rounded-[var(--d-r-sm)] file:border-0 file:bg-[var(--d-jade)] file:px-3 file:py-1.5 file:text-[length:var(--d-fs-xs)] file:font-bold file:text-[var(--d-on-jade)]" />
            </label>
            {restaurant.logo_url ? (
              <SwitchField name="removeLogo" label="Gỡ logo hiện tại" hint="Bật để xoá logo khi lưu." icon={<Upload size={16} />} />
            ) : null}
          </div>
        </div>
      </Panel>
    </SettingsForm>
  );
}

export function HoursSection({ restaurant }: { restaurant: RestaurantRow }) {
  return (
    <SettingsForm action={updateRestaurantSettingsAction} footerLabel="Lưu giờ hoạt động">
      <input type="hidden" name="settingsSection" value="hours" />
      <Panel className="p-[var(--d-s-5)]">
        <p className="d-eyebrow">Giờ hoạt động</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Giờ mở cửa">
            <input name="openingTime" type="time" defaultValue={timeValue(restaurant.opening_time)} className={inputCls} />
          </Field>
          <Field label="Giờ đóng cửa">
            <input name="closingTime" type="time" defaultValue={timeValue(restaurant.closing_time)} className={inputCls} />
          </Field>
        </div>
        <div className="mt-3">
          <SwitchField name="allowLegacyQr" label="Cho phép QR cũ" hint="Giữ tương thích mã QR bàn đời cũ." defaultChecked={restaurant.allow_legacy_qr} icon={<QrCode size={16} />} />
        </div>
      </Panel>
    </SettingsForm>
  );
}

export function TablesSection({ restaurant, tableCount, qrMenuUrl }: { restaurant: RestaurantRow; tableCount: number; qrMenuUrl: string }) {
  return (
    <Panel className="p-[var(--d-s-5)]">
      <p className="d-eyebrow">Bàn &amp; QR</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Bàn quản lý</p>
          <p className="d-num mt-1 text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{tableCount}</p>
        </div>
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">QR cũ</p>
          <p className="mt-1 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{restaurant.allow_legacy_qr ? "Đang bật" : "Đang tắt"}</p>
        </div>
        <Link href="/dashboard/tables" className="inline-flex items-center justify-center gap-2 rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-4 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] transition hover:bg-[var(--d-jade-700)]">
          <QrCode size={16} /> Quản lý bàn &amp; QR
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
        <span className="min-w-0 flex-1 truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{qrMenuUrl}</span>
        <a href={qrMenuUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[var(--d-r-md)] bg-[var(--d-orange)] px-3 text-[length:var(--d-fs-xs)] font-bold text-white transition hover:bg-[var(--d-orange-600)]">
          <ExternalLink size={14} /> Mở link
        </a>
      </div>
    </Panel>
  );
}

export function ReceiptSection({ restaurant }: { restaurant: RestaurantRow }) {
  return (
    <SettingsForm action={updateRestaurantSettingsAction} footerLabel="Lưu mẫu hoá đơn">
      <input type="hidden" name="settingsSection" value="receipt" />
      <Panel className="p-[var(--d-s-5)]">
        <p className="d-eyebrow">Mẫu in / hoá đơn</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Dòng cuối hoá đơn" full>
            <input name="receiptFooter" defaultValue={restaurant.receipt_footer ?? ""} placeholder="Cảm ơn quý khách" className={inputCls} />
          </Field>
        </div>
        <div className="mt-3">
          <SwitchField name="receiptShowQr" label="In QR trên hoá đơn" hint="Hiển thị QR thanh toán / menu khi in bill." defaultChecked={restaurant.receipt_show_qr} icon={<QrCode size={16} />} />
        </div>
      </Panel>
    </SettingsForm>
  );
}

export function BrandSection({ restaurant }: { restaurant: RestaurantRow }) {
  const swatches = [
    ["Màu chính", restaurant.brand_primary ?? "#0F4D3A"],
    ["Màu nhấn", restaurant.brand_accent ?? "#F28C28"],
    ["Màu nền", "#FFF7EB"]
  ] as const;
  return (
    <SettingsForm action={updateRestaurantSettingsAction} footerLabel="Lưu thương hiệu">
      <input type="hidden" name="settingsSection" value="brand" />
      <Panel className="p-[var(--d-s-5)]">
        <p className="d-eyebrow">Thương hiệu</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Màu chính"><input name="brandPrimary" defaultValue={restaurant.brand_primary ?? "#0F4D3A"} className={inputCls} /></Field>
          <Field label="Màu nhấn"><input name="brandAccent" defaultValue={restaurant.brand_accent ?? "#F28C28"} className={inputCls} /></Field>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {swatches.map(([label, color]) => (
            <div key={label} className="flex h-12 items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3">
              <span className="h-7 w-7 rounded-[var(--d-r-sm)]" style={{ background: color }} />
              <span>
                <span className="block text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</span>
                <span className="d-num block font-mono text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{color}</span>
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </SettingsForm>
  );
}

export function PermissionsSection() {
  return (
    <Panel className="p-[var(--d-s-5)]">
      <p className="d-eyebrow">Nhân quyền</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link href="/dashboard/staff" className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--d-r-md)] bg-[var(--d-orange)] px-4 text-[length:var(--d-fs-sm)] font-bold text-white transition hover:bg-[var(--d-orange-600)]">
          <ShieldCheck size={17} /> Thêm nhân viên
        </Link>
        <Link href="/dashboard/staff" className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-primary)] transition hover:border-[var(--d-jade)]">
          Xem danh sách nhân viên
        </Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">ADMIN</p>
          <p className="mt-1 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Cài đặt, báo cáo, nhân viên</p>
        </div>
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">STAFF</p>
          <p className="mt-1 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Đơn hàng, bếp, thanh toán</p>
        </div>
      </div>
    </Panel>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Chưa lên lịch";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

export function NotificationsSection({
  restaurant,
  branches,
  reportSchedule,
  reportLogs
}: {
  restaurant: RestaurantRow;
  branches: Awaited<ReturnType<typeof listStoreBranchesForManagement>>;
  reportSchedule: ReportScheduleSettings | null;
  reportLogs: Awaited<ReturnType<typeof listRecentReportLogs>>;
}) {
  const notifEnabled = [restaurant.notify_new_order, restaurant.notify_payment_waiting, restaurant.show_promotions_on_menu].filter(Boolean).length;
  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Panel className="p-[var(--d-s-5)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="d-eyebrow">Trung tâm thông báo</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Tóm lược</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Cảnh báo" value={`${notifEnabled}/3`} />
            <Mini label="Email" value={reportSchedule?.enabled ? "Bật" : "Tắt"} />
            <Mini label="Log" value={String(reportLogs.length)} />
          </div>
        </div>
      </Panel>

      <SettingsForm action={updateRestaurantSettingsAction} footerLabel="Lưu cảnh báo">
        <input type="hidden" name="settingsSection" value="notifications" />
        <Panel className="p-[var(--d-s-5)]">
          <p className="d-eyebrow">Cảnh báo vận hành</p>
          <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Tín hiệu cần báo ngay</h3>
          <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Tối ưu cho giờ cao điểm, tránh bỏ sót đơn và thanh toán.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <SwitchField name="notifyNewOrder" label="Báo đơn mới" hint="Nhắc khi khách tạo đơn." defaultChecked={restaurant.notify_new_order} icon={<Bell size={16} />} />
            <SwitchField name="notifyPaymentWaiting" label="Đơn chờ thanh toán" hint="Theo dõi bill chưa hoàn tất." defaultChecked={restaurant.notify_payment_waiting} icon={<CreditCard size={16} />} />
            <SwitchField name="showPromotionsOnMenu" label="Mã khuyến mãi" hint="Hiển thị ưu đãi trên menu khách." defaultChecked={restaurant.show_promotions_on_menu} icon={<Sparkles size={16} />} />
          </div>
        </Panel>
      </SettingsForm>

      <Panel className="p-[var(--d-s-5)]">
        <p className="d-eyebrow">Kênh realtime</p>
        <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Kết nối Telegram</h3>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Gửi tín hiệu vận hành ra nhóm quản lý khi cần.</p>
        <div className="mt-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)]">
          <TelegramConnectPanel
            branches={branches.map((b) => ({ id: b.id, name: b.name, isPrimary: b.is_primary, isActive: b.is_active }))}
          />
        </div>
      </Panel>

      {reportSchedule ? (
        <SettingsForm action={updateReportScheduleAction} footerLabel="Lưu lịch gửi báo cáo">
          <Panel className="p-[var(--d-s-5)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="d-eyebrow">Báo cáo email</p>
                <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Báo cáo tự động qua email</h3>
              </div>
              <SwitchField name="enabled" label="Bật gửi định kỳ" defaultChecked={reportSchedule.enabled} icon={<Bell size={16} />} className="w-full sm:w-auto sm:min-w-[240px]" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3 text-[length:var(--d-fs-sm)]">
                <div className="flex justify-between"><span className="text-[var(--d-text-muted)]">Lần gửi gần nhất</span><strong className="text-[var(--d-text)]">{formatDateTime(reportSchedule.lastSentAt)}</strong></div>
                <div className="mt-2 flex justify-between"><span className="text-[var(--d-text-muted)]">Lần gửi tiếp theo</span><strong className="text-[var(--d-text)]">{formatDateTime(reportSchedule.nextRunAt)}</strong></div>
              </div>
              <Field label="Email nhận báo cáo" hint="Tối đa 10 email, cách nhau bằng xuống dòng hoặc dấu phẩy.">
                <textarea name="recipients" defaultValue={reportSchedule.recipients.join("\n")} placeholder="chuquan@quan.vn" className={textareaCls + " min-h-24"} />
              </Field>
            </div>

            <details className="mt-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)]">
              <summary className="flex cursor-pointer items-center justify-between gap-3 list-none">
                <div>
                  <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Lịch gửi &amp; file đính kèm</p>
                  <p className="mt-0.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Mở khi cần đổi chu kỳ hoặc loại file.</p>
                </div>
                <Badge tone="neutral">{reportSchedule.frequency}</Badge>
              </summary>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Chu kỳ">
                    <select name="frequency" defaultValue={reportSchedule.frequency} className={selectCls}>
                      <option value="weekly">Hàng tuần</option>
                      <option value="monthly">Hàng tháng</option>
                      <option value="yearly">Hàng năm</option>
                    </select>
                  </Field>
                  <Field label="Giờ gửi"><input name="sendHour" type="number" min={0} max={23} defaultValue={reportSchedule.sendHour} className={inputCls} /></Field>
                  <Field label="Thứ gửi">
                    <select name="sendDayOfWeek" defaultValue={reportSchedule.sendDayOfWeek} className={selectCls}>
                      <option value={1}>Thứ 2</option><option value={2}>Thứ 3</option><option value={3}>Thứ 4</option><option value={4}>Thứ 5</option><option value={5}>Thứ 6</option><option value={6}>Thứ 7</option><option value={7}>Chủ nhật</option>
                    </select>
                  </Field>
                  <Field label="Ngày gửi"><input name="sendDayOfMonth" type="number" min={1} max={31} defaultValue={reportSchedule.sendDayOfMonth} className={inputCls} /></Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-[160px_1fr_1fr]">
                  <Field label="Tháng gửi"><input name="sendMonth" type="number" min={1} max={12} defaultValue={reportSchedule.sendMonth} className={inputCls} /></Field>
                  <SwitchField name="includeCsv" label="Đính kèm CSV" defaultChecked={reportSchedule.includeCsv} icon={<FileText size={16} />} />
                  <SwitchField name="includeJson" label="Đính kèm dữ liệu chi tiết" defaultChecked={reportSchedule.includeJson} icon={<FileText size={16} />} />
                </div>
              </div>
            </details>
          </Panel>
        </SettingsForm>
      ) : null}

      {reportLogs.length > 0 ? (
        <details className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
          <summary className="flex cursor-pointer items-center justify-between gap-3 list-none">
            <div>
              <p className="d-eyebrow">Audit trail</p>
              <p className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Lịch sử gửi báo cáo</p>
            </div>
            <Badge tone="neutral">{reportLogs.length} bản ghi</Badge>
          </summary>
          <div className="mt-3 overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)]">
            {reportLogs.map((log) => (
              <div key={log.id} className="grid gap-1 border-b border-[var(--d-line)] px-3 py-2 text-[length:var(--d-fs-sm)] last:border-0 sm:grid-cols-[1fr_120px_1.4fr]">
                <span>
                  <span className="block font-semibold text-[var(--d-text)]">{log.period_type} · {log.period_start} - {log.period_end}</span>
                  <span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">{formatDateTime(log.sent_at ?? log.created_at)}</span>
                </span>
                <Badge tone={log.status === "sent" ? "ok" : log.status === "failed" ? "danger" : "neutral"}>{log.status}</Badge>
                <span className="truncate text-[var(--d-text-muted)]">{log.error_message ?? log.recipient_emails.join(", ")}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2">
      <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="mt-1 truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

type BranchRow = Awaited<ReturnType<typeof listStoreBranchesForManagement>>[number];

function branchReadiness(b: BranchRow): { label: string; tone: "ok" | "orange" | "neutral" } {
  if (!b.is_active) return { label: "Đã ẩn", tone: "neutral" };
  if (b.latitude === null || b.longitude === null) return { label: "Thiếu toạ độ", tone: "orange" };
  return { label: "Sẵn sàng", tone: "ok" };
}

function BranchFields({ branch }: { branch?: BranchRow }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Field label="Tên chi nhánh">
          <input name="name" defaultValue={branch?.name ?? ""} required maxLength={120} placeholder="Chi nhánh chính" className={inputCls} />
        </Field>
        <Field label="Địa chỉ">
          <input name="address" defaultValue={branch?.address ?? ""} maxLength={240} placeholder="Địa chỉ vận hành" className={inputCls} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vĩ độ" hint="Để trống nếu chưa ghim bản đồ.">
          <input name="latitude" type="number" step="any" min={-90} max={90} defaultValue={branch?.latitude ?? ""} placeholder="10.762" className={inputCls} />
        </Field>
        <Field label="Kinh độ">
          <input name="longitude" type="number" step="any" min={-180} max={180} defaultValue={branch?.longitude ?? ""} placeholder="106.660" className={inputCls} />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <SwitchField name="isPrimary" label="Chi nhánh chính" defaultChecked={branch?.is_primary ?? false} icon={<Store size={16} />} />
        <SwitchField name="isActive" label="Đang hoạt động" defaultChecked={branch?.is_active ?? true} icon={<ShieldCheck size={16} />} />
      </div>
    </div>
  );
}

export function BranchesSection({ branches }: { branches: Awaited<ReturnType<typeof listStoreBranchesForManagement>> }) {
  const [createState, createAction, createPending] = useActionState(createStoreBranchAction, undefined);
  const [updateState, updateAction, updatePending] = useActionState(updateStoreBranchAction, undefined);
  const activeCount = branches.filter((b) => b.is_active).length;
  const withCoords = branches.filter((b) => b.latitude !== null && b.longitude !== null).length;
  const primary = branches.find((b) => b.is_primary && b.is_active) ?? branches.find((b) => b.is_active) ?? branches[0] ?? null;

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Panel className="p-[var(--d-s-5)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="d-eyebrow">Nền tảng chi nhánh</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Chi nhánh của quán</h3>
            <p className="mt-1 max-w-2xl text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Quán luôn có chi nhánh mặc định để bàn, đơn, nhân viên, kho và AI cùng gán về một điểm vận hành.
            </p>
          </div>
          <div className="grid min-w-[200px] gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3 text-[length:var(--d-fs-sm)]">
            <div className="flex items-center justify-between gap-3"><span className="text-[var(--d-text-muted)]">Đang hoạt động</span><strong className="d-num text-[var(--d-text)]">{activeCount}/{branches.length}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="text-[var(--d-text-muted)]">Có toạ độ</span><strong className="d-num text-[var(--d-text)]">{withCoords}</strong></div>
          </div>
        </div>
        {primary ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-jade)]/20 bg-[var(--d-primary-soft)] px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-surface)] text-[var(--d-primary)]"><Store size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{primary.name}</span>
              <span className="mt-0.5 flex items-center gap-1 truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]"><MapPin size={12} />{primary.address || "Chưa có địa chỉ riêng"}</span>
            </span>
            <Badge tone="ok">Mặc định hiện hành</Badge>
          </div>
        ) : null}
      </Panel>

      <form action={createAction} className="flex flex-col gap-[var(--d-s-4)]">
        <FormFeedback state={createState} />
        <Panel className="p-[var(--d-s-5)]">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]"><Plus size={16} /></span>
            <h3 className="text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Thêm chi nhánh</h3>
          </div>
          <BranchFields />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Có thể để trống toạ độ nếu chưa ghim bản đồ; quyền vận hành vẫn được gán đủ.</p>
            <FormFooter label="Tạo chi nhánh" pending={createPending} />
          </div>
        </Panel>
      </form>

      <div className="grid gap-3">
        {branches.map((branch) => {
          const r = branchReadiness(branch);
          return (
            <form key={branch.id} action={updateAction}>
              <Panel className="p-[var(--d-s-5)]">
                <input type="hidden" name="branchId" value={branch.id} />
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-surface-2)] text-[var(--d-primary)]"><Store size={17} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{branch.name}</p>
                      <p className="mt-0.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{branch.is_primary ? "Chi nhánh chính" : `Tạo ${new Date(branch.created_at).toLocaleDateString("vi-VN")}`}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {branch.is_primary ? <Badge tone="jade">Chính</Badge> : null}
                    <Badge tone={r.tone}>{r.label}</Badge>
                  </div>
                </div>
                <BranchFields branch={branch} />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                    {r.tone === "ok" ? <Check size={14} className="text-[var(--d-ok-fg)]" /> : <AlertTriangle size={14} className="text-[var(--d-orange-600)]" />}
                    {branch.latitude !== null && branch.longitude !== null ? `${branch.latitude.toFixed(5)}, ${branch.longitude.toFixed(5)}` : "Chưa ghim toạ độ"}
                  </span>
                  <FormFooter label="Lưu chi nhánh" pending={updatePending} />
                </div>
              </Panel>
            </form>
          );
        })}
      </div>
      <FormFeedback state={updateState} />
    </div>
  );
}

export function OnlineSection({
  restaurant,
  branchDeliverySettings,
  mapOperationalMetrics,
  onlineOrderUrl
}: {
  restaurant: RestaurantRow;
  branchDeliverySettings: BranchDeliverySettings[];
  mapOperationalMetrics: Awaited<ReturnType<typeof getMapOperationalMetrics>> | null;
  onlineOrderUrl: string;
}) {
  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Panel className="p-[var(--d-s-5)]">
        <p className="d-eyebrow">Phục vụ giao hàng theo chi nhánh</p>
        <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Bật / tắt nhận đơn online</h3>
        <p className="mt-1 flex items-start gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          <Bike size={13} className="mt-0.5 text-[var(--d-orange-600)]" /> Mỗi chi nhánh có thể đặt giờ phục vụ và bán kính giao hàng riêng.
        </p>
        <div className="mt-3">
          <BranchDeliveryControls branches={branchDeliverySettings} />
        </div>
      </Panel>

      {mapOperationalMetrics ? (
        <Panel className="p-[var(--d-s-5)]">
          <p className="d-eyebrow">Sức khoẻ bản đồ &amp; định tuyến</p>
          <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Vận hành map &amp; ETA</h3>
          <div className="mt-3">
            <MapOperationalMetricsPanel metrics={mapOperationalMetrics} />
          </div>
        </Panel>
      ) : null}

      <Panel className="p-[var(--d-s-5)]">
        <p className="d-eyebrow">Cấu hình bán online</p>
        <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Pickup, delivery &amp; phí ship</h3>
        <div className="mt-3">
          <OrderingSettingsForm settings={restaurant} onlineUrl={onlineOrderUrl} compact />
        </div>
      </Panel>
    </div>
  );
}

const BANK_SUGGESTIONS = ["VCB", "TCB", "ACB", "BIDV", "MB", "VPB", "TPB", "VIB", "MSB", "OCB"];

export function PaymentsSection({ restaurant }: { restaurant: RestaurantRow }) {
  const isConfigured = Boolean(restaurant.bank_code && restaurant.bank_account && restaurant.bank_account_name);
  return (
    <SettingsForm action={updatePaymentSettingsAction} footerLabel="Lưu thông tin VietQR">
      <Panel className="p-[var(--d-s-5)]">
        <p className="d-eyebrow">Tài khoản nhận tiền</p>
        <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">VietQR &amp; chuyển khoản</h3>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          LogiVN dùng thông tin này để tạo mã VietQR tự động cho đơn tại bàn, đơn online và gia hạn gói.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
            <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Trạng thái</p>
            <p className={cn("mt-1 text-[length:var(--d-fs-sm)] font-bold", isConfigured ? "text-[var(--d-primary)]" : "text-[var(--d-orange-600)]")}>
              {isConfigured ? "VietQR sẵn sàng" : "Chưa đủ thông tin"}
            </p>
          </div>
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
            <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Ngân hàng</p>
            <p className="mt-1 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{restaurant.bank_code || "Chưa chọn"}</p>
          </div>
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
            <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Tài khoản</p>
            <p className="d-num mt-1 truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{restaurant.bank_account || "Chưa có"}</p>
            <p className="truncate text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">{restaurant.bank_account_name || "Chưa có chủ TK"}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_1fr]">
          <Field label="Mã ngân hàng" hint="VD: VCB, TCB, MB">
            <input name="bankCode" list="settings-bank-codes" defaultValue={restaurant.bank_code ?? ""} placeholder="VCB" autoComplete="off" required className={inputCls} />
            <datalist id="settings-bank-codes">
              {BANK_SUGGESTIONS.map((b) => <option key={b} value={b} />)}
            </datalist>
          </Field>
          <Field label="Số tài khoản">
            <input name="bankAccount" defaultValue={restaurant.bank_account ?? ""} inputMode="numeric" placeholder="1234567890" autoComplete="off" required className={inputCls} />
          </Field>
          <Field label="Tên chủ tài khoản">
            <input name="bankAccountName" defaultValue={restaurant.bank_account_name ?? ""} placeholder="CONG TY TNHH ABC" autoComplete="off" required className={inputCls} />
          </Field>
        </div>
      </Panel>
    </SettingsForm>
  );
}

type AiBrandingResponse = {
  data?: { slogans?: string[]; description?: string; brandVoice?: string; logoPrompt?: string } | null;
};
type AiImageResponse = { imageUrl?: string | null; prompt?: string };
type AiApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

export function AiSetupSection({
  setupReadiness,
  restaurantName
}: {
  setupReadiness: ReturnType<typeof buildStoreSetupReadiness>;
  restaurantName: string;
}) {
  void setupReadiness;
  const [brandBrief, setBrandBrief] = useState("");
  const [branding, setBranding] = useState<AiBrandingResponse | null>(null);
  const [selectedSlogan, setSelectedSlogan] = useState("");
  const [logoDraft, setLogoDraft] = useState<AiImageResponse | null>(null);
  const [loading, setLoading] = useState<"brand" | "logo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyState, applyBrandAction, applyingBrand] = useActionState(applyAiSetupBrandAction, undefined);

  const brandingData = branding?.data ?? null;
  const slogans = brandingData?.slogans?.filter(Boolean).slice(0, 3) ?? [];
  const activeSlogan = selectedSlogan || slogans[0] || "";
  const description = brandingData?.description ?? "";
  const logoUrl = logoDraft?.imageUrl ?? "";
  const canApplyText = Boolean(activeSlogan || description);
  const canApplyLogo = Boolean(logoUrl);

  async function runBranding() {
    setLoading("brand");
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/branding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurantName,
          tone: brandBrief.trim() || "hiện đại, dễ tin, ấm áp, hợp quán F&B Việt Nam",
          audience: "khách địa phương, dân văn phòng, gia đình và khách quen"
        })
      });
      const result = (await res.json().catch(() => null)) as AiApiResponse<AiBrandingResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "Chưa tạo được bộ nhận diện.");
      setBranding(result.data);
      setSelectedSlogan(result.data.data?.slogans?.[0] ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được nhận diện thương hiệu.");
    } finally {
      setLoading(null);
    }
  }

  async function runLogo() {
    setLoading("logo");
    setError(null);
    try {
      const prompt = brandingData?.logoPrompt || `Biểu tượng logo vuông cho ${restaurantName}, không chữ nhỏ, dễ dùng làm avatar quán F&B Việt Nam.`;
      const res = await fetch("/api/admin/ai/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "logo", restaurantName, prompt })
      });
      const result = (await res.json().catch(() => null)) as AiApiResponse<AiImageResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "Chưa tạo được logo.");
      setLogoDraft(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được logo.");
    } finally {
      setLoading(null);
    }
  }

  function copyText(value?: string | null) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <FormFeedback state={applyState} />
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--d-line)] bg-[linear-gradient(135deg,var(--d-primary-soft),var(--d-accent-soft))] px-[var(--d-s-5)] py-[var(--d-s-4)]">
          <div className="min-w-0">
            <p className="d-eyebrow text-[var(--d-orange-600)]">Studio nhận diện</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{restaurantName}</h3>
            <p className="mt-1 max-w-2xl text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Tạo slogan, mô tả và logo bằng AI rồi áp dụng thẳng vào hồ sơ quán.
            </p>
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] text-[var(--d-on-jade)]"><Sparkles size={20} /></span>
        </div>

        <div className="grid gap-[var(--d-s-4)] p-[var(--d-s-5)] xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
          {/* Cột tạo nội dung */}
          <div className="grid content-start gap-3">
            <label className="grid gap-1.5">
              <span className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Hướng thương hiệu</span>
              <textarea
                value={brandBrief}
                onChange={(e) => setBrandBrief(e.target.value)}
                placeholder="VD: quán phở gia đình, sạch, nhanh, ấm cúng, muốn logo tối giản và slogan dễ nhớ…"
                className={textareaCls + " min-h-28"}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="primary" size="md" onClick={() => void runBranding()} disabled={Boolean(loading)}>
                {loading === "brand" ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />}
                {brandingData ? "Tạo lại slogan" : "Tạo slogan"}
              </Button>
              <Button type="button" variant="secondary" size="md" onClick={() => void runLogo()} disabled={Boolean(loading)}>
                {loading === "logo" ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                {logoDraft ? "Tạo lại logo" : "Tạo logo"}
              </Button>
            </div>

            {error ? (
              <p className="rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-orange-600)]">{error}</p>
            ) : null}

            {brandingData ? (
              <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Chọn slogan</p>
                  {description ? (
                    <button type="button" onClick={() => copyText(description)} className="inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-primary)]">
                      <Copy size={13} /> Copy mô tả
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2">
                  {slogans.map((slogan) => {
                    const active = activeSlogan === slogan;
                    return (
                      <button
                        key={slogan}
                        type="button"
                        onClick={() => setSelectedSlogan(slogan)}
                        className={cn(
                          "flex min-h-11 items-center justify-between gap-3 rounded-[var(--d-r-md)] px-3 py-2 text-left text-[length:var(--d-fs-sm)] font-semibold transition",
                          active ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "border border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text)] hover:border-[var(--d-jade)]"
                        )}
                      >
                        <span>{slogan}</span>
                        {active ? <Check size={15} className="shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
                {description ? <p className="mt-3 rounded-[var(--d-r-md)] bg-[var(--d-surface)] px-3 py-3 text-[length:var(--d-fs-sm)] leading-6 text-[var(--d-text-muted)]">{description}</p> : null}
              </div>
            ) : null}
          </div>

          {/* Cột preview + áp dụng */}
          <form action={applyBrandAction} className="grid content-start gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
            <input type="hidden" name="brandSlogan" value={activeSlogan} />
            <input type="hidden" name="brandDescription" value={description} />
            <input type="hidden" name="logoUrl" value={logoUrl} />

            <div className="overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)]">
              <div className="grid place-items-center bg-[linear-gradient(135deg,var(--d-jade-900),var(--d-jade-700)_50%,var(--d-orange))] p-6">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo gợi ý" className="h-28 w-28 rounded-[var(--d-r-lg)] border-4 border-white/80 bg-white object-cover" />
                ) : (
                  <span className="grid h-28 w-28 place-items-center rounded-[var(--d-r-lg)] border-4 border-white/60 bg-white/20 text-white"><ImageIcon size={34} /></span>
                )}
              </div>
              <div className="p-[var(--d-s-4)]">
                <p className="d-eyebrow text-[var(--d-orange-600)]">Preview hồ sơ</p>
                <h4 className="mt-1 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{restaurantName}</h4>
                <p className="mt-2 text-[length:var(--d-fs-body)] font-semibold text-[var(--d-primary)]">{activeSlogan || "Slogan sẽ hiện ở đây"}</p>
                <p className="mt-2 line-clamp-4 text-[length:var(--d-fs-sm)] leading-6 text-[var(--d-text-muted)]">
                  {description || "Mô tả thương hiệu sẽ được lưu vào hồ sơ quán sau khi bạn áp dụng."}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Button type="submit" name="includeLogo" value="false" variant="primary" size="md" disabled={applyingBrand || !canApplyText}>
                {applyingBrand ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Áp dụng slogan + mô tả
              </Button>
              <Button type="submit" name="includeLogo" value="true" variant="secondary" size="md" disabled={applyingBrand || !canApplyLogo}>
                {applyingBrand ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                Áp dụng cả logo
              </Button>
            </div>
          </form>
        </div>
      </Panel>
    </div>
  );
}

/* sentinel — giữ icon imports tránh lint dù vài chỗ chưa dùng tới */
export const __settingsIconLib = { AlertTriangle, Clock3, FileText, Paintbrush, Sparkles, Store, requestSubscriptionPaymentAction };
