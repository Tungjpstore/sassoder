"use client";

import { FileJson, FileSpreadsheet, Mail, Printer } from "lucide-react";

export function AnalyticsExportActions() {
  return (
    <div className="dashboard-analytics-actions mb-4 flex flex-wrap justify-end gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]"
      >
        <Printer size={17} />
        In / lưu PDF
      </button>
      <a
        href="/api/admin/reports/export"
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white"
      >
        <FileSpreadsheet size={17} />
        Xuất CSV
      </a>
      <a
        href="/api/admin/reports/export?format=json"
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]"
      >
        <FileJson size={17} />
        Xuất dữ liệu chi tiết
      </a>
      <a
        href="/dashboard/settings?section=notifications"
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]"
      >
        <Mail size={17} />
        Lịch gửi báo cáo
      </a>
    </div>
  );
}
