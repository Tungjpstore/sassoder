import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logoutAction} className={compact ? "h-11 w-11" : undefined}>
      <Button
        variant="secondary"
        size={compact ? "icon" : "md"}
        type="submit"
        aria-label={compact ? "Đăng xuất" : undefined}
        className={
          compact
            ? "h-11 w-11"
            : "w-full border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] shadow-none hover:bg-[var(--soft-surface)] hover:text-[var(--foreground)]"
        }
      >
        <LogOut size={16} />
        {!compact && "Đăng xuất"}
      </Button>
    </form>
  );
}
