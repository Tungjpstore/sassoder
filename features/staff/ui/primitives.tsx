/* HR UI Kit — primitives trình bày dùng chung cho admin + PWA.
 * Chỉ nhận giá trị thị giác từ token var(--d-*) và tông từ staff-view-model (Req 2). */
import type { ReactNode } from "react";
import { Badge } from "@/components/dashboard-v2/primitives";
import { cn } from "@/lib/utils";
import { staffToneSurfaceClass, type StaffDescriptor, type StaffTone } from "./staff-view-model";
import { StatusPill } from "./status-pill";

const TONE_TEXT: Record<StaffTone, string> = {
  jade: "text-[var(--d-primary)]",
  info: "text-[var(--d-info-fg)]",
  ok: "text-[var(--d-ok-fg)]",
  orange: "text-[var(--d-orange-600)]",
  danger: "text-[var(--d-danger-fg)]",
  neutral: "text-[var(--d-text-muted)]"
};

/** ShiftChip — một ca làm việc. */
export function ShiftChip({
  label,
  startTime,
  endTime,
  tone = "info"
}: {
  label: string;
  startTime: string;
  endTime: string;
  tone?: StaffTone;
  surface?: "admin" | "pwa";
}) {
  return (
    <span className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-[var(--d-r-md)] px-2.5 text-[length:var(--d-fs-xs)] font-semibold", staffToneSurfaceClass(tone))}>
      <span className="truncate">{label}</span>
      <span className="d-num opacity-80">{startTime}–{endTime}</span>
    </span>
  );
}

/** MetricStrip — dải chỉ số ngang (snapshot "Hôm nay"). */
export function MetricStrip({ items }: { items: { label: string; value: string; tone?: StaffTone }[] }) {
  return (
    <div className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-[var(--d-s-3)] py-2 shadow-[var(--d-sh-sm)]">
          <span className="block truncate text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{it.label}</span>
          <span className={cn("d-num block text-[length:var(--d-fs-h3)] font-bold leading-tight", TONE_TEXT[it.tone ?? "neutral"])}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

/** ListRow — hàng danh sách (thay bảng khi mobile). */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  const className = cn(
    "flex w-full min-h-[var(--d-touch-min)] items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2.5 text-left",
    interactive && "transition hover:border-[var(--d-line-strong)] hover:bg-[var(--d-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--d-jade)]"
  );
  const inner = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{title}</span>
        {subtitle ? <span className="block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );
  return interactive ? (
    <button type="button" onClick={onClick} className={className}>{inner}</button>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function initials(name: string) {
  return name.replace(/^(Anh|Chị|Em|Bà|Ông)\s*/i, "").trim().charAt(0).toUpperCase() || "?";
}

/** StaffIdentityCard — header định danh nhân viên (avatar + mã NV + vai trò + ca). */
export function StaffIdentityCard({
  fullName,
  employeeCode,
  role,
  shift,
  avatarUrl
}: {
  fullName: string;
  employeeCode: string | null;
  role: StaffDescriptor;
  shift?: StaffDescriptor;
  avatarUrl?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-3)]">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={fullName} className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--d-primary-soft)] text-[length:var(--d-fs-h3)] font-bold text-[var(--d-primary)]">{initials(fullName)}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[length:var(--d-fs-body)] font-bold text-[var(--d-text)]">{fullName}</p>
        <p className="d-num truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">{employeeCode ?? "Chưa cấp mã"}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusPill descriptor={role} />
          {shift ? <StatusPill descriptor={shift} /> : null}
        </div>
      </div>
    </div>
  );
}

/** ApprovalCard — một yêu cầu cần duyệt (dùng chung admin + PWA). */
export function ApprovalCard({
  descriptor,
  title,
  detail,
  createdAt,
  actions
}: {
  descriptor: StaffDescriptor;
  title: string;
  detail?: string;
  createdAt?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
      <span className="min-w-0 flex-1">
        <span className="truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusPill descriptor={descriptor} />
          <span className="truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {detail ? detail : ""}{createdAt ? `${detail ? " · " : ""}${createdAt}` : ""}
          </span>
        </span>
      </span>
      {actions ? <span className="flex shrink-0 gap-1.5">{actions}</span> : null}
    </div>
  );
}

/** FormField — trường nhập trình bày, đồng bộ với form admin/PWA. */
export function FormField({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  hint,
  maxLength
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="min-h-[var(--d-touch-min)] rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--d-jade)]"
      />
      {hint ? <span className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{hint}</span> : null}
    </label>
  );
}
