"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function DarkModeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("admin-theme");
      if (stored === "light") {
        setTheme("light");
        document.documentElement.classList.add("admin-light-mode");
      }
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("admin-light-mode", next === "light");
    try {
      localStorage.setItem("admin-theme", next);
    } catch {}
  }, [theme]);

  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[rgba(52,211,153,0.2)] hover:text-[var(--primary)]"
      aria-label="Chuyển chế độ sáng/tối"
      onClick={toggle}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
