import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function functionBlock(source: string, name: string) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `Missing ${name}`);
  const next = source.indexOf("\nasync function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("image OCR routes through configured image providers before provider-routed text normalization", () => {
  const source = readFileSync("services/ai/runtime.ts", "utf8");
  const enrichBlock = functionBlock(source, "enrichOcrInputWithProviders");
  const providerBlock = source.slice(source.indexOf("function resolveOcrTextProvider"), source.indexOf("async function runOcrTextNormalization"));
  const normalizeBlock = functionBlock(source, "runOcrTextNormalization");
  const menuBlock = functionBlock(source, "runMenuOcrDraft");
  const inventoryBlock = functionBlock(source, "runInventoryOcrDraft");

  assert.match(enrichBlock, /extractOcrTextWithProviders/);
  assert.doesNotMatch(enrichBlock, /OCR_PROVIDER_ORDER=textract,google_vision,ocrspace/);
  assert.match(providerBlock, /AI_OCR_TEXT_PROVIDER/);
  assert.match(providerBlock, /AI_OCR_PROVIDER/);
  assert.match(normalizeBlock, /runChat/);
  assert.match(normalizeBlock, /batch_ocr/);
  assert.doesNotMatch(menuBlock, /getRequiredMimoProviderConfig|mimoChat/);
  assert.doesNotMatch(inventoryBlock, /getRequiredMimoProviderConfig|mimoChat/);
  assert.doesNotMatch(menuBlock, /mimoMultimodalOcr/);
  assert.doesNotMatch(inventoryBlock, /mimoMultimodalOcr/);
  assert.match(menuBlock, /chỉ xử lý chữ đã được trích xuất/);
  assert.match(inventoryBlock, /chỉ xử lý chữ đã được trích xuất/);
});
