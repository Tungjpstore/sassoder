"use client";

export type LogiVNMarkerTone = "store" | "customer" | "courier" | "gps" | "branch";

const markerPalette: Record<LogiVNMarkerTone, { className: string; style: string }> = {
  store: {
    className: "grid h-9 w-9 place-items-center rounded-2xl border border-white/80 shadow-[0_14px_30px_rgba(15,77,58,0.24)]",
    style: "background:#0F4D3A;color:white;"
  },
  branch: {
    className: "grid h-9 w-9 place-items-center rounded-2xl border border-white/80 shadow-[0_14px_30px_rgba(15,77,58,0.22)]",
    style: "background:#145A40;color:white;"
  },
  customer: {
    className: "grid h-11 w-11 place-items-center rounded-[17px] border border-white/80 shadow-[0_18px_34px_rgba(201,111,23,0.25)]",
    style: "background:radial-gradient(circle at 30% 30%,rgba(242,140,40,0.98),rgba(201,111,23,0.96));color:white;"
  },
  courier: {
    className: "grid h-9 w-9 place-items-center rounded-2xl border border-white/80 shadow-[0_14px_30px_rgba(15,77,58,0.24)]",
    style: "background:#12251C;color:white;"
  },
  gps: {
    className: "grid h-10 w-10 place-items-center rounded-full border border-white/85 shadow-[0_16px_30px_rgba(15,77,58,0.22)]",
    style: "background:#2B8A6E;color:white;"
  }
};

function escapeMarkerLabel(label: string) {
  return label.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}

export function createLogiVNMarkerElement({
  label,
  tone,
  title
}: {
  label: string;
  tone: LogiVNMarkerTone;
  title?: string;
}) {
  const element = document.createElement("div");
  const palette = markerPalette[tone];
  element.className = palette.className;
  element.setAttribute("style", palette.style);
  if (title) element.setAttribute("title", title);
  element.innerHTML = `<span style="font-size:11px;font-weight:900;">${escapeMarkerLabel(label)}</span>`;
  return element;
}
