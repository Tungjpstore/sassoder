"use client";

import { FileJson, FileSpreadsheet, Mail, Printer } from "lucide-react";
import { Button, ButtonLink } from "@/components/dashboard-v2/button";

export function AnalyticsExportActionsV2() {
  return (
    <div className="mb-[var(--d-s-4)] flex flex-wrap justify-end gap-2 print:hidden">
      <Button type="button" size="md" variant="secondary" onClick={() => window.print()}>
        <Printer size={16} />
        In / lưu PDF
      </Button>
      <ButtonLink href="/api/admin/reports/export" size="md" variant="primary">
        <FileSpreadsheet size={16} />
        Xuất CSV
      </ButtonLink>
      <ButtonLink href="/api/admin/reports/export?format=json" size="md" variant="secondary">
        <FileJson size={16} />
        Dữ liệu chi tiết
      </ButtonLink>
      <ButtonLink href="/dashboard/settings?section=notifications" size="md" variant="secondary">
        <Mail size={16} />
        Lịch gửi báo cáo
      </ButtonLink>
    </div>
  );
}
