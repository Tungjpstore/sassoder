import assert from "node:assert/strict";
import test from "node:test";
import {
  extractReadableTextFromAiPayload,
  looksLikeRawAiPayload,
  normalizeAiReply,
  sanitizeAiDisplayText
} from "./response-contract";

test("normalizeAiReply turns blank model output into a fallback reply", () => {
  const contract = normalizeAiReply({
    rawText: "   ",
    fallbackText: "Mình đã chuẩn bị bước tiếp theo.",
    emptyText: "Không để trống."
  });

  assert.equal(contract.reply, "Mình đã chuẩn bị bước tiếp theo.");
  assert.equal(contract.quality.source, "fallback");
  assert.equal(contract.quality.wasBlank, true);
});

test("normalizeAiReply extracts useful copy from JSON instead of exposing raw payload", () => {
  const contract = normalizeAiReply({
    rawText: JSON.stringify({
      summary: "Phở Ba Minh đã có menu và bàn QR.",
      launchBlockers: ["Thiếu hotline", "Thiếu địa chỉ"],
      expressSetup: [{ title: "Thêm hotline" }]
    }),
    fallbackText: "Dùng fallback.",
    emptyText: "Không để trống."
  });

  assert.match(contract.reply, /Phở Ba Minh/);
  assert.match(contract.reply, /Thiếu hotline/);
  assert.doesNotMatch(contract.reply, /"summary"/);
  assert.equal(contract.quality.source, "structured");
});

test("normalizeAiReply keeps normal model text and strips markdown chrome", () => {
  const contract = normalizeAiReply({
    rawText: "## Kết quả\n**Mở màn thanh toán** để đối soát.",
    fallbackText: "Fallback",
    emptyText: "Không để trống."
  });

  assert.equal(contract.reply, "Kết quả\nMở màn thanh toán để đối soát.");
  assert.equal(contract.quality.source, "model");
});

test("raw payload detection catches tool calls and JSON-like text", () => {
  assert.equal(looksLikeRawAiPayload('{"tool_calls":[{"name":"search_menu"}]}'), true);
  assert.equal(looksLikeRawAiPayload("Mình đã mở đúng màn để bạn xử lý."), false);
});

test("extractReadableTextFromAiPayload reads nested action labels", () => {
  const readable = extractReadableTextFromAiPayload(
    JSON.stringify({
      ownerMessage: "Setup còn thiếu dữ liệu bán thật.",
      draft: { checklist: ["Thêm hotline", "Kiểm VietQR"] }
    })
  );

  assert.match(readable, /Setup còn thiếu/);
  assert.match(readable, /Thêm hotline/);
});

test("sanitizeAiDisplayText removes fenced blocks", () => {
  assert.equal(sanitizeAiDisplayText("```json\n{}\n```\nDùng card bên dưới."), "Dùng card bên dưới.");
});
