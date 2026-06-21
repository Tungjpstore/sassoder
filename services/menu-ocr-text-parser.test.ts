import assert from "node:assert/strict";
import test from "node:test";
import { parseMenuOcrText, parseMenuOcrPriceToken, refineMenuOcrDraft } from "./menu-ocr-text-parser";

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

test("parseMenuOcrText removes menu item ordinals without damaging numeric brand names", () => {
  const draft = parseMenuOcrText([
    "TRÀ",
    "50 Trà chanh 25.000",
    "51. Trà chanh dây",
    "30.000",
    "7 Up 20.000"
  ].join("\n"));

  assert.deepEqual(
    draft.categories[0].items.map((item) => [item.name, item.price]),
    [
      ["Trà chanh", 25000],
      ["Trà chanh dây", 30000],
      ["7 Up", 20000]
    ]
  );
});

test("parseMenuOcrText dedupes accentless duplicate OCR lines and keeps the better Vietnamese name", () => {
  const draft = parseMenuOcrText([
    "TRA",
    "50 Tra chanh day 25.000",
    "Trà chanh dây 25.000",
    "tra chanh day 25.000"
  ].join("\n"), { existingCategoryNames: ["Trà", "Cà phê"] });

  assert.equal(draft.categories.length, 1);
  assert.equal(draft.categories[0].name, "Trà");
  assert.deepEqual(draft.categories[0].items.map((item) => [item.name, item.price]), [["Trà chanh dây", 25000]]);
  assert.deepEqual(draft.warnings, []);
});

test("parseMenuOcrText extracts two-column menu rows and strips ordinals per item", () => {
  const draft = parseMenuOcrText([
    "TRÀ",
    "01 Trà chanh 20.000 02 Trà đào cam sả 35.000",
    "03 Trà chanh dây 25.000 04 Bạc xỉu 30.000"
  ].join("\n"), { existingCategoryNames: ["Trà", "Cà phê"] });

  assert.deepEqual(
    draft.categories[0].items.map((item) => [item.name, item.price]),
    [
      ["Trà chanh", 20000],
      ["Trà đào cam sả", 35000],
      ["Trà chanh dây", 25000],
      ["Bạc xỉu", 30000]
    ]
  );
});

test("parseMenuOcrText collapses size variants into one base menu item", () => {
  const draft = parseMenuOcrText([
    "TRÀ",
    "Trà chanh dây S 25.000",
    "Trà chanh dây M 30.000",
    "Tra chanh day L 35.000"
  ].join("\n"));

  assert.deepEqual(draft.categories[0].items.map((item) => [item.name, item.price]), [["Trà chanh dây", 25000]]);
});

test("parseMenuOcrText keeps noisy Vietnamese menu scans compact", () => {
  const draft = parseMenuOcrText([
    "MENU LOGIVN",
    "Sử dụng OCR model Textract",
    "TRA",
    "50 Tra chanh day S 25.000",
    "Trà chanh dây M 30.000",
    "51. Trà chanh 20.000",
    "52 Tra chanh 20.000",
    "7 Up 20.000",
    "Hotline 0900000000",
    "CA PHE",
    "01 Cà phê sữa đá 28.000 02 Bac xiu 32.000",
    "Bạc xỉu 32.000"
  ].join("\n"), { existingCategoryNames: ["Trà", "Cà phê"] });

  assert.deepEqual(
    draft.categories.map((category) => [category.name, category.items.map((item) => [item.name, item.price])]),
    [
      ["Trà", [["Trà chanh dây", 25000], ["Trà chanh", 20000], ["7 Up", 20000]]],
      ["Cà phê", [["Cà phê sữa đá", 28000], ["Bạc xỉu", 32000]]]
    ]
  );
  assert.deepEqual(draft.warnings, []);
});

test("refineMenuOcrDraft maps AI category names to existing categories and removes duplicate accent variants", () => {
  const refined = refineMenuOcrDraft(
    {
      categories: [
        { name: "TRA", items: [{ name: "50 Tra chanh day", price: 25000, description: null, tags: [] }] },
        { name: "Trà", items: [{ name: "Trà chanh dây", price: 25000, description: null, tags: [] }] },
        { name: "DO UONG", items: [{ name: "Cà phê sữa đá", price: 30000, description: null, tags: [] }] }
      ],
      warnings: [],
      confidence: 0.7
    },
    { existingCategoryNames: ["Trà", "Đồ uống"] }
  );

  assert.deepEqual(
    refined.categories.map((category) => [category.name, category.items.map((item) => item.name)]),
    [
      ["Trà", ["Trà chanh dây"]],
      ["Đồ uống", ["Cà phê sữa đá"]]
    ]
  );
});
