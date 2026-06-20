import assert from "node:assert/strict";
import test from "node:test";
import { extractOcrTextWithProviders, hasConfiguredOcrImageProvider, resolveOcrProviderOrder } from "./ocr-text-extraction";

test("resolveOcrProviderOrder normalizes aliases and removes duplicates", () => {
  assert.deepEqual(resolveOcrProviderOrder({ OCR_PROVIDER_ORDER: "aws, google-vision, ocr.space, textract" }), ["textract", "google_vision", "ocrspace"]);
});

test("hasConfiguredOcrImageProvider respects provider-specific keys", () => {
  assert.equal(hasConfiguredOcrImageProvider({ OCR_PROVIDER_ORDER: "textract,google_vision,ocrspace" }), false);
  assert.equal(
    hasConfiguredOcrImageProvider({ OCR_PROVIDER_ORDER: "textract", AWS_TEXTRACT_ACCESS_KEY_ID: "AKIA_TEST", AWS_TEXTRACT_SECRET_ACCESS_KEY: "secret" }),
    true
  );
  assert.equal(hasConfiguredOcrImageProvider({ OCR_PROVIDER_ORDER: "google_vision", GOOGLE_VISION_API_KEY: "key" }), true);
  assert.equal(hasConfiguredOcrImageProvider({ OCR_PROVIDER_ORDER: "ocrspace", OCR_SPACE_API_KEY: "key" }), true);
});

test("extractOcrTextWithProviders falls through when the first configured provider fails", async () => {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    const requestUrl = String(url);
    requests.push(requestUrl);
    if (requestUrl.includes("textract")) return new Response(JSON.stringify({ message: "Textract unavailable" }), { status: 500 });
    return new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: "Cà phê sữa đá\n28000" } }] }), { status: 200 });
  };

  const result = await extractOcrTextWithProviders(
    { imageBase64: Buffer.from("png-bytes").toString("base64") },
    {
      env: {
        OCR_PROVIDER_ORDER: "textract,google_vision",
        AWS_TEXTRACT_REGION: "us-east-1",
        AWS_TEXTRACT_ACCESS_KEY_ID: "AKIA_TEST",
        AWS_TEXTRACT_SECRET_ACCESS_KEY: "secret",
        GOOGLE_VISION_API_KEY: "google-test-key"
      },
      fetchImpl,
      now: new Date("2026-06-20T04:00:00.000Z")
    }
  );

  assert.equal(result.provider, "google_vision");
  assert.equal(result.text, "Cà phê sữa đá\n28000");
  assert.deepEqual(requests.map((request) => (request.includes("textract") ? "textract" : "google")), ["textract", "google"]);
});

test("extractOcrTextWithProviders reports missing image provider config", async () => {
  await assert.rejects(
    () => extractOcrTextWithProviders({ imageBase64: "abc" }, { env: { OCR_PROVIDER_ORDER: "textract,google_vision,ocrspace" } }),
    /No OCR image provider is configured/
  );
});
