import assert from "node:assert/strict";
import test from "node:test";
import { deleteAwsSqsMessage, receiveAwsSqsMessages, resolveAwsSqsConfig, sendAwsSqsMessage } from "./aws-sqs-queue";

const sqsEnv = {
  OPERATIONAL_EVENT_QUEUE_PROVIDER: "sqs",
  OPERATIONAL_EVENT_SQS_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123456789012/logivn-operational-events.fifo",
  AWS_SQS_ACCESS_KEY_ID: "AKIA_TEST",
  AWS_SQS_SECRET_ACCESS_KEY: "secret",
  OPERATIONAL_EVENT_SQS_GROUP_ID: "logivn-events"
};

test("resolveAwsSqsConfig requires explicit sqs provider", () => {
  assert.equal(resolveAwsSqsConfig({ AWS_SQS_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123/q" }), null);
});

test("sendAwsSqsMessage signs FIFO SendMessage", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response("<SendMessageResponse><SendMessageResult><MessageId>msg-123</MessageId></SendMessageResult></SendMessageResponse>", { status: 200 });
  };

  const result = await sendAwsSqsMessage(
    {
      body: { eventId: "evt-1", type: "order.created" },
      deduplicationId: "evt-1",
      groupId: "restaurant-1"
    },
    { env: sqsEnv, fetchImpl, now: new Date("2026-06-20T03:00:00.000Z") }
  );

  assert.equal(result.queueName, "logivn-operational-events.fifo");
  assert.equal(result.messageId, "msg-123");
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.url, sqsEnv.OPERATIONAL_EVENT_SQS_QUEUE_URL);
  assert.equal(request.init?.method, "POST");
  const body = String(request.init?.body);
  assert.match(body, /Action=SendMessage/);
  assert.match(body, /MessageGroupId=restaurant-1/);
  assert.match(body, /MessageDeduplicationId=evt-1/);
  const headers = request.init?.headers as Record<string, string>;
  assert.equal(headers["x-amz-date"], "20260620T030000Z");
  assert.match(headers.Authorization, /^AWS4-HMAC-SHA256 /);
  assert.equal(headers.Authorization.includes("secret"), false);
});

test("receiveAwsSqsMessages signs ReceiveMessage and decodes XML", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(
      [
        "<ReceiveMessageResponse><ReceiveMessageResult><Message>",
        "<MessageId>msg-123</MessageId>",
        "<ReceiptHandle>abc&amp;123</ReceiptHandle>",
        "<Body>{&quot;eventId&quot;:&quot;evt-12345678&quot;,&quot;type&quot;:&quot;order.created&quot;}</Body>",
        "</Message></ReceiveMessageResult></ReceiveMessageResponse>"
      ].join(""),
      { status: 200 }
    );
  };

  const result = await receiveAwsSqsMessages(
    { maxNumberOfMessages: 99, waitTimeSeconds: 99, visibilityTimeoutSeconds: 0 },
    { env: sqsEnv, fetchImpl, now: new Date("2026-06-20T03:00:00.000Z") }
  );

  assert.equal(result.queueName, "logivn-operational-events.fifo");
  assert.equal(result.messages.length, 1);
  assert.deepEqual(result.messages[0], {
    messageId: "msg-123",
    receiptHandle: "abc&123",
    body: '{"eventId":"evt-12345678","type":"order.created"}'
  });
  const request = requests[0];
  assert.ok(request);
  const body = String(request.init?.body);
  assert.match(body, /Action=ReceiveMessage/);
  assert.match(body, /MaxNumberOfMessages=10/);
  assert.match(body, /WaitTimeSeconds=20/);
  assert.match(body, /VisibilityTimeout=1/);
});

test("deleteAwsSqsMessage signs DeleteMessage", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response("<DeleteMessageResponse><ResponseMetadata><RequestId>req-123</RequestId></ResponseMetadata></DeleteMessageResponse>", { status: 200 });
  };

  const result = await deleteAwsSqsMessage({ receiptHandle: "abc&123" }, { env: sqsEnv, fetchImpl, now: new Date("2026-06-20T03:00:00.000Z") });

  assert.equal(result.queueName, "logivn-operational-events.fifo");
  assert.equal(result.requestId, "req-123");
  const request = requests[0];
  assert.ok(request);
  const body = String(request.init?.body);
  assert.match(body, /Action=DeleteMessage/);
  assert.match(body, /ReceiptHandle=abc%26123/);
  assert.equal(body.includes("secret"), false);
});
