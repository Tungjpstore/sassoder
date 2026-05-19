export type RestaurantMemoryCategory = "brand" | "menu" | "customer" | "operations" | "staff" | "inventory" | "marketing" | "policy" | "branch";
export type RestaurantMemorySensitivity = "public" | "internal" | "sensitive";

export type RestaurantMemoryItem = {
  id: string;
  category: RestaurantMemoryCategory;
  title: string;
  content: string;
  summary?: string | null;
  tags: string[];
  sensitivity: RestaurantMemorySensitivity;
  updatedAt?: string | null;
};

function foldText(value: string) {
  return value
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function tokenizeMemoryQuery(value: string) {
  return Array.from(
    new Set(
      foldText(value)
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  ).slice(0, 12);
}

export function rankRestaurantMemories(items: RestaurantMemoryItem[], query: string, limit = 6) {
  const tokens = tokenizeMemoryQuery(query);
  if (tokens.length === 0) return items.slice(0, Math.max(1, limit));

  return items
    .map((item) => {
      const haystack = foldText(`${item.title} ${item.summary ?? ""} ${item.content} ${item.tags.join(" ")}`);
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
    .slice(0, Math.max(1, limit));
}

export function formatRestaurantMemoryContext(items: RestaurantMemoryItem[], maxChars = 1800) {
  const lines = items.map((item) => {
    const body = (item.summary || item.content).replace(/\s+/g, " ").trim().slice(0, 260);
    return `- [${item.category}] ${item.title}: ${body}`;
  });
  const output: string[] = [];
  let length = 0;

  for (const line of lines) {
    if (length + line.length > maxChars) break;
    output.push(line);
    length += line.length;
  }

  return output.join("\n");
}
