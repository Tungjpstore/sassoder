import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TrialUsedOverlay({
  title,
  onUpgrade
}: {
  title: string;
  onUpgrade?: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[2] flex items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,rgba(255,252,246,0.72),rgba(255,247,235,0.92))] p-4 text-center backdrop-blur-sm">
      <div className="max-w-sm">
        <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          <Sparkles size={18} />
        </span>
        <h3 className="mt-3 text-base font-semibold text-[var(--foreground)]">Bạn đã dùng thử tính năng này</h3>
        <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted-foreground)]">{title}</p>
        {onUpgrade ? (
          <Button className="mt-4" onClick={onUpgrade}>
            Nâng cấp Premium
          </Button>
        ) : null}
      </div>
    </div>
  );
}
