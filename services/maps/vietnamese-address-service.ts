const replacementRules: Array<[RegExp, string]> = [
  [/\btp\.?\s*hcm\b/gi, "TP Hồ Chí Minh"],
  [/\btphcm\b/gi, "TP Hồ Chí Minh"],
  [/\bsg\b/gi, "Sài Gòn"],
  [/\bq(?:\.|\s)\s*(\d+)\b/gi, "Quận $1"],
  [/\bp(?:\.|\s)\s*([^\d,]{2,})/gi, "Phường $1"],
  [/\btx\.?\s*/gi, "Thị xã "],
  [/\btt\.?\s*/gi, "Thị trấn "],
  [/\bh\.\s*([^\d,]{2,})/gi, "Huyện $1"],
  [/\bđ\.?\s*/gi, "Đường "]
];

export function normalizeVietnameseAddressQuery(query: string) {
  const compacted = query.trim().replace(/\s+/g, " ");
  if (!compacted) return "";

  return replacementRules
    .reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), compacted)
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}
