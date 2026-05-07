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
        tone === "neutral" && "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted-foreground)]",
        tone === "green" && "border-[var(--primary-soft-strong)] bg-[var(--primary-soft)] text-[var(--primary-strong)] dark:text-[var(--foreground)]",
        tone === "yellow" && "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--accent-strong)] dark:text-[var(--foreground)]",
        tone === "blue" && "border-[var(--secondary)] bg-[var(--secondary-soft)] text-[var(--primary-strong)] dark:text-[var(--foreground)]",
        tone === "red" && "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--accent-strong)] dark:text-[var(--foreground)]"
      )}
    >
      {children}
    </span>
  );
}
