import assert from "node:assert/strict";
import test from "node:test";
import { formatRestaurantMemoryContext, rankRestaurantMemories, tokenizeMemoryQuery } from "./retrieval";

const memories = [
  {
    id: "1",
    category: "inventory" as const,
    title: "Trân châu đen",
    content: "Nguyên liệu này thường thiếu vào cuối tuần.",
    tags: ["kho", "topping"],
    sensitivity: "internal" as const
  },
  {
    id: "2",
    category: "marketing" as const,
    title: "Chiến dịch mưa",
    content: "Khi trời mưa nên đẩy combo trà nóng.",
    tags: ["khuyen mai"],
    sensitivity: "internal" as const
  }
];

test("tokenizeMemoryQuery normalizes Vietnamese search text", () => {
  assert.deepEqual(tokenizeMemoryQuery("Trà đào & trân châu!"), ["tra", "dao", "tran", "chau"]);
});

test("rankRestaurantMemories returns matching scoped facts first", () => {
  const ranked = rankRestaurantMemories(memories, "thiếu trân châu", 2);

  assert.equal(ranked[0]?.id, "1");
});

test("formatRestaurantMemoryContext produces compact prompt context", () => {
  const context = formatRestaurantMemoryContext(memories, 500);

  assert.match(context, /\[inventory\] Trân châu đen/);
  assert.ok(context.length < 500);
});
