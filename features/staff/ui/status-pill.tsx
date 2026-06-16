/* StatusPill — chip trạng thái nhân sự DÙNG CHUNG (admin + PWA).
 * Lấy nhãn/tông/icon từ staff-view-model để 2 surface luôn đồng bộ.
 */

import { cn } from "@/lib/utils";
import { staffToneSurfaceClass, type StaffDescriptor } from "./staff-view-model";

export function StatusPill({
  descriptor,
  size = "sm",
  showIcon = true,
  className
}: {
  descriptor: StaffDescriptor;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}) {
  const Icon = descriptor.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--d-r-pill)] font-semibold leading-none",
        size === "sm" ? "px-2 py-1 text-[length:var(--d-fs-2xs)]" : "px-2.5 py-1.5 text-[length:var(--d-fs-xs)]",
        staffToneSurfaceClass(descriptor.tone),
        className
      )}
    >
      {showIcon && Icon ? <Icon size={size === "sm" ? 11 : 13} aria-hidden="true" /> : null}
      <span className="truncate">{descriptor.label}</span>
    </span>
  );
}
