"use client";

/* PermissionMatrix — ma trận quyền theo nhóm, dùng chung (admin chỉnh, PWA read-only). */
import { cn } from "@/lib/utils";
import { isDangerPermission, staffPermissionLabel, type StaffPermissionGroup, type StaffPermissionKey } from "@/lib/staff-permissions";

export function PermissionMatrix({
  groups,
  granted,
  onToggle,
  readOnly = false
}: {
  groups: StaffPermissionGroup[];
  granted: Set<string>;
  onToggle?: (key: StaffPermissionKey) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[var(--d-s-3)]">
      {groups.map((group) => (
        <section key={group.key} className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-3)]">
          <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{group.title}</p>
          <p className="mt-0.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{group.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.permissions.map((perm) => {
              const on = granted.has(perm);
              const danger = isDangerPermission(perm);
              return (
                <button
                  key={perm}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onToggle?.(perm)}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-[var(--d-r-pill)] border px-3 text-[length:var(--d-fs-xs)] font-semibold transition",
                    readOnly ? "cursor-default" : "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--d-jade)]",
                    on
                      ? danger
                        ? "border-[var(--d-orange)]/40 bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]"
                        : "border-[var(--d-jade)]/40 bg-[var(--d-primary-soft)] text-[var(--d-primary)]"
                      : "border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-faint)]"
                  )}
                >
                  {staffPermissionLabel(perm)}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
