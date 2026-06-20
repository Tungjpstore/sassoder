export type ParsedMenuOcrItem = {
  name: string;
  price: number;
  description: string | null;
  tags: string[];
};

export type ParsedMenuOcrCategory = {
  name: string;
  items: ParsedMenuOcrItem[];
};

export type ParsedMenuOcrDraft = {
  categories: ParsedMenuOcrCategory[];
  warnings: string[];
  confidence: number;
};

const maxItems = 100;
const categoryKeywords = [
  "cafe",
  "coffee",
  "ca phe",
  "cà phê",
  "tra",
  "trà",
  "tea",
  "nuoc",
  "nước",
  "do uong",
  "đồ uống",
  "mon an",
  "món ăn",
  "food",
  "combo",
  "topping",
  "dessert",
  "banh",
  "bánh",
  "sinh to",
  "sinh tố",
  "smoothie",
  "juice",
  "an vat",
  "ăn vặt"
];

const ignoreLinePatterns = [
  /^menu$/i,
  /^thuc don$/i,
  /^thực đơn$/i,
  /hotline|phone|tel|zalo|facebook|instagram|wifi|password|dia chi|địa chỉ|address/i,
  /vat|tax|service charge|phi dich vu|phí dịch vụ|tong cong|tổng cộng|subtotal|total/i,
  /ngay|ngày|date|invoice|hoa don|hóa đơn|receipt/i
];

function normalizeText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[•·●▪■]/g, " ")
    .replace(/₫/g, "đ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMostlyNumeric(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (!compact) return false;
  const numericChars = compact.replace(/[^0-9.,kKdDvVnN]/g, "").length;
  return numericChars / compact.length > 0.75;
}

function shouldIgnoreLine(line: string) {
  const normalized = normalizeText(line);
  if (!normalized || normalized.length < 2) return true;
  return ignoreLinePatterns.some((pattern) => pattern.test(normalized));
}

export function parseMenuOcrPriceToken(value: string) {
  const token = value.trim().toLowerCase().replace(/vnd|vnđ|dong|dồng|đồng|d/g, "").trim();
  const compact = token.replace(/\s+/g, "");
  if (!compact) return 0;

  if (/^\d{1,3}k$/.test(compact)) return Number(compact.slice(0, -1)) * 1000;
  if (/^\d{1,3}[.,]\d$/.test(compact)) return Math.round(Number(compact.replace(",", ".")) * 1000);

  const digits = compact.replace(/[^0-9]/g, "");
  if (!digits) return 0;

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return 0;

  if (parsed >= 1000) return parsed;
  if (parsed >= 10 && parsed <= 999) return parsed * 1000;
  return 0;
}

function findTrailingPrice(line: string) {
  const normalized = normalizeText(line);
  const match = normalized.match(/^(.*?)(?:\s|:|-|_)+(\d{1,3}(?:[.,\s]\d{3})+|\d{4,8}|\d{1,3}[.,]\d|\d{1,3}\s*[kK])\s*(?:d|vnd)?$/i);
  if (!match) return null;
  const price = parseMenuOcrPriceToken(match[2] || "");
  const name = normalizeMenuItemName(match[1] || "");
  if (!name || price <= 0) return null;
  return { name, price };
}

function findStandalonePrice(line: string) {
  if (!isMostlyNumeric(line)) return 0;
  return parseMenuOcrPriceToken(line);
}

function normalizeMenuItemName(value: string) {
  return normalizeText(value)
    .replace(/^[-–—.:]+/, "")
    .replace(/[-–—.:]+$/, "")
    .replace(/\b(size|sz|s|m|l|xl)\b$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCategory(line: string) {
  const comparable = normalizeComparable(line);
  if (!comparable || comparable.length > 44) return false;
  if (findTrailingPrice(line) || findStandalonePrice(line) > 0) return false;
  const words = comparable.split(" ").filter(Boolean);
  const exactCategory = categoryKeywords.some((keyword) => comparable === normalizeComparable(keyword));
  const categoryPrefix = /^(nhom|group|danh muc|category)\b/.test(comparable);
  return exactCategory || categoryPrefix || (words.length <= 4 && line === line.toUpperCase());
}

function isLikelyItemName(line: string) {
  const normalized = normalizeMenuItemName(line);
  if (!normalized || normalized.length < 3 || normalized.length > 90) return false;
  if (shouldIgnoreLine(normalized) || isMostlyNumeric(normalized)) return false;
  return /[\p{L}]/u.test(normalized);
}

function createCategory(name: string): ParsedMenuOcrCategory {
  return { name: normalizeText(name) || "Menu", items: [] };
}

function addItem(category: ParsedMenuOcrCategory, item: ParsedMenuOcrItem, seen: Set<string>) {
  const key = `${normalizeComparable(item.name)}:${item.price}`;
  if (seen.has(key)) return;
  seen.add(key);
  category.items.push(item);
}

export function parseMenuOcrText(rawText: string): ParsedMenuOcrDraft {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeText)
    .filter((line) => line && !shouldIgnoreLine(line))
    .slice(0, 500);

  const categories: ParsedMenuOcrCategory[] = [createCategory("Menu")];
  const seen = new Set<string>();
  const pendingNames: string[] = [];

  for (const line of lines) {
    if (looksLikeCategory(line)) {
      const current = categories[categories.length - 1];
      if (current.items.length > 0 || current.name !== "Menu") categories.push(createCategory(line));
      else current.name = normalizeText(line);
      pendingNames.length = 0;
      continue;
    }

    const current = categories[categories.length - 1];
    const inline = findTrailingPrice(line);
    if (inline) {
      addItem(current, { name: inline.name, price: inline.price, description: null, tags: [] }, seen);
      pendingNames.length = 0;
      if (seen.size >= maxItems) break;
      continue;
    }

    const standalonePrice = findStandalonePrice(line);
    if (standalonePrice > 0 && pendingNames.length > 0) {
      const name = pendingNames.shift();
      if (name) addItem(current, { name, price: standalonePrice, description: null, tags: [] }, seen);
      if (seen.size >= maxItems) break;
      continue;
    }

    if (isLikelyItemName(line)) {
      pendingNames.push(normalizeMenuItemName(line));
      if (pendingNames.length > 8) pendingNames.shift();
    }
  }

  const populated = categories.filter((category) => category.items.length > 0).slice(0, 20);
  const itemCount = populated.reduce((sum, category) => sum + category.items.length, 0);

  return {
    categories: populated,
    warnings: itemCount > 0 ? ["Đã dùng parser cục bộ để tách món/giá từ OCR thô. Hãy rà lại tên món trước khi nhập."] : [],
    confidence: itemCount >= 5 ? 0.72 : itemCount > 0 ? 0.58 : 0.2
  };
}
