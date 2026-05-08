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
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-bold",
        tone === "neutral" && "border-[var(--border)] bg-[var(--surface-container-high)] text-[var(--muted-foreground)]",
        tone === "green" && "border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.1)] text-[var(--primary)]",
        tone === "yellow" && "border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.1)] text-[var(--accent)]",
        tone === "blue" && "border-[rgba(96,165,250,0.25)] bg-[rgba(96,165,250,0.1)] text-[#60A5FA]",
        tone === "red" && "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.1)] text-[#FB7185]"
      )}
    >
      {children}
    </span>
  );
}
