import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "yellow" | "blue" | "red";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold",
        tone === "neutral" && "border-[var(--border)] bg-[var(--surface-container-high)] text-[var(--muted-foreground)]",
        tone === "green" && "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]",
        tone === "yellow" && "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]",
        tone === "blue" && "border-[var(--secondary)]/30 bg-[var(--secondary-soft)] text-[var(--primary)]",
        tone === "red" && "border-[var(--tertiary)]/12 bg-[var(--danger-soft)] text-[var(--tertiary)]"
      )}
    >
      {children}
    </span>
  );
}
