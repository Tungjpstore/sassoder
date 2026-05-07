"use client";

import { Moon, Sun } from "lucide-react";

export function DarkModeToggle() {
  return (
    <button
      type="button"
      className="hidden h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--muted-foreground)] transition hover:bg-[var(--soft-surface)] md:inline-flex"
      aria-label="Chuyển chế độ sáng/tối"
      onClick={() => {
        const root = document.documentElement;
        const isDark = root.classList.contains("dark-admin");
        root.classList.toggle("dark-admin", !isDark);
        try {
          localStorage.setItem("admin-theme", isDark ? "light" : "dark");
        } catch {}
      }}
    >
      <Moon size={16} />
    </button>
  );
}
