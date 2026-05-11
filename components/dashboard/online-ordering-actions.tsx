"use client";

import { useMemo, useState } from "react";
import { Copy, Download, ExternalLink, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function OnlineOrderingActions({
  onlineUrl,
  restaurantName,
  qrSrc
}: {
  onlineUrl: string;
  restaurantName: string;
  qrSrc: string;
}) {
  const [copied, setCopied] = useState(false);
  const absoluteQrSrc = useMemo(() => {
    if (typeof window === "undefined") return qrSrc;
    return new URL(qrSrc, window.location.origin).toString();
  }, [qrSrc]);

  async function copyLink() {
    await navigator.clipboard.writeText(onlineUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function shareLink() {
    if (!navigator.share) {
      await copyLink();
      return;
    }

    await navigator.share({
      title: `${restaurantName} - Đặt món online`,
      text: `Đặt món online tại ${restaurantName}`,
      url: onlineUrl
    });
  }

  function printPoster() {
    const safeName = escapeHtml(restaurantName);
    const safeUrl = escapeHtml(onlineUrl);
    const safeQr = escapeHtml(absoluteQrSrc);
    const html = `<!doctype html>
      <html lang="vi">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>QR đặt món online - ${safeName}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background: #fff7eb;
              color: #2b2b2b;
              font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .poster {
              width: min(92vw, 420px);
              border: 1px solid rgba(15, 77, 58, 0.14);
              border-radius: 28px;
              background: #fff7eb;
              padding: 28px;
              text-align: center;
            }
            .logo { color: #0f4d3a; font-size: 22px; font-weight: 900; letter-spacing: -0.02em; }
            .logo span { color: #f28c28; }
            h1 { margin: 18px 0 10px; color: #0f4d3a; font-size: 38px; line-height: 1.02; }
            p { margin: 0; color: rgba(43, 43, 43, 0.72); font-size: 16px; font-weight: 700; }
            .qr {
              margin: 24px auto 18px;
              width: 280px;
              max-width: 100%;
              border: 10px solid white;
              border-radius: 24px;
              background: white;
            }
            .url {
              margin-top: 18px;
              border: 1px dashed #a9c5a1;
              border-radius: 16px;
              padding: 12px;
              color: #0f4d3a;
              font-size: 13px;
              overflow-wrap: anywhere;
            }
            .benefits {
              margin-top: 18px;
              display: flex;
              justify-content: center;
              gap: 10px;
              flex-wrap: wrap;
              color: #0f4d3a;
              font-weight: 800;
              font-size: 13px;
            }
            .dot { color: #f28c28; }
            @media print {
              body { background: white; }
              .poster { width: 100%; min-height: auto; border-radius: 0; border: 0; }
            }
          </style>
        </head>
        <body>
          <main class="poster">
            <div class="logo">Logi<span>VN</span></div>
            <h1>${safeName}</h1>
            <p>Quét QR để đặt món online</p>
            <img class="qr" src="${safeQr}" alt="QR đặt món online" />
            <div class="benefits">
              <span>Đến lấy</span><span class="dot">•</span><span>Giao hàng</span><span class="dot">•</span><span>Theo dõi đơn</span>
            </div>
            <div class="url">${safeUrl}</div>
          </main>
          <script>
            window.addEventListener("load", () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>`;
    const htmlUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const popup = window.open(htmlUrl, "_blank", "width=520,height=720");
    if (!popup) window.print();
    window.setTimeout(() => URL.revokeObjectURL(htmlUrl), 10_000);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={copyLink}>
        <Copy size={15} />
        {copied ? "Đã sao chép" : "Sao chép link"}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={shareLink}>
        <Share2 size={15} />
        Chia sẻ
      </Button>
      <a href={onlineUrl} target="_blank" rel="noreferrer">
        <Button type="button" size="sm" variant="secondary">
          <ExternalLink size={15} />
          Mở thử
        </Button>
      </a>
      <a href="/api/admin/online-qr?size=1200&download=1">
        <Button type="button" size="sm" variant="ghost">
          <Download size={15} />
          Tải QR
        </Button>
      </a>
      <Button type="button" size="sm" variant="ghost" onClick={printPoster}>
        <Printer size={15} />
        In poster
      </Button>
    </div>
  );
}
