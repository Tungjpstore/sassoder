/**
 * Bộ phân tích nhập kho dùng chung cho UI (text / CSV / JSON → dòng nháp).
 * Tách riêng, thuần (không phụ thuộc React) để dùng lại ở workspace v2 và workbench.
 */

export type IntakeDraftRow = {
  name: string;
  unit: string;
  quantity: number;
  minimumQuantity: number;
  referenceUnitCost: number;
  categoryName?: string;
};

export function parseIntakeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return 0;
  const lastSeparator = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  if (lastSeparator > -1) {
    const integerPart = cleaned.slice(0, lastSeparator).replace(/[.,]/g, "");
    const decimalPart = cleaned.slice(lastSeparator + 1);
    const normalized = decimalPart.length === 3 && integerPart ? `${integerPart}${decimalPart}` : `${integerPart}.${decimalPart}`;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeIntakeUnit(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll("lít", "l")
    .replaceAll("lit", "l");
  // Bản đồ đơn vị tiếng Việt -> ASCII-safe (khớp regex backend [a-zA-Z0-9_%/ .-]).
  const viToAscii: Record<string, string> = {
    gói: "goi",
    hộp: "hop",
    cái: "cai",
    chai: "chai",
    lon: "lon",
    thùng: "thung",
    bao: "bao",
    phần: "phan",
    suất: "suat",
    gram: "g"
  };
  for (const [vi, ascii] of Object.entries(viToAscii)) {
    if (normalized.includes(vi)) return ascii;
  }
  const match = normalized.match(/\b(kg|g|ml|l|chai|lon|goi|hop|cai|thung|bao|phan|suat|unit)\b/);
  if (match?.[1]) return match[1];
  // Loại bỏ dấu tiếng Việt và ký tự lạ để luôn hợp lệ với backend.
  const ascii = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-zA-Z0-9_%/ .-]/g, "")
    .trim()
    .slice(0, 24);
  return ascii || "unit";
}

function pickText(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function rowFromObject(source: Record<string, unknown>): IntakeDraftRow | null {
  const name = pickText(source, ["name", "ten", "ingredient", "nguyenLieu", "nguyen_lieu"]);
  if (!name) return null;
  return {
    name,
    unit: normalizeIntakeUnit(pickText(source, ["unit", "donVi", "don_vi", "uom"]) || "unit"),
    quantity: parseIntakeNumber(source.quantity ?? source.qty ?? source.soLuong ?? source.so_luong ?? source.onHandQuantity),
    minimumQuantity: parseIntakeNumber(source.minimumQuantity ?? source.min ?? source.toiThieu ?? source.toi_thieu),
    referenceUnitCost: Math.round(parseIntakeNumber(source.referenceUnitCost ?? source.unitCost ?? source.giaVon ?? source.gia_von ?? source.cost)),
    categoryName: pickText(source, ["categoryName", "category", "nhom", "nhomHang", "nhom_hang"]) || undefined
  };
}

function parseTextLine(line: string): IntakeDraftRow | null {
  const cleaned = line.trim();
  if (!cleaned || /^(name|ten|nguyen|ingredient)[,\t|;]/i.test(cleaned)) return null;
  const parts = cleaned.split(/[,\t|;]/).map((part) => part.trim()).filter(Boolean);
  const numbers = cleaned.match(/\d[\d.,]*/g)?.map(parseIntakeNumber).filter((value) => value > 0) ?? [];
  const categoryMatch = cleaned.match(/(?:nhóm|nhom|category)\s*:?\s*([^,|;]+)/i);
  const unit = normalizeIntakeUnit(parts.find((part) => /\b(kg|g|gram|ml|l|lit|lít|chai|lon|goi|gói|hop|hộp|cai|cái)\b/i.test(part)) ?? cleaned);
  const name = (parts[0] ?? cleaned.replace(/\d[\d.,]*/g, "").trim()).replace(/(?:nhóm|nhom|category)\s*:?.*$/i, "").trim();
  if (!name || numbers.length === 0) return null;
  return {
    name,
    unit,
    quantity: numbers[0] ?? 0,
    minimumQuantity: /min|tối thiểu|toi thieu/i.test(cleaned) ? numbers[1] ?? 0 : 0,
    referenceUnitCost: Math.round(/giá|gia|cost|vnd|đ/i.test(cleaned) ? numbers[numbers.length - 1] ?? 0 : numbers[1] ?? 0),
    categoryName: categoryMatch?.[1]?.trim()
  };
}

/** Phân tích văn bản tự do / CSV / JSON thành danh sách dòng nhập kho nháp. */
export function parseInventoryDraft(raw: string): IntakeDraftRow[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: unknown[] }).items
        : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { rows?: unknown[] }).rows)
          ? (parsed as { rows: unknown[] }).rows
          : [];
    return rows
      .map((row) => (typeof row === "object" && row !== null ? rowFromObject(row as Record<string, unknown>) : null))
      .filter((row): row is IntakeDraftRow => Boolean(row));
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map(parseTextLine)
      .filter((row): row is IntakeDraftRow => Boolean(row));
  }
}
