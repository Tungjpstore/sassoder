import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bot,
  Building2,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  CircleDot,
  CreditCard,
  Database,
  FileSliders,
  FileText,
  GitBranch,
  Globe2,
  KeyRound,
  LockKeyhole,
  LogOut,
  MapPinned,
  PackageCheck,
  RefreshCw,
  ServerCog,
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
  resolveBillingAnomalyAction,
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
type ActiveSection = "overview" | "site" | "content" | "plans" | "billing" | "tenants" | "users" | "ai" | "maps" | "atlas" | "ops" | "governance" | "security" | "release";
type Tenant = Snapshot["tenants"][number];
type Plan = Snapshot["plans"][number];
type BillingAnomaly = Snapshot["billingCutover"]["anomalies"][number];
type Integration = Snapshot["integrations"][number];
type ProjectSurface = Snapshot["projectAtlas"]["surfaces"][number];

const sections: Array<{ key: ActiveSection; label: string; href: string; icon: React.ElementType }> = [
  { key: "overview", label: "Tổng quan", href: "/admin", icon: SlidersHorizontal },
  { key: "site", label: "Website", href: "/admin/site", icon: FileSliders },
  { key: "content", label: "Content", href: "/admin/content", icon: FileText },
  { key: "plans", label: "Gói dịch vụ", href: "/admin/plans", icon: PackageCheck },
  { key: "billing", label: "Thanh toán gói", href: "/admin/billing", icon: CreditCard },
  { key: "tenants", label: "Cửa hàng", href: "/admin/tenants", icon: Store },
  { key: "users", label: "User", href: "/admin/users", icon: UsersRound },
  { key: "ai", label: "AI", href: "/admin/ai", icon: Bot },
  { key: "maps", label: "Maps", href: "/admin/maps", icon: MapPinned },
  { key: "atlas", label: "Atlas", href: "/admin/atlas", icon: Globe2 },
  { key: "ops", label: "Ops", href: "/admin/ops", icon: ServerCog },
  { key: "governance", label: "Governance", href: "/admin/governance", icon: ClipboardCheck },
  { key: "security", label: "Bảo mật", href: "/admin/security", icon: ShieldCheck },
  { key: "release", label: "Release", href: "/admin/release", icon: GitBranch }
];

const projectSurfaceKindLabel: Record<ProjectSurface["kind"], string> = {
  frontend: "Frontend",
  backend: "Backend",
  data: "Data",
  automation: "Automation",
  integration: "Integration"
};

const moduleStatusLabel: Record<string, string> = {
  live: "Đang chạy",
  configured: "Đã cấu hình",
  partial: "Một phần",
  static: "Code-managed",
  planned: "Đã lên kế hoạch",
  blocked: "Chưa mở",
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

const cutoverSourceLabel: Record<string, string> = {
  legacy: "Legacy fallback",
  mixed: "Mixed bridge",
  v2: "Billing v2"
};

const cutoverStatusLabel: Record<string, string> = {
  healthy: "Ổn định",
  partial: "Đang chuyển tiếp",
  needs_attention: "Cần xử lý"
};

function billingAnomalyActionLabel(anomaly: BillingAnomaly) {
  if (anomaly.key === "premium_trial_subscription") return "Đưa về trial Pro";
  if (anomaly.key === "pending_without_payment") return "Chuẩn hóa trạng thái";
  if (anomaly.key === "pending_payment_missing_policy") return "Bổ sung policy";
  return "Xử lý";
}

function canResolveBillingAnomaly(anomaly: BillingAnomaly) {
  if (anomaly.key === "pending_payment_missing_policy") return Boolean(anomaly.paymentId);
  return Boolean(anomaly.subscriptionId);
}

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
  if (status === "active" || status === "confirmed" || status === "live" || status === "configured" || status === "pass" || status === "success") return "good";
  if (status === "suspended" || status === "waiting_confirm" || status === "trialing" || status === "needs_review" || status === "partial" || status === "static" || status === "planned" || status === "warn") return "warning";
  if (status === "deleted" || status === "blocked" || status === "rejected" || status === "past_due") return "danger";
  if (status === "needs_config" || status === "pending_payment") return "info";
  if (status === "fail" || status === "failed" || status === "missing") return "danger";
  return "neutral";
}

function riskTone(risk: "low" | "medium" | "high") {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warning";
  return "good";
}

function criticalityTone(criticality: ProjectSurface["criticality"]) {
  if (criticality === "critical") return "danger";
  if (criticality === "high") return "warning";
  return "info";
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
        tone === "dark" && "bg-[var(--primary)] text-[#FFF7EB] hover:bg-[var(--primary-hover)]",
        tone === "orange" && "bg-[var(--accent)] text-[#FFF7EB] hover:bg-[var(--accent-hover)]",
        tone === "danger" && "bg-[var(--accent-strong)] text-[#FFF7EB] hover:bg-[var(--accent)]",
        tone === "soft" && "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--soft-surface)]"
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
                  active ? "bg-[var(--primary)] text-[#FFF7EB]" : "text-[var(--muted-foreground)] hover:bg-[var(--soft-surface)] hover:text-[var(--foreground)]"
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
      {snapshot.plans.map((plan: Plan) => (
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

      <SectionCard title="Billing v2 cutover health">
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Trạng thái</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={badgeTone(statusTone(snapshot.billingCutover.status === "healthy" ? "live" : snapshot.billingCutover.status === "partial" ? "needs_review" : "needs_config"))}>
                  {cutoverStatusLabel[snapshot.billingCutover.status]}
                </span>
                <span className={badgeTone(statusTone(snapshot.billingCutover.source === "v2" ? "live" : snapshot.billingCutover.source === "mixed" ? "needs_review" : "needs_config"))}>
                  {cutoverSourceLabel[snapshot.billingCutover.source]}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Màn này giúp nhìn nhanh coverage giữa legacy billing và billing v2 sau migration/backfill.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Legacy</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-3"><span>Subscriptions</span><strong>{formatNumber(snapshot.billingCutover.legacy.subscriptions)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Payments</span><strong>{formatNumber(snapshot.billingCutover.legacy.payments)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Pending</span><strong>{formatNumber(snapshot.billingCutover.legacy.pendingPayments)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>AI successes</span><strong>{formatNumber(snapshot.billingCutover.legacy.aiUsageSuccess)}</strong></div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Billing v2</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                <div className="flex items-center justify-between gap-3"><span>Plans</span><strong>{formatNumber(snapshot.billingCutover.v2.plans)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Entitlements</span><strong>{formatNumber(snapshot.billingCutover.v2.entitlements)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Subscriptions</span><strong>{formatNumber(snapshot.billingCutover.v2.subscriptions)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Invoices</span><strong>{formatNumber(snapshot.billingCutover.v2.invoices)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Payments</span><strong>{formatNumber(snapshot.billingCutover.v2.payments)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Payment logs</span><strong>{formatNumber(snapshot.billingCutover.v2.paymentLogs)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Usage quotas</span><strong>{formatNumber(snapshot.billingCutover.v2.usageQuotas)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Feature usage</span><strong>{formatNumber(snapshot.billingCutover.v2.featureUsageLogs)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Trial usage</span><strong>{formatNumber(snapshot.billingCutover.v2.trialUsage)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Upgrade events</span><strong>{formatNumber(snapshot.billingCutover.v2.upgradeEvents)}</strong></div>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            {snapshot.billingCutover.checks.map((check) => (
              <div key={check.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">{check.label}</p>
                  <span className={badgeTone(check.status === "pass" ? "good" : check.status === "warn" ? "warning" : "danger")}>
                    {check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{check.detail}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              CLI check: <code className="rounded bg-white px-1.5 py-0.5 text-slate-950">npm run billing:verify</code>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Billing anomalies cần xử lý">
        <div className="grid gap-3">
          {snapshot.billingCutover.anomalies.length ? (
            snapshot.billingCutover.anomalies.map((anomaly) => (
              <div key={`${anomaly.key}-${anomaly.subscriptionId ?? anomaly.paymentId ?? anomaly.restaurantId}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{anomaly.restaurantName}</p>
                    <p className="mt-1 text-xs text-slate-500">{anomaly.restaurantSlug}.logivn.com</p>
                  </div>
                  <span className={badgeTone(anomaly.severity === "danger" ? "danger" : "warning")}>
                    {anomaly.severity === "danger" ? "Cần xử lý gấp" : "Cần rà soát"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{anomaly.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  {anomaly.subscriptionId ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">subscription {anomaly.subscriptionId.slice(0, 8)}</span> : null}
                  {anomaly.paymentId ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">payment {anomaly.paymentId.slice(0, 8)}</span> : null}
                </div>
                {canResolveBillingAnomaly(anomaly) ? (
                  <form action={resolveBillingAnomalyAction} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs leading-5 text-slate-500">
                      <p className="font-semibold text-slate-700">Safe reconcile</p>
                      <p>Chỉ cập nhật trạng thái/metadata đã được guard server-side và ghi audit log.</p>
                    </div>
                    <input type="hidden" name="key" value={anomaly.key} />
                    {anomaly.subscriptionId ? <input type="hidden" name="subscriptionId" value={anomaly.subscriptionId} /> : null}
                    {anomaly.paymentId ? <input type="hidden" name="paymentId" value={anomaly.paymentId} /> : null}
                    <PrimaryButton tone={anomaly.severity === "danger" ? "orange" : "soft"}>
                      {billingAnomalyActionLabel(anomaly)}
                    </PrimaryButton>
                  </form>
                ) : (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                    Thiếu định danh để tự động xử lý. Cần rà soát thủ công bằng CLI audit.
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
              Chưa phát hiện anomaly billing rõ ràng trong snapshot hiện tại.
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Audit sâu hơn bằng CLI: <code className="rounded bg-white px-1.5 py-0.5 text-slate-950">npm run billing:audit</code>
          </div>
        </div>
      </SectionCard>

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

function ContentControl({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Surfaces" value={formatNumber(snapshot.contentSurfaces.length)} detail="Landing, pricing, blog, QR menu và SEO feed" icon={FileText} tone="info" />
        <MetricCard label="Blog posts" value={formatNumber(snapshot.contentSurfaces.find((item) => item.key === "blog")?.items ?? 0)} detail="Hiện là content-as-code, chưa có draft CMS" icon={Globe2} tone="warning" />
        <MetricCard label="Editable trực tiếp" value={formatNumber(snapshot.contentSurfaces.filter((item) => item.editable === "direct").length)} detail="Các vùng có server action an toàn trong /admin" icon={CheckCircle2} tone="good" />
      </div>

      <SectionCard title="Bề mặt public đang quản lý">
        <div className="grid gap-3">
          {snapshot.contentSurfaces.map((surface) => (
            <div key={surface.key} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950">{surface.name}</p>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">{surface.route}</span>
                    <span className={badgeTone(statusTone(surface.status))}>{moduleStatusLabel[surface.status] ?? surface.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{surface.note}</p>
                </div>
                <Link href={surface.route.startsWith("http") ? surface.route : surface.route} className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                  Mở trang
                </Link>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                <span>Nguồn: <strong className="text-slate-700">{surface.source}</strong></span>
                <span>Owner: <strong className="text-slate-700">{surface.owner}</strong></span>
                <span>Items: <strong className="text-slate-700">{surface.items}</strong></span>
                <span>Update: <strong className="text-slate-700">{surface.lastUpdated ?? "Theo deploy/data"}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Nâng cấp CMS an toàn">
        <div className="grid gap-2 md:grid-cols-3">
          {[
            ["Draft/Preview", "Mọi sửa landing/blog/pricing đi qua bản nháp và preview URL trước khi publish."],
            ["Publish/Rollback", "Lưu revision immutable để quay lại nội dung cũ nếu SEO hoặc conversion giảm."],
            ["Approval", "Blog, pricing và legal copy cần role Content/Owner duyệt, không sửa thẳng production."]
          ].map(([title, detail]) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">{title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function AiControl({ snapshot }: { snapshot: Snapshot }) {
  const aiIntegrations = snapshot.integrations.filter((item) => item.category === "ai");

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="AI requests 24h" value={formatNumber(snapshot.aiControl.requests)} detail={`${snapshot.aiControl.successRate}% success`} icon={Bot} tone={snapshot.aiControl.failures ? "warning" : "good"} />
        <MetricCard label="Tokens 24h" value={formatNumber(snapshot.aiControl.tokens)} detail={`${snapshot.aiControl.imageCount} image requests`} icon={Activity} tone="info" />
        <MetricCard label="Blocked/failed" value={formatNumber(snapshot.aiControl.blocked + snapshot.aiControl.failures)} detail="Theo ai_usage_logs gần nhất" icon={AlertTriangle} tone={snapshot.aiControl.blocked + snapshot.aiControl.failures ? "warning" : "neutral"} />
        <MetricCard label="Providers" value={formatNumber(aiIntegrations.filter((item) => item.status === "configured").length)} detail={`${aiIntegrations.length} provider groups tracked`} icon={KeyRound} tone="info" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="AI routing">
          <dl className="grid gap-3 text-sm">
            {[
              ["Owner provider", snapshot.aiControl.routing.ownerProvider],
              ["Customer provider", snapshot.aiControl.routing.customerProvider],
              ["Image provider", snapshot.aiControl.routing.imageProvider],
              ["Owner model", snapshot.aiControl.routing.ownerModel],
              ["Image model", snapshot.aiControl.routing.imageModel]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
                <dd className="mt-2 break-all font-mono text-sm text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="Provider usage 24h">
          <div className="grid gap-2">
            {snapshot.aiControl.providers.map((provider) => (
              <div key={provider.provider} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{provider.provider}</p>
                  <span className={badgeTone(provider.failureRate > 10 ? "warning" : "good")}>{provider.failureRate}% lỗi</span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                  <span>{provider.requests} requests</span>
                  <span>{formatNumber(provider.tokens)} tokens</span>
                  <span>{provider.models.join(", ") || "Chưa có model log"}</span>
                </div>
              </div>
            ))}
            {!snapshot.aiControl.providers.length ? <p className="text-sm text-slate-500">Chưa có AI usage log trong 24h gần nhất.</p> : null}
          </div>
        </SectionCard>
      </div>

      <IntegrationGrid title="AI secrets & config" integrations={aiIntegrations} />
    </div>
  );
}

function MapsControl({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Provider calls 24h" value={formatNumber(snapshot.mapControl.provider.requests)} detail={`${snapshot.mapControl.provider.failureRate}% lỗi`} icon={MapPinned} tone={snapshot.mapControl.provider.failureRate > 10 ? "warning" : "good"} />
        <MetricCard label="Map cost est." value={formatVnd(snapshot.mapControl.provider.estimatedCostVnd)} detail="Ước tính từ env cost accounting" icon={Banknote} tone="info" />
        <MetricCard label="Cache hit" value={`${snapshot.mapControl.cache.hitRate}%`} detail={`${snapshot.mapControl.cache.events} cache events`} icon={Database} tone="neutral" />
        <MetricCard label="Quote accept" value={`${snapshot.mapControl.quotes.acceptanceRate}%`} detail={`${snapshot.mapControl.quotes.requests} delivery quotes`} icon={CheckCircle2} tone="good" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SectionCard title="Maps routing config">
          <dl className="grid gap-3 text-sm">
            {[
              ["Geocoder", snapshot.mapControl.routing.geocoder],
              ["Geocoder fallback", snapshot.mapControl.routing.geocoderFallbacks],
              ["Router", snapshot.mapControl.routing.router],
              ["Router fallback", snapshot.mapControl.routing.routerFallbacks],
              ["Cache namespace", snapshot.mapControl.routing.cacheNamespace]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
                <dd className="mt-2 break-all font-mono text-sm text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="Provider breakdown 24h">
          <div className="grid gap-2">
            {snapshot.mapControl.provider.breakdown.map((provider) => (
              <div key={provider.provider} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{provider.provider}</p>
                  <span className={badgeTone(provider.failureRate > 10 ? "warning" : "good")}>{provider.failureRate}% lỗi</span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                  <span>{provider.requests} calls</span>
                  <span>{provider.failures} failures</span>
                  <span>{provider.avgLatencyMs}ms avg</span>
                  <span>{formatVnd(provider.estimatedCostVnd)}</span>
                </div>
              </div>
            ))}
            {!snapshot.mapControl.provider.breakdown.length ? <p className="text-sm text-slate-500">Chưa có map provider log trong 24h gần nhất.</p> : null}
          </div>
        </SectionCard>
      </div>

      <IntegrationGrid title="Maps integrations" integrations={snapshot.integrations.filter((item) => item.category === "maps" || item.key === "persistent-cache")} />
    </div>
  );
}

function OpsControl({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Integrations" value={formatNumber(snapshot.integrations.length)} detail={`${snapshot.integrations.filter((item) => item.status === "configured").length} configured`} icon={ServerCog} tone="info" />
        <MetricCard label="Cron jobs" value={formatNumber(snapshot.cronJobs.length)} detail={`${snapshot.cronJobs.filter((job) => job.status === "configured").length} có CRON_SECRET`} icon={Clock3} tone={snapshot.cronJobs.every((job) => job.status === "configured") ? "good" : "warning"} />
        <MetricCard label="Env warnings" value={formatNumber(snapshot.metrics.integrationWarnings)} detail="Thiếu hoặc mới cấu hình một phần" icon={AlertTriangle} tone={snapshot.metrics.integrationWarnings ? "warning" : "good"} />
        <MetricCard label="R2 readiness" value={snapshot.integrations.find((item) => item.key === "cloudflare-r2")?.status === "configured" ? "Ready" : "Planned"} detail="Không lưu raw secret trong DB" icon={LockKeyhole} tone="neutral" />
      </div>

      <SectionCard title="Cron jobs">
        <div className="grid gap-3 md:grid-cols-3">
          {snapshot.cronJobs.map((job) => (
            <div key={job.key} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{job.name}</p>
                <span className={badgeTone(statusTone(job.status))}>{moduleStatusLabel[job.status] ?? job.status}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{job.note}</p>
              <div className="mt-3 grid gap-1 font-mono text-xs text-slate-500">
                <span>{job.path}</span>
                <span>{job.schedule}</span>
                <span>Guard: {job.guard}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <IntegrationGrid title="Secrets, storage & runtime" integrations={snapshot.integrations.filter((item) => item.category !== "ai" && item.category !== "maps")} />
    </div>
  );
}

function ProjectAtlas({ snapshot }: { snapshot: Snapshot }) {
  const { summary, surfaces } = snapshot.projectAtlas;
  const surfaceKinds = (Object.keys(projectSurfaceKindLabel) as Array<ProjectSurface["kind"]>).map((kind) => ({
    kind,
    label: projectSurfaceKindLabel[kind],
    count: summary[kind],
    surfaces: surfaces.filter((surface) => surface.kind === kind)
  }));
  const controlGaps = surfaces.filter((surface) => surface.control !== "live");

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Project surfaces" value={formatNumber(summary.surfaces)} detail="Frontend, backend, data, automation, integrations" icon={Globe2} tone="info" />
        <MetricCard label="Critical surfaces" value={formatNumber(summary.critical)} detail="Luồng ảnh hưởng trực tiếp production" icon={AlertTriangle} tone="warning" />
        <MetricCard label="Observe live" value={`${summary.liveObserve}/${summary.surfaces}`} detail="Đã có dữ liệu quan sát trong /admin" icon={Activity} tone="good" />
        <MetricCard label="Control gaps" value={formatNumber(summary.plannedControl)} detail="Planned hoặc blocked, cần nâng cấp dần" icon={ClipboardCheck} tone={summary.plannedControl ? "warning" : "good"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Coverage by layer">
          <div className="grid gap-2">
            {surfaceKinds.map((group) => (
              <div key={group.kind} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">{group.label}</p>
                  <span className={badgeTone("info")}>{formatNumber(group.count)} surfaces</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {group.surfaces.map((surface) => surface.name).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Priority control gaps">
          <div className="grid gap-2">
            {controlGaps.slice(0, 6).map((surface) => (
              <div key={surface.key} className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{surface.name}</p>
                  <span className={badgeTone(statusTone(surface.control))}>{moduleStatusLabel[surface.control] ?? surface.control}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-orange-800">{surface.nextStep}</p>
              </div>
            ))}
            {!controlGaps.length ? <p className="text-sm text-slate-500">Tất cả surfaces đã có control live.</p> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Project surface map">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Surface</th>
                <th className="px-3 py-3">Layer / Owner</th>
                <th className="px-3 py-3">Routes & APIs</th>
                <th className="px-3 py-3">Dependencies</th>
                <th className="px-3 py-3">Observe / Control / Audit</th>
                <th className="px-3 py-3">Next step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {surfaces.map((surface) => (
                <tr key={surface.key} className="bg-white align-top">
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">{surface.name}</p>
                      <span className={badgeTone(statusTone(surface.status))}>{moduleStatusLabel[surface.status] ?? surface.status}</span>
                      <span className={badgeTone(criticalityTone(surface.criticality))}>{surface.criticality.toUpperCase()}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{surface.note}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-800">{projectSurfaceKindLabel[surface.kind]}</p>
                    <p className="mt-1 text-xs text-slate-500">{surface.owner}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {surface.routes.slice(0, 5).map((route) => (
                        <span key={route} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-500">
                          {route}
                        </span>
                      ))}
                      {surface.routes.length > 5 ? <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">+{surface.routes.length - 5}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {surface.dependencies.slice(0, 5).map((dependency) => (
                        <span key={dependency} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                          {dependency}
                        </span>
                      ))}
                      {surface.dependencies.length > 5 ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">+{surface.dependencies.length - 5}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="grid gap-1">
                      {[
                        ["Observe", surface.observe],
                        ["Control", surface.control],
                        ["Audit", surface.audit]
                      ].map(([label, state]) => (
                        <div key={`${surface.key}-${label}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                          <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                          <span className={badgeTone(statusTone(state))}>{moduleStatusLabel[state] ?? state}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{surface.nextStep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function GovernanceControl({ snapshot }: { snapshot: Snapshot }) {
  const summary = snapshot.governance.summary;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Capabilities" value={formatNumber(summary.capabilities)} detail={`${summary.liveObserve} vùng quan sát live`} icon={ClipboardCheck} tone="info" />
        <MetricCard label="Live mutations" value={formatNumber(summary.liveAdjust)} detail={`${summary.highRiskMutations} high-risk mutations đã map`} icon={ShieldCheck} tone="warning" />
        <MetricCard label="Rollback gaps" value={formatNumber(summary.partialOrPlannedRollback)} detail="Cần revision/approval để rollback sạch" icon={GitBranch} tone={summary.partialOrPlannedRollback ? "warning" : "good"} />
        <MetricCard label="RBAC roles" value={`${summary.rolesReady}/${summary.rolesReady + summary.rolesPlanned}`} detail="Runtime RBAC chưa bật" icon={UserRound} tone="warning" />
      </div>

      <SectionCard title="Capability matrix">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Vùng</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Observe</th>
                <th className="px-3 py-3">Adjust</th>
                <th className="px-3 py-3">Audit</th>
                <th className="px-3 py-3">Rollback</th>
                <th className="px-3 py-3">Next step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {snapshot.governance.capabilities.map((capability) => (
                <tr key={capability.key} className="bg-white align-top">
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={capability.section} className="font-semibold text-slate-950 hover:underline">{capability.name}</Link>
                      <span className={badgeTone(statusTone(capability.status))}>{moduleStatusLabel[capability.status] ?? capability.status}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{capability.note}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{capability.owner}</td>
                  {[capability.observe, capability.adjust, capability.audit, capability.rollback].map((state, index) => (
                    <td key={`${capability.key}-${index}`} className="px-3 py-3">
                      <span className={badgeTone(statusTone(state))}>{moduleStatusLabel[state] ?? state}</span>
                    </td>
                  ))}
                  <td className="px-3 py-3 text-slate-600">{capability.nextStep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="Mutation registry">
          <div className="grid gap-3">
            {snapshot.governance.mutations.map((mutation) => (
              <div key={mutation.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{mutation.name}</p>
                      <span className={badgeTone(riskTone(mutation.risk))}>{mutation.risk.toUpperCase()}</span>
                      <span className={badgeTone(statusTone(mutation.status))}>{moduleStatusLabel[mutation.status] ?? mutation.status}</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{mutation.key} · {mutation.surface}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-3">
                  <span><strong className="text-slate-800">Guard:</strong> {mutation.guard}</span>
                  <span><strong className="text-slate-800">Audit:</strong> {mutation.auditAction}</span>
                  <span><strong className="text-slate-800">Rollback:</strong> {mutation.rollback}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="RBAC readiness">
            <div className="grid gap-2">
              {snapshot.governance.roles.map((role) => (
                <div key={role.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">{role.role}</p>
                    <span className={badgeTone(statusTone(role.status))}>{moduleStatusLabel[role.status] ?? role.status}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{role.scope}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{role.note}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Production guardrails tiếp theo">
            <div className="grid gap-2 text-sm leading-6 text-slate-600">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-orange-800">
                High-risk billing, tenant và plan actions nên đi qua two-person approval trước khi mở rộng team.
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                Content/blog/pricing cần revision immutable để rollback trong vài giây thay vì khôi phục thủ công.
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                Support mode nên có reason, expiry, read-only mặc định và audit trước khi cho xem sâu tenant data.
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function IntegrationGrid({ title, integrations }: { title: string; integrations: Integration[] }) {
  return (
    <SectionCard title={title}>
      <div className="grid gap-3 lg:grid-cols-2">
        {integrations.map((integration) => (
          <div key={integration.key} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{integration.name}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{integration.category}</p>
              </div>
              <span className={badgeTone(statusTone(integration.status))}>{moduleStatusLabel[integration.status] ?? integration.status}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{integration.note}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{integration.secretHandling}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {integration.envNames.map((name) => (
                <span key={name} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-500">
                  {name}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Configured {integration.configured}/{integration.total}{integration.required ? " · required" : " · optional"}
            </p>
          </div>
        ))}
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
              <div key={item} className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--primary)] text-xs font-semibold text-[#FFF7EB]">{index + 1}</span>
                <p className="text-sm leading-6 text-[var(--muted-foreground)]">{item}</p>
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
              active ? "border-[var(--primary)] bg-[var(--primary)] text-[#FFF7EB]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
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
    <main className="stitch-admin min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar activeSection={activeSection} snapshot={snapshot} />
      <section className="lg:pl-[252px]">
        <Topbar activeSection={activeSection} snapshot={snapshot} />
        <MobileNav activeSection={activeSection} />
        <div className="mx-auto max-w-[1500px] px-4 py-4 lg:px-5">
          {activeSection === "overview" ? <Overview snapshot={snapshot} /> : null}
          {activeSection === "site" ? <SiteSettings snapshot={snapshot} /> : null}
          {activeSection === "content" ? <ContentControl snapshot={snapshot} /> : null}
          {activeSection === "plans" ? <Plans snapshot={snapshot} /> : null}
          {activeSection === "billing" ? <Billing snapshot={snapshot} /> : null}
          {activeSection === "tenants" ? <Tenants snapshot={snapshot} /> : null}
          {activeSection === "users" ? <Users snapshot={snapshot} /> : null}
          {activeSection === "ai" ? <AiControl snapshot={snapshot} /> : null}
          {activeSection === "maps" ? <MapsControl snapshot={snapshot} /> : null}
          {activeSection === "atlas" ? <ProjectAtlas snapshot={snapshot} /> : null}
          {activeSection === "ops" ? <OpsControl snapshot={snapshot} /> : null}
          {activeSection === "governance" ? <GovernanceControl snapshot={snapshot} /> : null}
          {activeSection === "security" ? <Security snapshot={snapshot} /> : null}
          {activeSection === "release" ? <Release snapshot={snapshot} /> : null}
        </div>
      </section>
    </main>
  );
}
