import assert from "node:assert/strict";
import test from "node:test";
import { resolveEmailDeliveryConfig, sendTransactionalEmail } from "./email-delivery";

test("resolveEmailDeliveryConfig prefers Resend when both providers are implicit", () => {
  const config = resolveEmailDeliveryConfig({
    RESEND_API_KEY: " re_test ",
    AWS_SES_ACCESS_KEY_ID: "AKIA_TEST",
    AWS_SES_SECRET_ACCESS_KEY: "secret"
  });

  assert.equal(config?.provider, "resend");
});

test("resolveEmailDeliveryConfig supports explicit SES", () => {
  const config = resolveEmailDeliveryConfig({
    EMAIL_PROVIDER: "ses",
    AWS_SES_REGION: "ap-southeast-1",
    AWS_SES_ACCESS_KEY_ID: "AKIA_TEST",
    AWS_SES_SECRET_ACCESS_KEY: "secret"
  });

  assert.equal(config?.provider, "ses");
  if (config?.provider !== "ses") throw new Error("Expected SES config");
  assert.equal(config?.region, "ap-southeast-1");
  assert.equal(config?.endpoint, "https://email.ap-southeast-1.amazonaws.com");
});

test("resolveEmailDeliveryConfig returns null when explicit SES lacks credentials", () => {
  assert.equal(resolveEmailDeliveryConfig({ EMAIL_PROVIDER: "ses", AWS_SES_REGION: "us-east-1" }), null);
});

test("sendTransactionalEmail posts to Resend", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  };

  const result = await sendTransactionalEmail(
    {
      from: "LogiVN <no-reply@example.com>",
      to: ["owner@example.com"],
      subject: "OTP",
      text: "123456"
    },
    { env: { RESEND_API_KEY: "re_test", RESEND_BASE_URL: "https://resend.test" }, fetchImpl }
  );

  assert.equal(result.provider, "resend");
  assert.equal(result.providerMessageId, "email_123");
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.url, "https://resend.test/emails");
  const body = JSON.parse(String(request.init?.body));
  assert.deepEqual(body.to, ["owner@example.com"]);
  assert.equal(body.text, "123456");
});

test("sendTransactionalEmail signs and posts SES raw email payload", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ MessageId: "ses-message-123" }), { status: 200 });
  };

  const result = await sendTransactionalEmail(
    {
      from: "LogiVN <no-reply@example.com>",
      to: ["owner@example.com"],
      subject: "Báo cáo ngày",
      html: "<p>Xin chào</p>",
      attachments: [{ filename: "report.csv", content: Buffer.from("a,b\n1,2").toString("base64") }]
    },
    {
      env: {
        EMAIL_PROVIDER: "ses",
        AWS_SES_REGION: "us-east-1",
        AWS_SES_ACCESS_KEY_ID: "AKIA_TEST",
        AWS_SES_SECRET_ACCESS_KEY: "secret"
      },
      fetchImpl,
      now: new Date("2026-06-05T10:00:00.000Z")
    }
  );

  assert.equal(result.provider, "ses");
  assert.equal(result.providerMessageId, "ses-message-123");
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.url, "https://email.us-east-1.amazonaws.com/v2/email/outbound-emails");
  const headers = request.init?.headers as Record<string, string>;
  assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 /);
  assert.equal(headers["x-amz-date"], "20260605T100000Z");
  const bodyText = String(request.init?.body);
  const body = JSON.parse(bodyText);
  assert.equal(body.FromEmailAddress, "no-reply@example.com");
  assert.deepEqual(body.Destination.ToAddresses, ["owner@example.com"]);
  assert.equal(typeof body.Content.Raw.Data, "string");
  assert.equal(bodyText.includes("secret"), false);
});
