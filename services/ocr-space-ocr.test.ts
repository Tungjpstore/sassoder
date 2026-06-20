import assert from "node:assert/strict";
import test from "node:test";
import { detectDocumentTextWithOcrSpace, resolveOcrSpaceConfig } from "./ocr-space-ocr";

const ocrSpaceEnv = {
  OCR_PROVIDER_ORDER: "textract,ocrspace",
  OCR_SPACE_API_KEY: "ocr-space-test-key"
};

test("resolveOcrSpaceConfig follows OCR provider order", () => {
  assert.equal(resolveOcrSpaceConfig({ OCR_PROVIDER_ORDER: "textract", OCR_SPACE_API_KEY: "key" }), null);
  assert.ok(resolveOcrSpaceConfig({ OCR_PROVIDER_ORDER: "ocrspace", OCR_SPACE_API_KEY: "key" }));
});

test("detectDocumentTextWithOcrSpace sends base64 form data and extracts lines", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        ParsedResults: [
          {
            ParsedText: "Bún bò\n55000",
            TextOverlay: { Lines: [{ LineText: "Bún bò" }, { LineText: "55000" }] }
          }
        ],
        OCRExitCode: 1,
        IsErroredOnProcessing: false
      }),
      { status: 200 }
    );
  };

  const result = await detectDocumentTextWithOcrSpace(
    { imageBase64: Buffer.from("png-bytes").toString("base64") },
    { env: ocrSpaceEnv, fetchImpl }
  );

  assert.equal(result.text, "Bún bò\n55000");
  assert.equal(requests[0]?.url, "https://api.ocr.space/parse/image");
  assert.ok(requests[0]?.init?.body instanceof FormData);
  assert.equal((requests[0]?.init?.body as FormData).get("apikey"), "ocr-space-test-key");
  assert.equal((requests[0]?.init?.body as FormData).get("OCREngine"), "2");
  assert.match(String((requests[0]?.init?.body as FormData).get("base64Image")), /^data:image\/png;base64,/);
  assert.ok(requests[0]?.init?.signal instanceof AbortSignal);
});

test("detectDocumentTextWithOcrSpace blocks private URLs", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };

  await assert.rejects(
    () => detectDocumentTextWithOcrSpace({ imageUrl: "http://192.168.1.2/menu.png" }, { env: ocrSpaceEnv, fetchImpl }),
    /private network|public/
  );
  assert.equal(called, false);
});
