"use client";

import { useState } from "react";
import { Copy, ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TableQrActions({ tableUrl }: { tableUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(tableUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
        <Copy size={15} />
        {copied ? "Đã sao chép" : "Sao chép"}
      </Button>
      <a href={tableUrl} target="_blank" rel="noreferrer">
        <Button type="button" variant="secondary" size="sm">
          <ExternalLink size={15} />
          Mở thử
        </Button>
      </a>
      <Button type="button" variant="ghost" size="sm" onClick={() => window.print()}>
        <Printer size={15} />
        In
      </Button>
    </div>
  );
}
