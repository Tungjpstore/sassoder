import { cn } from "@/lib/utils";

export function UsageBar({
  value,
  className
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("h-2.5 overflow-hidden rounded-full bg-[var(--soft-surface)]", className)}>
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#0F4D3A_0%,#1A6B52_55%,#F28C28_100%)] transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
