import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function functionBlock(source: string, name: string) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `Missing ${name}`);
  const next = source.indexOf("\nasync function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("image OCR routes through AWS Textract text extraction before MiMo normalization", () => {
  const source = readFileSync("services/ai/runtime.ts", "utf8");
  const enrichBlock = functionBlock(source, "enrichOcrInputWithTextract");
  const menuBlock = functionBlock(source, "runMenuOcrDraft");
  const inventoryBlock = functionBlock(source, "runInventoryOcrDraft");

  assert.match(enrichBlock, /detectDocumentTextWithAwsTextract/);
  assert.match(enrichBlock, /OCR_PROVIDER=textract/);
  assert.doesNotMatch(menuBlock, /mimoMultimodalOcr/);
  assert.doesNotMatch(inventoryBlock, /mimoMultimodalOcr/);
  assert.match(menuBlock, /chỉ xử lý chữ đã được trích xuất/);
  assert.match(inventoryBlock, /chỉ xử lý chữ đã được trích xuất/);
});
