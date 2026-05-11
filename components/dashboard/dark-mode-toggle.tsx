"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function DarkModeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "light";
    try {
      return localStorage.getItem("admin-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark-admin", theme === "dark");
  }, [theme]);

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark-admin", next === "dark");
    try {
      localStorage.setItem("admin-theme", next);
    } catch {}
  }, [theme]);

  return (
    <button
      type="button"
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/30 hover:text-[var(--primary)]"
      aria-label="Chuyển chế độ sáng/tối"
      onClick={toggle}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
