import assert from "node:assert/strict";
import test from "node:test";
import { detectDocumentTextWithGoogleVision, resolveGoogleVisionOcrConfig } from "./google-vision-ocr";

const googleVisionEnv = {
  OCR_PROVIDER_ORDER: "textract,google_vision,ocrspace",
  GOOGLE_VISION_API_KEY: "google-test-key"
};

test("resolveGoogleVisionOcrConfig follows OCR provider order", () => {
  assert.equal(resolveGoogleVisionOcrConfig({ OCR_PROVIDER_ORDER: "textract", GOOGLE_VISION_API_KEY: "key" }), null);
  assert.ok(resolveGoogleVisionOcrConfig({ OCR_PROVIDER_ORDER: "google_vision", GOOGLE_VISION_API_KEY: "key" }));
});

test("detectDocumentTextWithGoogleVision extracts document text", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: "Phở bò\n65000" } }] }), { status: 200 });
  };

  const result = await detectDocumentTextWithGoogleVision(
    { imageBase64: `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}` },
    { env: googleVisionEnv, fetchImpl }
  );

  assert.equal(result.text, "Phở bò\n65000");
  assert.equal(result.lines.length, 2);
  assert.match(requests[0]?.url || "", /images:annotate\?key=google-test-key$/);
  assert.ok(requests[0]?.init?.signal instanceof AbortSignal);
  assert.match(String(requests[0]?.init?.body), /DOCUMENT_TEXT_DETECTION/);
});

test("detectDocumentTextWithGoogleVision blocks private URLs", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };

  await assert.rejects(
    () => detectDocumentTextWithGoogleVision({ imageUrl: "http://127.0.0.1/menu.png" }, { env: googleVisionEnv, fetchImpl }),
    /private network|public/
  );
  assert.equal(called, false);
});
