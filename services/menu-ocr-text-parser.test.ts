import assert from "node:assert/strict";
import test from "node:test";
import { parseMenuOcrText, parseMenuOcrPriceToken } from "./menu-ocr-text-parser";

test("parseMenuOcrPriceToken normalizes common Vietnamese menu price shapes", () => {
  assert.equal(parseMenuOcrPriceToken("25.000"), 25000);
  assert.equal(parseMenuOcrPriceToken("25,000đ"), 25000);
  assert.equal(parseMenuOcrPriceToken("25k"), 25000);
  assert.equal(parseMenuOcrPriceToken("65"), 65000);
});

test("parseMenuOcrText extracts items when Textract keeps name and price on one line", () => {
  const draft = parseMenuOcrText([
    "LOGIVN CAFE",
    "MENU",
    "Cà phê sữa đá 28.000",
    "Bạc xỉu 32000",
    "Trà đào cam sả 35k",
    "Hotline 0900000000"
  ].join("\n"));

  assert.equal(draft.categories.length, 1);
  assert.deepEqual(
    draft.categories[0].items.map((item) => [item.name, item.price]),
    [
      ["Cà phê sữa đá", 28000],
      ["Bạc xỉu", 32000],
      ["Trà đào cam sả", 35000]
    ]
  );
  assert.ok(draft.confidence > 0.5);
});

test("parseMenuOcrText pairs standalone price lines with preceding item names", () => {
  const draft = parseMenuOcrText([
    "ĐỒ UỐNG",
    "Phở bò đặc biệt",
    "65.000",
    "Cơm gà xối mỡ",
    "55 000",
    "Cà phê sữa đá",
    "30000",
    "Ngày 20/06/2026"
  ].join("\n"));

  assert.equal(draft.categories[0].name, "ĐỒ UỐNG");
  assert.deepEqual(
    draft.categories[0].items.map((item) => [item.name, item.price]),
    [
      ["Phở bò đặc biệt", 65000],
      ["Cơm gà xối mỡ", 55000],
      ["Cà phê sữa đá", 30000]
    ]
  );
});
