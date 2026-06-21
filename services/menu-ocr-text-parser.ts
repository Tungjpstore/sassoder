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

export type ParseMenuOcrTextOptions = {
  existingCategoryNames?: string[];
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
  /hotline|phone|tel|zalo|facebook|instagram|wifi|password|dia chi|địa chỉ|address|website|gmail|email|fanpage/i,
  /vat|tax|service charge|phi dich vu|phí dịch vụ|tong cong|tổng cộng|subtotal|total/i,
  /ngay|ngày|date|invoice|hoa don|hóa đơn|receipt/i,
  /scan|ocr|textract|google vision|mimo|model|provider/i
];

const priceTokenPattern = String.raw`\d{1,3}(?:[.,\s]\d{3})+|\d{4,8}|\d{1,3}[.,]\d|\d{1,3}\s*[kK]`;
const inlineItemPattern = new RegExp(String.raw`(.+?)(?:\s|:|-|_)+(?:(${priceTokenPattern})\s*(?:đ|d|vnd)?)(?=\s+\d{1,3}\s+\p{L}|\s+\p{L}|$)`, "giu");

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
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textQualityScore(value: string) {
  const normalized = normalizeText(value);
  const markCount = (normalized.normalize("NFD").match(/[\u0300-\u036f]/g) ?? []).length;
  const vietnameseDCount = (normalized.match(/[đĐ]/g) ?? []).length;
  const letterCount = (normalized.match(/[\p{L}]/gu) ?? []).length;
  const lowerCaseWordShape = /[a-zà-ỹđ]/u.test(normalized) ? 1 : 0;
  return markCount * 3 + vietnameseDCount * 3 + lowerCaseWordShape + Math.min(12, letterCount) / 20;
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
  const name = normalizeMenuOcrItemName(match[1] || "");
  if (!name || price <= 0) return null;
  return { name, price };
}

function findStandalonePrice(line: string) {
  if (!isMostlyNumeric(line)) return 0;
  return parseMenuOcrPriceToken(line);
}

export function normalizeMenuOcrItemName(value: string) {
  return normalizeText(value)
    .replace(/^\s*\d{1,3}\s*[.)\]:-]\s*/u, "")
    .replace(/^\s*\d{2,3}\s+(?=\p{L})/u, "")
    .replace(/^\s*\d{1,2}\s+(?=\p{L}{3,}\s|\p{Lu}\p{Ll}{2,})/u, "")
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

function categoryHints(options?: ParseMenuOcrTextOptions) {
  return (options?.existingCategoryNames ?? []).map(normalizeText).filter(Boolean).slice(0, 80);
}

function resolveCategoryName(name: string, existingCategoryNames: string[]) {
  const normalized = normalizeText(name) || "Menu";
  if (existingCategoryNames.length === 0) return normalized;

  const comparable = normalizeComparable(normalized);
  const exact = existingCategoryNames.find((category) => normalizeComparable(category) === comparable);
  if (exact) return exact;

  const tokens = new Set(comparable.split(" ").filter((token) => token.length > 1));
  let best: { name: string; score: number } | null = null;
  for (const category of existingCategoryNames) {
    const categoryTokens = new Set(normalizeComparable(category).split(" ").filter((token) => token.length > 1));
    if (tokens.size === 0 || categoryTokens.size === 0) continue;
    const overlap = [...tokens].filter((token) => categoryTokens.has(token)).length;
    const score = overlap / Math.min(tokens.size, categoryTokens.size);
    if (score >= 0.5 && (!best || score > best.score)) best = { name: category, score };
  }

  return best?.name ?? normalized;
}

function isLikelyItemName(line: string) {
  const normalized = normalizeMenuOcrItemName(line);
  if (!normalized || normalized.length < 3 || normalized.length > 90) return false;
  if (shouldIgnoreLine(normalized) || isMostlyNumeric(normalized)) return false;
  return /[\p{L}]/u.test(normalized);
}

function createCategory(name: string, existingCategoryNames: string[] = []): ParsedMenuOcrCategory {
  return { name: resolveCategoryName(name, existingCategoryNames), items: [] };
}

function addItem(category: ParsedMenuOcrCategory, item: ParsedMenuOcrItem, seen: Set<string>) {
  const nameKey = normalizeComparable(item.name);
  const key = nameKey;
  if (seen.has(key)) {
    const existingIndex = category.items.findIndex((existing) => normalizeComparable(existing.name) === key);
    if (existingIndex >= 0) {
      const existing = category.items[existingIndex];
      const betterName = textQualityScore(item.name) > textQualityScore(existing.name) ? item.name : existing.name;
      const betterPrice = Math.min(existing.price, item.price);
      category.items[existingIndex] = { ...existing, ...item, name: betterName, price: betterPrice };
    }
    return;
  }
  seen.add(key);
  category.items.push(item);
}

export function refineMenuOcrDraft(draft: ParsedMenuOcrDraft, options: ParseMenuOcrTextOptions = {}): ParsedMenuOcrDraft {
  const existingCategoryNames = categoryHints(options);
  const categories: ParsedMenuOcrCategory[] = [];
  const categoryByName = new Map<string, ParsedMenuOcrCategory>();
  const itemByName = new Map<string, { category: ParsedMenuOcrCategory; index: number; item: ParsedMenuOcrItem }>();

  for (const rawCategory of draft.categories) {
    const categoryName = resolveCategoryName(rawCategory.name, existingCategoryNames);
    const categoryKey = normalizeComparable(categoryName) || "menu";
    let category = categoryByName.get(categoryKey);
    if (!category) {
      category = { name: categoryName, items: [] };
      categoryByName.set(categoryKey, category);
      categories.push(category);
    }

    for (const rawItem of rawCategory.items) {
      const name = normalizeMenuOcrItemName(rawItem.name);
      const price = Math.round(Number(rawItem.price));
      if (!name || !Number.isFinite(price) || price < 1000) continue;
      const item = { ...rawItem, name, price };
      const itemKey = normalizeComparable(name);
      const existing = itemByName.get(itemKey);
      if (existing) {
        const betterName = textQualityScore(item.name) > textQualityScore(existing.item.name) ? item.name : existing.item.name;
        const merged = { ...existing.item, ...item, name: betterName, price: Math.min(existing.item.price, item.price) };
        existing.category.items[existing.index] = merged;
        itemByName.set(itemKey, { category: existing.category, index: existing.index, item: merged });
        continue;
      }

      category.items.push(item);
      itemByName.set(itemKey, { category, index: category.items.length - 1, item });
    }
  }

  const populated = categories.map((category) => ({ ...category, items: category.items.slice(0, maxItems) })).filter((category) => category.items.length > 0).slice(0, 20);
  const itemCount = populated.reduce((sum, category) => sum + category.items.length, 0);

  return {
    categories: populated,
    warnings: draft.warnings.slice(0, 8),
    confidence: itemCount === 0 ? Math.min(draft.confidence, 0.2) : draft.confidence
  };
}

export function parseMenuOcrText(rawText: string, options: ParseMenuOcrTextOptions = {}): ParsedMenuOcrDraft {
  const existingCategoryNames = categoryHints(options);
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeText)
    .filter((line) => line && !shouldIgnoreLine(line))
    .slice(0, 500);

  const categories: ParsedMenuOcrCategory[] = [createCategory("Menu", existingCategoryNames)];
  const seen = new Set<string>();
  const pendingNames: string[] = [];

  for (const line of lines) {
    if (looksLikeCategory(line)) {
      const current = categories[categories.length - 1];
      if (current.items.length > 0 || current.name !== "Menu") categories.push(createCategory(line, existingCategoryNames));
      else current.name = resolveCategoryName(line, existingCategoryNames);
      pendingNames.length = 0;
      continue;
    }

    const current = categories[categories.length - 1];
    const inlineItems = findInlineItems(line);
    if (inlineItems.length > 1) {
      for (const item of inlineItems) addItem(current, { ...item, description: null, tags: [] }, seen);
      pendingNames.length = 0;
      if (seen.size >= maxItems) break;
      continue;
    }

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
      pendingNames.push(normalizeMenuOcrItemName(line));
      if (pendingNames.length > 8) pendingNames.shift();
    }
  }

  const refined = refineMenuOcrDraft({ categories, warnings: [], confidence: 0.2 }, options);
  const populated = refined.categories;
  const itemCount = populated.reduce((sum, category) => sum + category.items.length, 0);

  return {
    categories: populated,
    warnings: [],
    confidence: itemCount >= 5 ? 0.72 : itemCount > 0 ? 0.58 : 0.2
  };
}

function findInlineItems(line: string) {
  const normalized = normalizeText(line);
  const items: Array<{ name: string; price: number }> = [];
  for (const match of normalized.matchAll(inlineItemPattern)) {
    const name = normalizeMenuOcrItemName(match[1] || "");
    const price = parseMenuOcrPriceToken(match[2] || "");
    if (!name || price <= 0 || !isLikelyItemName(name)) continue;
    items.push({ name, price });
  }
  return items;
}
