import assert from "node:assert/strict";
import test from "node:test";
import { buildAwsS3AssetKey, resolveAwsS3StorageConfig, uploadAwsS3Asset } from "./aws-s3-storage";

const s3Env = {
  MENU_IMAGE_STORAGE_PROVIDER: "s3",
  AWS_S3_REGION: "us-east-1",
  AWS_S3_BUCKET: "logivn-assets-test",
  AWS_S3_ACCESS_KEY_ID: "AKIA_TEST",
  AWS_S3_SECRET_ACCESS_KEY: "secret",
  AWS_S3_PUBLIC_BASE_URL: "https://cdn.logivn.com/assets",
  AWS_S3_KEY_PREFIX: "restaurants"
};

test("resolveAwsS3StorageConfig requires explicit s3 provider", () => {
  assert.equal(resolveAwsS3StorageConfig({ AWS_S3_BUCKET: "bucket", AWS_S3_ACCESS_KEY_ID: "key", AWS_S3_SECRET_ACCESS_KEY: "secret" }), null);
});

test("buildAwsS3AssetKey applies configured prefix and sanitizes parts", () => {
  assert.equal(buildAwsS3AssetKey(["menu-images", "Restaurant A", "2026-06-20", "Logo 1.PNG"], s3Env), "restaurants/menu-images/restaurant-a/2026-06-20/logo-1.png");
});

test("uploadAwsS3Asset signs S3 put and returns CloudFront public URL", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response("", { status: 200 });
  };

  const result = await uploadAwsS3Asset(
    {
      key: "restaurants/menu-images/r1/logo.png",
      bytes: Buffer.from("image-bytes"),
      contentType: "image/png"
    },
    { env: s3Env, fetchImpl, now: new Date("2026-06-20T02:00:00.000Z") }
  );

  assert.equal(result.publicUrl, "https://cdn.logivn.com/assets/restaurants/menu-images/r1/logo.png");
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.url, "https://logivn-assets-test.s3.us-east-1.amazonaws.com/restaurants/menu-images/r1/logo.png");
  assert.equal(request.init?.method, "PUT");
  const headers = request.init?.headers as Record<string, string>;
  assert.equal(headers["content-type"], "image/png");
  assert.equal(headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(headers["x-amz-date"], "20260620T020000Z");
  assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 /);
  assert.equal(headers.Authorization.includes("secret"), false);
});
