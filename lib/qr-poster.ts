/* qr-poster — utility xây template QR đẹp tái dùng cho cả v1 và v2.
 *  - tableQrUrl(slug, table): build URL public của bàn
 *  - qrImageUrl(url, size): URL ảnh QR từ qrserver.com
 *  - getPosterTitleLayout(name): tính layout title đa dòng
 *  - buildQrPosterSvg({...}): SVG poster A4 đầy đủ
 *  - printSvgPosters(svgs, title): mở popup in nhiều poster
 */

import { buildTenantUrl } from "./tenant-domain";

export const POSTER_LOGO_URL = "/brand/logivn/logo-horizontal-transparent.png";
const POSTER_TITLE_MAX_LINES = 3;

export type PosterTable = { id: string; name: string; qr_token?: string | null };

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export function filenameSafe(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "qr-ban";
}

function charLength(value: string) {
  return Array.from(value).length;
}

function normalizePosterTitle(value: string) {
  return value.trim().replace(/\s+/g, " ") || "LogiVN";
}

function chunkLongWord(word: string, size: number) {
  const chars = Array.from(word);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += size) {
    chunks.push(chars.slice(index, index + size).join(""));
  }
  return chunks;
}

function titleWords(value: string) {
  return normalizePosterTitle(value)
    .split(" ")
    .flatMap((word) => (charLength(word) > 24 ? chunkLongWord(word, 18) : [word]));
}

function balanceTitleLines(words: string[], lineCount: number) {
  if (lineCount <= 1 || words.length <= 1) return [words.join(" ")];
  const target = Math.ceil(words.reduce((total, word) => total + charLength(word), 0) / lineCount);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && charLength(next) > target && lines.length < lineCount - 1) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  while (lines.length > lineCount) {
    const tail = lines.pop();
    if (!tail) break;
    lines[lines.length - 1] = `${lines[lines.length - 1]} ${tail}`;
  }
  return lines;
}

export function getPosterTitleLayout(value: string) {
  const words = titleWords(value);
  const totalLength = charLength(words.join(" "));
  const requestedLines = totalLength <= 18 ? 1 : totalLength <= 40 ? 2 : POSTER_TITLE_MAX_LINES;
  const lines = balanceTitleLines(words, Math.min(requestedLines, POSTER_TITLE_MAX_LINES));
  const longestLine = Math.max(...lines.map(charLength), 1);
  const maxFontSize = lines.length === 1 ? 64 : lines.length === 2 ? 48 : 38;
  const minFontSize = lines.length === 1 ? 42 : lines.length === 2 ? 34 : 28;
  const fittedFontSize = Math.floor(580 / (longestLine * 0.56));
  const fontSize = Math.max(minFontSize, Math.min(maxFontSize, fittedFontSize));
  const lineGap = Math.round(fontSize * (lines.length === 3 ? 1.13 : 1.16));
  const blockHeight = fontSize + (lines.length - 1) * lineGap;
  const titleStartY = Math.round(360 - blockHeight / 2 + fontSize * 0.78);
  return { lines, fontSize, lineGap, titleStartY };
}

export function qrImageUrl(targetUrl: string, size = 520) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(targetUrl)}`;
}

export function tableQrUrl(restaurantSlug: string, table: PosterTable) {
  const url = buildTenantUrl(restaurantSlug, `/table/${table.id}`);
  if (!table.qr_token) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("t", table.qr_token);
  return parsed.toString();
}

export function buildQrPosterSvg({
  restaurantName,
  tableName,
  qrDataUrl,
  logoDataUrl
}: {
  restaurantName: string;
  tableName: string;
  qrDataUrl: string;
  logoDataUrl: string;
}) {
  const tableNumber = tableName.match(/\d+/)?.[0]?.padStart(2, "0") ?? tableName.slice(0, 8).toUpperCase();
  const titleLayout = getPosterTitleLayout(restaurantName);
  const titleMarkup = titleLayout.lines
    .map((line, index) => `<tspan x="400" dy="${index === 0 ? 0 : titleLayout.lineGap}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 800 1120">
  <defs>
    <linearGradient id="ivory" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fffaf1"/>
      <stop offset="1" stop-color="#fff2df"/>
    </linearGradient>
    <filter id="softShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0F4D3A" flood-opacity=".14"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="800" height="1120" rx="36" fill="url(#ivory)"/>
  <rect x="30" y="30" width="740" height="1060" rx="30" fill="#fffaf1" stroke="#0F4D3A" stroke-width="5"/>
  <rect x="58" y="58" width="684" height="1004" rx="20" fill="none" stroke="#0F4D3A" stroke-opacity=".18" stroke-width="2"/>
  <path d="M58 214H742" stroke="#0F4D3A" stroke-opacity=".2" stroke-width="2"/>
  <path d="M58 942H742" stroke="#0F4D3A" stroke-opacity=".2" stroke-width="2"/>
  <image href="${logoDataUrl}" x="150" y="88" width="500" height="96" preserveAspectRatio="xMidYMid meet"/>
  <text x="400" y="230" text-anchor="middle" font-size="21" font-weight="900" fill="#F28C28" font-family="Arial, Helvetica, sans-serif">SCAN ĐỂ GỌI MÓN TẠI BÀN</text>
  <rect x="92" y="260" width="616" height="200" rx="22" fill="#ffffff" stroke="#0F4D3A" stroke-width="4"/>
  <text x="400" y="${titleLayout.titleStartY}" text-anchor="middle" font-size="${titleLayout.fontSize}" font-weight="900" fill="#0F4D3A" font-family="Arial, Helvetica, sans-serif">${titleMarkup}</text>
  <text x="400" y="502" text-anchor="middle" font-size="25" font-weight="800" fill="#0F4D3A" font-family="Arial, Helvetica, sans-serif">Quét mã để xem menu &amp; gửi order cho quán</text>
  <rect x="190" y="534" width="420" height="420" rx="24" fill="#ffffff" stroke="#0F4D3A" stroke-width="7" filter="url(#softShadow)"/>
  <rect x="216" y="560" width="368" height="368" rx="14" fill="#ffffff" stroke="#F28C28" stroke-width="3" stroke-dasharray="10 10"/>
  <image href="${qrDataUrl}" x="236" y="580" width="328" height="328" preserveAspectRatio="xMidYMid meet"/>
  <rect x="92" y="972" width="616" height="88" rx="20" fill="#0F4D3A"/>
  <text x="176" y="1027" text-anchor="start" font-size="25" font-weight="900" fill="#FFF7EB" font-family="Arial, Helvetica, sans-serif">BÀN</text>
  <text x="400" y="1035" text-anchor="middle" font-size="72" font-weight="900" fill="#F28C28" font-family="Arial, Helvetica, sans-serif">${escapeXml(tableNumber)}</text>
  <text x="624" y="1012" text-anchor="end" font-size="18" font-weight="800" fill="#FFF7EB" font-family="Arial, Helvetica, sans-serif">Gọi món nhanh</text>
  <text x="624" y="1039" text-anchor="end" font-size="18" font-weight="800" fill="#FFF7EB" font-family="Arial, Helvetica, sans-serif">Thanh toán tiện lợi</text>
</svg>`;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchAssetDataUrl(url: string) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Không tải được tài nguyên: ${url}`);
  return readBlobAsDataUrl(await response.blob());
}

/* buildPosterSvgForTable — fetch QR + logo về dạng dataUrl rồi trả SVG đầy đủ. */
export async function buildPosterSvgForTable({
  restaurantName,
  restaurantSlug,
  table
}: {
  restaurantName: string;
  restaurantSlug: string;
  table: PosterTable;
}) {
  const url = tableQrUrl(restaurantSlug, table);
  const [qrDataUrl, logoDataUrl] = await Promise.all([
    fetchAssetDataUrl(qrImageUrl(url, 520)),
    fetchAssetDataUrl(POSTER_LOGO_URL)
  ]);
  return buildQrPosterSvg({ restaurantName, tableName: table.name, qrDataUrl, logoDataUrl });
}

export function printSvgPosters(svgPosters: string[], title: string) {
  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff7eb; font-family: Arial, Helvetica, sans-serif; }
    main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10mm; align-items: start; }
    .poster { break-inside: avoid; page-break-inside: avoid; width: 100%; }
    .poster svg { display: block; width: 100%; height: auto; }
    @media print {
      body { background: #fff7eb; }
      main { gap: 8mm; }
    }
  </style>
</head>
<body>
  <main>${svgPosters.map((svg) => `<section class="poster">${svg}</section>`).join("")}</main>
  <script>
    window.onload = () => {
      window.focus();
      setTimeout(() => window.print(), 250);
    };
  </script>
</body>
</html>`;
  const htmlUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const printWindow = window.open(htmlUrl, "_blank", "width=980,height=900");
  if (!printWindow) {
    URL.revokeObjectURL(htmlUrl);
    if (typeof window.alert === "function") window.alert("Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup để in template QR.");
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(htmlUrl), 10_000);
}

export async function downloadQrPosterPng({
  restaurantName,
  restaurantSlug,
  table
}: {
  restaurantName: string;
  restaurantSlug: string;
  table: PosterTable;
}) {
  const svg = await buildPosterSvgForTable({ restaurantName, restaurantSlug, table });
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Không tạo được ảnh từ template QR."));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1680;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Trình duyệt không hỗ trợ tạo ảnh.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const link = document.createElement("a");
    link.download = `qr-${filenameSafe(restaurantName)}-${filenameSafe(table.name)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
