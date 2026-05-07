import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  CircleDot,
  CreditCard,
  Database,
  FileSliders,
  GitBranch,
  Globe2,
  KeyRound,
  LockKeyhole,
  LogOut,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Upload,
  UserRound,
  UsersRound
} from "lucide-react";
import {
  confirmSubscriptionPaymentAction,
  platformAdminLogoutAction,
  refreshPlatformAdminAction,
  rejectSubscriptionPaymentAction,
  updateBillingSettingAction,
  updateBrandSettingAction,
  updateLandingSettingAction,
  updatePlatformUserStatusAction,
  updateSaasPlanAction,
  updateTenantPlatformStatusAction
} from "@/app/admin/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getPlatformAdminSnapshot } from "@/services/platform-admin-service";

type Snapshot = Awaited<ReturnType<typeof getPlatformAdminSnapshot>>;
type ActiveSection = "overview" | "site" | "plans" | "billing" | "tenants" | "users" | "security" | "release";
type Tenant = Snapshot["tenants"][number];
type Plan = Snapshot["plans"][number];

const sections: Array<{ key: ActiveSection; label: string; href: string; icon: React.ElementType }> = [
  { key: "overview", label: "Tổng quan", href: "/admin", icon: SlidersHorizontal },
  { key: "site", label: "Website", href: "/admin/site", icon: FileSliders },
  { key: "plans", label: "Gói dịch vụ", href: "/admin/plans", icon: PackageCheck },
  { key: "billing", label: "Thanh toán gói", href: "/admin/billing", icon: CreditCard },
  { key: "tenants", label: "Cửa hàng", href: "/admin/tenants", icon: Store },
  { key: "users", label: "User", href: "/admin/users", icon: UsersRound },
  { key: "security", label: "Bảo mật", href: "/admin/security", icon: ShieldCheck },
  { key: "release", label: "Release", href: "/admin/release", icon: GitBranch }
];

const moduleStatusLabel: Record<string, string> = {
  live: "Đang chạy",
  needs_config: "Cần cấu hình",
  needs_review: "Cần rà soát"
};

const tenantStatusLabel: Record<Tenant["platformStatus"], string> = {
  active: "Đang hoạt động",
  suspended: "Tạm dừng",
  deleted: "Đã xoá mềm"
};

const subscriptionStatusLabel: Record<string, string> = {
  trialing: "Đang dùng thử",
  pending_payment: "Chờ thanh toán",
  active: "Đang gia hạn",
  past_due: "Quá hạn",
  suspended: "Tạm dừng",
  cancelled: "Đã huỷ",
  expired: "Hết hạn"
};

const paymentStatusLabel: Record<string, string> = {
  waiting_confirm: "Chờ xác minh",
  confirmed: "Đã xác minh",
  rejected: "Từ chối",
  expired: "Hết hạn"
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function badgeTone(kind: "good" | "warning" | "danger" | "info" | "neutral") {
  return cn(
    "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold",
    kind === "good" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    kind === "warning" && "border-orange-200 bg-orange-50 text-orange-700",
    kind === "danger" && "border-red-200 bg-red-50 text-red-700",
    kind === "info" && "border-blue-200 bg-blue-50 text-blue-700",
    kind === "neutral" && "border-slate-200 bg-slate-50 text-slate-600"
  );
}

function statusTone(status: string) {
  if (status === "active" || status === "confirmed" || status === "live") return "good";
  if (status === "suspended" || status === "waiting_confirm" || status === "trialing" || status === "needs_review") return "warning";
  if (status === "deleted" || status === "blocked" || status === "rejected" || status === "past_due") return "danger";
  if (status === "needs_config" || status === "pending_payment") return "info";
  return "neutral";
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = true,
  placeholder
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  rows = 4
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={rows}
        className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-6 text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
      />
    </label>
  );
}

function PrimaryButton({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "orange" | "danger" | "soft" }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
        tone === "dark" && "bg-slate-950 text-white hover:bg-slate-800",
        tone === "orange" && "bg-[#F28C28] text-white hover:bg-[#dc7c1f]",
        tone === "danger" && "bg-red-600 text-white hover:bg-red-700",
        tone === "soft" && "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
  tone?: "neutral" | "good" | "warning" | "danger" | "info";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl border",
            tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            tone === "warning" && "border-orange-200 bg-orange-50 text-orange-700",
            tone === "danger" && "border-red-200 bg-red-50 text-red-700",
            tone === "info" && "border-blue-200 bg-blue-50 text-blue-700",
            tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function SectionCard({
  title,
  action,
  children,
  className
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white", className)}>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight text-slate-950">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Sidebar({ activeSection, snapshot }: { activeSection: ActiveSection; snapshot: Snapshot }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] border-r border-slate-200 bg-white lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-4">
          <LogiVNLogo href="/admin" className="h-9" priority />
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Platform admin</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{snapshot.environment.vercelEnv}</p>
            <p className="mt-1 truncate text-xs text-slate-500">Không hiển thị doanh thu/đơn riêng tư của quán</p>
          </div>
        </div>
        <nav className="grid gap-1 p-3">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.key;
            return (
              <Link
                key={section.key}
                href={section.href}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                  active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                )}
              >
                <Icon size={16} />
                {section.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-slate-200 p-3">
          <form action={platformAdminLogoutAction}>
            <button className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <LogOut size={16} />
              Đăng xuất /admin
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ activeSection, snapshot }: { activeSection: ActiveSection; snapshot: Snapshot }) {
  const active = sections.find((section) => section.key === activeSection) ?? sections[0];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-5">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">LogiVN control plane</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">{active.label}</h1>
        </div>
        <div className="flex items-center gap-2">
          <form action={refreshPlatformAdminAction}>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <RefreshCw size={15} />
              Làm mới
            </button>
          </form>
          <span className="hidden h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-500 sm:inline-flex">
            {formatDateTime(snapshot.generatedAt)} · {snapshot.queryLatencyMs}ms
          </span>
        </div>
      </div>
    </header>
  );
}

function Overview({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4">
      {snapshot.warnings.length ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-semibold leading-6 text-orange-800">
          Cần chạy migration mới nhất: {snapshot.warnings.join(" · ")}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Cửa hàng" value={formatNumber(snapshot.metrics.tenants)} detail={`${snapshot.metrics.activeTenants} đang hoạt động`} icon={Building2} tone="info" />
        <MetricCard label="Subscription active" value={formatNumber(snapshot.metrics.activeSubscriptions)} detail={`${snapshot.metrics.trialingSubscriptions} quán đang trial 30 ngày`} icon={PackageCheck} tone="good" />
        <MetricCard label="MRR nền tảng" value={formatVnd(snapshot.metrics.mrr)} detail="Chỉ tính phí SaaS của LogiVN, không đọc doanh thu quán" icon={Banknote} tone="good" />
        <MetricCard label="Chờ xác minh" value={formatNumber(snapshot.metrics.pendingPayments)} detail="Giao dịch VietQR mua/gia hạn gói" icon={CreditCard} tone={snapshot.metrics.pendingPayments ? "warning" : "neutral"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <SectionCard title="Việc cần xử lý ngay">
          <div className="grid gap-2">
            {snapshot.payments.filter((payment) => payment.status === "waiting_confirm").slice(0, 6).map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{payment.restaurantName} · {formatVnd(payment.amount)}</p>
                  <p className="mt-1 font-mono text-xs text-orange-700">{payment.transferContent}</p>
                </div>
                <div className="flex gap-2">
                  <form action={confirmSubscriptionPaymentAction}>
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <PrimaryButton tone="orange">Xác minh</PrimaryButton>
                  </form>
                  <Link href="/admin/billing" className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-white px-3 text-sm font-semibold text-orange-700">
                    Chi tiết
                  </Link>
                </div>
              </div>
            ))}
            {!snapshot.metrics.pendingPayments ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                Không có giao dịch gói nào đang chờ xác minh.
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Guardrails thương mại">
          <div className="grid gap-3 text-sm leading-6 text-slate-600">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-950"><ShieldCheck size={16} /> Tách quyền rõ ràng</div>
              `/admin` chỉ là control plane nền tảng; không đọc danh sách đơn, bill hay doanh thu riêng của quán.
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-950"><KeyRound size={16} /> Trial abuse</div>
              {snapshot.metrics.abuseSignals ? `${snapshot.metrics.abuseSignals} email có dấu hiệu tạo trial nhiều lần.` : "Chưa có tín hiệu lạm dụng trial."}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-950"><Database size={16} /> RLS + service role</div>
              Tenant data vẫn được bảo vệ bằng RLS; tác vụ nền tảng dùng service-role ở server.
            </div>
          </div>
        </SectionCard>
      </div>

      <ModuleMap snapshot={snapshot} />
    </div>
  );
}

function SiteSettings({ snapshot }: { snapshot: Snapshot }) {
  const brand = snapshot.settings.brand.value;
  const landing = snapshot.settings.landing.value;
  const billing = snapshot.settings.billing.value;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <SectionCard title="Nhận diện thương hiệu">
        <form action={updateBrandSettingAction} encType="multipart/form-data" className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tên công ty" name="companyName" defaultValue={String(brand.companyName)} />
            <Field label="Pháp nhân" name="legalName" defaultValue={String(brand.legalName)} />
            <Field label="Hotline" name="hotline" defaultValue={String(brand.hotline)} />
            <Field label="Email hỗ trợ" name="email" type="email" defaultValue={String(brand.email)} />
            <Field label="Màu chính" name="primaryColor" type="color" defaultValue={String(brand.primaryColor)} />
            <Field label="Màu nhấn" name="accentColor" type="color" defaultValue={String(brand.accentColor)} />
          </div>
          <TextArea label="Địa chỉ công ty" name="address" defaultValue={String(brand.address)} rows={2} />
          <input type="hidden" name="logoUrl" value={String(brand.logoUrl)} />
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Tải logo mới
            <input name="logoFile" type="file" accept="image/*" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm" />
          </label>
          <PrimaryButton tone="dark"><Upload size={16} /> Lưu thương hiệu</PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard title="Landing page">
        <form action={updateLandingSettingAction} encType="multipart/form-data" className="grid gap-4">
          <Field label="Headline hero" name="heroTitle" defaultValue={String(landing.heroTitle)} />
          <TextArea label="Mô tả hero" name="heroSubtitle" defaultValue={String(landing.heroSubtitle)} rows={3} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="CTA chính" name="primaryCta" defaultValue={String(landing.primaryCta)} />
            <Field label="CTA phụ" name="secondaryCta" defaultValue={String(landing.secondaryCta)} />
          </div>
          <Field label="Tiêu đề social proof" name="trustTitle" defaultValue={String(landing.trustTitle)} />
          <Field label="Tiêu đề vùng dashboard" name="dashboardTitle" defaultValue={String(landing.dashboardTitle)} />
          <TextArea label="Mô tả vùng dashboard" name="dashboardSubtitle" defaultValue={String(landing.dashboardSubtitle)} rows={2} />
          <Field label="Tiêu đề CTA cuối trang" name="finalTitle" defaultValue={String(landing.finalTitle)} />
          <TextArea label="Mô tả CTA cuối trang" name="finalSubtitle" defaultValue={String(landing.finalSubtitle)} rows={2} />
          <Field label="Tagline footer" name="footerTagline" defaultValue={String(landing.footerTagline)} />
          <input type="hidden" name="bannerUrl" value={String(landing.bannerUrl)} />
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Tải banner hero mới
            <input name="bannerFile" type="file" accept="image/*" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm" />
          </label>
          <PrimaryButton tone="dark"><Upload size={16} /> Lưu landing</PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard title="Tài khoản VietQR của LogiVN" className="xl:col-span-2">
        <form action={updateBillingSettingAction} className="grid gap-4 md:grid-cols-5">
          <Field label="Ngân hàng" name="bankCode" defaultValue={String(billing.bankCode)} />
          <Field label="Số tài khoản" name="bankAccount" defaultValue={String(billing.bankAccount)} />
          <Field label="Tên chủ TK" name="bankAccountName" defaultValue={String(billing.bankAccountName)} />
          <Field label="Prefix nội dung" name="transferPrefix" defaultValue={String(billing.transferPrefix)} />
          <Field label="Gói mặc định" name="defaultPlanCode" defaultValue={String(billing.defaultPlanCode)} />
          <div className="md:col-span-5">
            <PrimaryButton tone="orange">Lưu cấu hình thu phí</PrimaryButton>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

function Plans({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {snapshot.plans.map((plan) => (
        <PlanForm key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

function PlanForm({ plan }: { plan: Plan }) {
  const schemaPending = plan.id.startsWith("schema-pending");

  return (
    <SectionCard title={`${plan.name} · ${formatVnd(plan.monthly_price)}/tháng`}>
      <form action={updateSaasPlanAction} className="grid gap-4">
        <input type="hidden" name="planId" value={plan.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tên gói" name="name" defaultValue={plan.name} />
          <Field label="Giá tháng" name="monthlyPrice" type="number" defaultValue={plan.monthly_price} />
          <Field label="Số ngày dùng thử" name="trialDays" type="number" defaultValue={plan.trial_days} />
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Trạng thái
            <select name="isActive" defaultValue={plan.is_active ? "true" : "false"} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
              <option value="true">Đang bán</option>
              <option value="false">Ẩn gói</option>
            </select>
          </label>
        </div>
        <TextArea label="Mô tả" name="description" defaultValue={plan.description ?? ""} rows={2} />
        <TextArea label="Tính năng, mỗi dòng một mục" name="features" defaultValue={plan.features.join("\n")} rows={5} />
        {schemaPending ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800">
            Cần chạy migration billing trước khi chỉnh gói này.
          </div>
        ) : (
          <PrimaryButton tone="dark">Lưu gói dịch vụ</PrimaryButton>
        )}
      </form>
    </SectionCard>
  );
}

function Billing({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Chờ xác minh" value={formatNumber(snapshot.metrics.pendingPayments)} detail="Chủ nền tảng xác nhận thủ công" icon={CreditCard} tone="warning" />
        <MetricCard label="MRR" value={formatVnd(snapshot.metrics.mrr)} detail="Doanh thu SaaS dự kiến hằng tháng" icon={Banknote} tone="good" />
        <MetricCard label="Trial" value={formatNumber(snapshot.metrics.trialingSubscriptions)} detail="Cần chuyển đổi sau 30 ngày" icon={CircleDot} tone="info" />
      </div>
      <SectionCard title="Giao dịch mua/gia hạn gói">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Quán</th>
                <th className="px-3 py-3">Gói</th>
                <th className="px-3 py-3">Nội dung CK</th>
                <th className="px-3 py-3 text-right">Số tiền</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Ngày tạo</th>
                <th className="px-3 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {snapshot.payments.map((payment) => (
                <tr key={payment.id} className="bg-white align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-950">{payment.restaurantName}</p>
                    <p className="mt-1 text-xs text-slate-500">{payment.restaurantSlug}.logivn.com</p>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{payment.planName} · {payment.months} tháng</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{payment.transferContent}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-950">{formatVnd(payment.amount)}</td>
                  <td className="px-3 py-3"><span className={badgeTone(statusTone(payment.status))}>{paymentStatusLabel[payment.status] ?? payment.status}</span></td>
                  <td className="px-3 py-3 text-slate-500">{formatDateTime(payment.createdAt)}</td>
                  <td className="px-3 py-3">
                    {payment.status === "waiting_confirm" ? (
                      <div className="flex justify-end gap-2">
                        <form action={confirmSubscriptionPaymentAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <PrimaryButton tone="orange">Xác minh</PrimaryButton>
                        </form>
                        <form action={rejectSubscriptionPaymentAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <input type="hidden" name="reason" value="Không khớp giao dịch ngân hàng" />
                          <PrimaryButton tone="soft">Từ chối</PrimaryButton>
                        </form>
                      </div>
                    ) : (
                      <p className="text-right text-xs text-slate-500">{payment.confirmedAt ? `Xong ${formatDateTime(payment.confirmedAt)}` : payment.rejectedReason ?? "Đã xử lý"}</p>
                    )}
                  </td>
                </tr>
              ))}
              {!snapshot.payments.length ? (
                <tr><td className="px-3 py-4 text-sm text-slate-500" colSpan={7}>Chưa có giao dịch gói.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function Tenants({ snapshot }: { snapshot: Snapshot }) {
  return (
    <SectionCard title="Quản lý vòng đời cửa hàng">
      <div className="grid gap-3">
        {snapshot.tenants.map((tenant) => (
          <details key={tenant.id} className="group rounded-2xl border border-slate-200 bg-white open:bg-slate-50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-slate-950">{tenant.name}</h3>
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">{tenant.slug}</span>
                  <span className={badgeTone(statusTone(tenant.platformStatus))}>{tenantStatusLabel[tenant.platformStatus]}</span>
                  <span className={badgeTone(statusTone(tenant.subscriptionStatus ?? "neutral"))}>{subscriptionStatusLabel[tenant.subscriptionStatus ?? ""] ?? "Chưa có gói"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{tenant.planName}</span>
                  <span>{tenant.userCount} user</span>
                  <span>{tenant.daysLeft} ngày còn lại</span>
                  <span>{tenant.domain}</span>
                </div>
              </div>
              <CircleDot className="shrink-0 text-slate-400 transition group-open:rotate-180" size={18} />
            </summary>

            <div className="grid gap-4 border-t border-slate-200 p-4 xl:grid-cols-[1fr_1fr_340px]">
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                {[
                  ["Email chủ quán", tenant.ownerEmails.join(", ") || tenant.contactEmail || "Chưa có"],
                  ["Hotline", tenant.hotline || "Chưa có"],
                  ["Địa chỉ", tenant.address || "Chưa có"],
                  ["Ngày tạo", formatDateTime(tenant.createdAt)],
                  ["Hết hạn kỳ hiện tại", formatDateTime(tenant.periodEnd)],
                  ["Lý do hạn chế", tenant.suspendedReason || "Không có"]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
                    <dd className="mt-2 break-words font-semibold text-slate-950">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Cờ rủi ro</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tenant.riskFlags.map((flag) => <span key={flag} className={badgeTone("warning")}>{flag}</span>)}
                  {!tenant.riskFlags.length ? <span className={badgeTone("good")}>Ổn</span> : null}
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Control plane chỉ quản lý trạng thái và gói của cửa hàng. Dữ liệu đơn hàng/doanh thu vẫn thuộc dashboard riêng của quán.
                </p>
              </div>

              <div className="grid gap-2">
                <TenantStatusForm tenant={tenant} status="active" label="Mở lại" tone="dark" />
                <TenantStatusForm tenant={tenant} status="suspended" label="Tạm dừng" tone="soft" />
                <TenantStatusForm tenant={tenant} status="deleted" label="Xóa mềm" tone="danger" />
              </div>
            </div>
          </details>
        ))}
      </div>
    </SectionCard>
  );
}

function TenantStatusForm({
  tenant,
  status,
  label,
  tone
}: {
  tenant: Tenant;
  status: "active" | "suspended" | "deleted";
  label: string;
  tone: "dark" | "soft" | "danger";
}) {
  return (
    <form action={updateTenantPlatformStatusAction} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <input type="hidden" name="restaurantId" value={tenant.id} />
      <input type="hidden" name="status" value={status} />
      <input
        name="reason"
        placeholder={status === "active" ? "Ghi chú mở lại" : "Lý do hiển thị trong audit"}
        className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
      />
      <PrimaryButton tone={tone}>{label}</PrimaryButton>
    </form>
  );
}

function Users({ snapshot }: { snapshot: Snapshot }) {
  return (
    <SectionCard title="Quản lý user nền tảng">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
            <tr>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Quán</th>
              <th className="px-3 py-3">Vai trò</th>
              <th className="px-3 py-3">Trạng thái</th>
              <th className="px-3 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {snapshot.users.map((user) => (
              <tr key={user.id} className="bg-white">
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-950">{user.email}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{user.id.slice(0, 8)}</p>
                </td>
                <td className="px-3 py-3 text-slate-600">{user.restaurantName}</td>
                <td className="px-3 py-3 text-slate-600">{user.role}</td>
                <td className="px-3 py-3"><span className={badgeTone(statusTone(user.accountStatus))}>{user.accountStatus === "blocked" ? "Đã chặn" : "Đang hoạt động"}</span></td>
                <td className="px-3 py-3">
                  <form action={updatePlatformUserStatusAction} className="ml-auto flex max-w-[360px] justify-end gap-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="status" value={user.accountStatus === "blocked" ? "active" : "blocked"} />
                    <input name="reason" placeholder="Lý do" className="h-9 w-40 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
                    <PrimaryButton tone={user.accountStatus === "blocked" ? "dark" : "danger"}>{user.accountStatus === "blocked" ? "Mở" : "Chặn"}</PrimaryButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function Security({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <SectionCard title="Audit 8 lớp bảo mật">
        <div className="grid gap-2">
          {snapshot.securityControls.map((control, index) => (
            <div key={control.layer} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{index + 1}. {control.layer}</p>
                <span className={badgeTone(control.status === "OK" ? "good" : control.status.includes("migration") ? "danger" : "warning")}>{control.status}</span>
              </div>
              <p className="text-xs leading-5 text-slate-500">{control.note}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Biến môi trường">
        <div className="grid gap-2">
          {snapshot.env.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">{item.name}</p>
              </div>
              <span className={badgeTone(item.configured ? "good" : item.required ? "danger" : "warning")}>{item.status}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4">
        <SectionCard title="Nhật ký /admin gần đây">
          <div className="grid max-h-[360px] gap-2 overflow-auto pr-1">
            {snapshot.auditLogs.slice(0, 12).map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-950">{log.action}</span>
                  <span className="text-xs font-semibold text-slate-500">{formatDateTime(log.createdAt)}</span>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">{log.targetType}{log.targetId ? ` · ${log.targetId}` : ""}</p>
              </div>
            ))}
            {!snapshot.auditLogs.length ? <p className="text-sm text-slate-500">Chưa có log audit hoặc chưa chạy migration audit.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Tín hiệu lạm dụng trial">
          <div className="grid gap-2">
            {snapshot.abuseSignals.map((signal) => (
              <div key={signal.email} className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
                <span className="font-semibold text-slate-950">{signal.email}</span>
                <span className="font-semibold text-orange-700">{signal.count} trial</span>
              </div>
            ))}
            {!snapshot.abuseSignals.length ? <p className="text-sm text-slate-500">Chưa thấy email tạo nhiều trial.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Đăng ký gần đây">
          <div className="grid gap-2">
            {snapshot.registrationIntents.slice(0, 8).map((intent) => (
              <div key={intent.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <span className="min-w-0 truncate font-semibold text-slate-950">{intent.email}</span>
                <span className={badgeTone(intent.consumed ? "good" : "warning")}>{intent.consumed ? "Đã dùng" : "Chờ OTP"}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function ModuleMap({ snapshot }: { snapshot: Snapshot }) {
  return (
    <SectionCard title="Bản đồ năng lực nền tảng">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {snapshot.modules.map((module) => (
          <div key={module.key} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{module.name}</p>
                <p className="mt-1 text-xs text-slate-500">{module.owner}</p>
              </div>
              <span className={badgeTone(statusTone(module.status))}>{moduleStatusLabel[module.status] ?? module.status}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{module.note}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function Release({ snapshot }: { snapshot: Snapshot }) {
  const checklist = [
    "Chạy migration platform billing trên Supabase trước khi bật thu phí",
    "Đặt PLATFORM_ADMIN_PASSWORD và PLATFORM_ADMIN_SESSION_SECRET mạnh ở Vercel",
    "Kết nối Resend để gửi nhắc trial/gia hạn",
    "Thêm cron tự đánh dấu hết hạn/past_due và nhắc thanh toán",
    "Bổ sung audit log bất biến cho mọi thao tác xác minh thanh toán"
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <SectionCard title="Release hiện tại">
        <dl className="grid gap-3 text-sm">
          {[
            ["App URL", snapshot.environment.appUrl],
            ["Root domain", snapshot.environment.rootDomain],
            ["Supabase", snapshot.environment.supabaseHost],
            ["Vercel env", snapshot.environment.vercelEnv],
            ["Region", snapshot.environment.region],
            ["Commit", snapshot.environment.commit]
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
              <dd className="mt-2 break-all font-mono text-sm text-slate-950">{value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <div className="grid gap-4">
        <ModuleMap snapshot={snapshot} />
        <SectionCard title="Việc cần làm trước thương mại hoá">
          <div className="grid gap-2">
            {checklist.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-950 text-xs font-semibold text-white">{index + 1}</span>
                <p className="text-sm leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function MobileNav({ activeSection }: { activeSection: ActiveSection }) {
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
      {sections.map((section) => {
        const Icon = section.icon;
        const active = activeSection === section.key;
        return (
          <Link
            key={section.key}
            href={section.href}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold",
              active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"
            )}
          >
            <Icon size={15} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PlatformAdminConsole({ snapshot, activeSection }: { snapshot: Snapshot; activeSection: ActiveSection }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <Sidebar activeSection={activeSection} snapshot={snapshot} />
      <section className="lg:pl-[252px]">
        <Topbar activeSection={activeSection} snapshot={snapshot} />
        <MobileNav activeSection={activeSection} />
        <div className="mx-auto max-w-[1500px] px-4 py-4 lg:px-5">
          {activeSection === "overview" ? <Overview snapshot={snapshot} /> : null}
          {activeSection === "site" ? <SiteSettings snapshot={snapshot} /> : null}
          {activeSection === "plans" ? <Plans snapshot={snapshot} /> : null}
          {activeSection === "billing" ? <Billing snapshot={snapshot} /> : null}
          {activeSection === "tenants" ? <Tenants snapshot={snapshot} /> : null}
          {activeSection === "users" ? <Users snapshot={snapshot} /> : null}
          {activeSection === "security" ? <Security snapshot={snapshot} /> : null}
          {activeSection === "release" ? <Release snapshot={snapshot} /> : null}
        </div>
      </section>
    </main>
  );
}
