import assert from "node:assert/strict";
import test from "node:test";
import { detectDocumentTextWithAwsTextract, resolveAwsTextractConfig } from "./aws-textract-ocr";

const textractEnv = {
  OCR_PROVIDER: "textract",
  AWS_TEXTRACT_REGION: "us-east-1",
  AWS_TEXTRACT_ACCESS_KEY_ID: "AKIA_TEST",
  AWS_TEXTRACT_SECRET_ACCESS_KEY: "secret"
};

test("resolveAwsTextractConfig follows OCR provider order with Textract as default", () => {
  assert.ok(resolveAwsTextractConfig({ AWS_TEXTRACT_ACCESS_KEY_ID: "key", AWS_TEXTRACT_SECRET_ACCESS_KEY: "secret" }));
  assert.equal(resolveAwsTextractConfig({ OCR_PROVIDER_ORDER: "google_vision", AWS_TEXTRACT_ACCESS_KEY_ID: "key", AWS_TEXTRACT_SECRET_ACCESS_KEY: "secret" }), null);
  assert.ok(resolveAwsTextractConfig({ OCR_PROVIDER_ORDER: "textract,google_vision", AWS_TEXTRACT_ACCESS_KEY_ID: "key", AWS_TEXTRACT_SECRET_ACCESS_KEY: "secret" }));
});

test("detectDocumentTextWithAwsTextract signs request and extracts line text", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        Blocks: [
          { BlockType: "PAGE" },
          { BlockType: "LINE", Text: "Cà phê sữa 25000", Confidence: 99.1 },
          { BlockType: "WORD", Text: "ignore" },
          { BlockType: "LINE", Text: "Bánh mì 18000", Confidence: 98.2 }
        ]
      }),
      { status: 200 }
    );
  };

  const result = await detectDocumentTextWithAwsTextract(
    { imageBase64: `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}` },
    { env: textractEnv, fetchImpl, now: new Date("2026-06-20T04:00:00.000Z") }
  );

  assert.equal(result.text, "Cà phê sữa 25000\nBánh mì 18000");
  assert.equal(result.lines.length, 2);
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.url, "https://textract.us-east-1.amazonaws.com");
  const headers = request.init?.headers as Record<string, string>;
  assert.equal(headers["x-amz-date"], "20260620T040000Z");
  assert.equal(headers["x-amz-target"], "Textract.DetectDocumentText");
  assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 /);
  assert.equal(headers.Authorization.includes("secret"), false);
  assert.ok(request.init?.signal instanceof AbortSignal);
});

test("detectDocumentTextWithAwsTextract blocks private image URLs before fetch", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return new Response("", { status: 200 });
  };

  await assert.rejects(
    () => detectDocumentTextWithAwsTextract({ imageUrl: "http://127.0.0.1/menu.png" }, { env: textractEnv, fetchImpl }),
    /private network|public/
  );
  assert.equal(called, false);
});

test("detectDocumentTextWithAwsTextract caps remote image size", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(Buffer.alloc(1), {
      status: 200,
      headers: { "content-length": String(6 * 1024 * 1024) }
    });

  await assert.rejects(
    () => detectDocumentTextWithAwsTextract({ imageUrl: "https://cdn.logivn.com/menu.png" }, { env: textractEnv, fetchImpl }),
    /5MB OCR limit/
  );
});
