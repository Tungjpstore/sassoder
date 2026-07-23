import { createHash, createHmac } from "node:crypto";
import { readEnv } from "./env.js";

export type AwsSqsMessage = {
  messageId: string | null;
  receiptHandle: string;
  body: string;
};

type AwsSqsConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  queueUrl: string;
  queueName: string;
};

type AwsSqsRequestOptions = {
  now?: Date;
  timeoutMs?: number;
  queueUrl?: string;
};

const defaultSqsRequestTimeoutMs = 5_000;

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function regionFromQueueUrl(queueUrl: string) {
  try {
    return new URL(queueUrl).hostname.match(/^sqs[.-]([a-z0-9-]+)\./)?.[1] ?? "";
  } catch {
    return "";
  }
}

export function resolveAwsSqsConfig(): AwsSqsConfig | null {
  const queueUrl = clean(readEnv("OPERATIONAL_EVENT_SQS_QUEUE_URL") || readEnv("AWS_SQS_QUEUE_URL") || readEnv("SQS_QUEUE_URL"));
  const accessKeyId = clean(readEnv("AWS_SQS_ACCESS_KEY_ID") || readEnv("AWS_ACCESS_KEY_ID"));
  const secretAccessKey = clean(readEnv("AWS_SQS_SECRET_ACCESS_KEY") || readEnv("AWS_SECRET_ACCESS_KEY"));
  if (!queueUrl || !accessKeyId || !secretAccessKey) return null;

  const region = clean(readEnv("AWS_SQS_REGION") || readEnv("SQS_REGION") || readEnv("AWS_REGION")) || regionFromQueueUrl(queueUrl) || "us-east-1";
  const queueName = queueUrl.split("/").filter(Boolean).pop() || "operational-events";
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: clean(readEnv("AWS_SESSION_TOKEN") || readEnv("AWS_SQS_SESSION_TOKEN") || readEnv("SQS_SESSION_TOKEN")) || undefined,
    region,
    queueUrl,
    queueName
  };
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secret: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "sqs");
  return hmac(serviceKey, "aws4_request");
}

function amzTimestamp(now: Date) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signedHeaders(config: AwsSqsConfig, url: URL, payload: string, now: Date) {
  const amzDate = amzTimestamp(now);
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);
  const baseHeaders: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(config.sessionToken ? { "x-amz-security-token": config.sessionToken } : {})
  };
  const signedHeaderNames = Object.keys(baseHeaders).sort().join(";");
  const canonicalHeaders = Object.keys(baseHeaders)
    .sort()
    .map((key) => `${key}:${baseHeaders[key]}\n`)
    .join("");
  const canonicalRequest = ["POST", url.pathname || "/", "", canonicalHeaders, signedHeaderNames, payloadHash].join("\n");
  const scope = `${date}/${config.region}/sqs/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, date, config.region)).update(stringToSign, "utf8").digest("hex");

  return {
    ...baseHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`
  };
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function xmlValue(xml: string, tag: string) {
  return decodeXml(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "");
}

async function sqsQuery(params: Record<string, string>, options: AwsSqsRequestOptions = {}) {
  const config = resolveAwsSqsConfig();
  if (!config) throw new Error("AWS SQS queue is not configured.");

  const url = new URL(options.queueUrl ?? config.queueUrl);
  const payload = new URLSearchParams({ Version: "2012-11-05", ...params });
  const payloadText = payload.toString();
  const response = await fetch(url, {
    method: "POST",
    headers: signedHeaders(config, url, payloadText, options.now ?? new Date()),
    body: payloadText,
    signal: AbortSignal.timeout(options.timeoutMs ?? defaultSqsRequestTimeoutMs)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 500) || `SQS ${params.Action ?? "request"} failed with status ${response.status}.`);

  return { config, text };
}

export async function receiveSqsMessages({
  maxNumberOfMessages,
  waitTimeSeconds,
  visibilityTimeoutSeconds
}: {
  maxNumberOfMessages: number;
  waitTimeSeconds: number;
  visibilityTimeoutSeconds: number;
}) {
  const boundedMax = Math.min(Math.max(Math.floor(maxNumberOfMessages), 1), 10);
  const boundedWait = Math.min(Math.max(Math.floor(waitTimeSeconds), 0), 20);
  const boundedVisibility = Math.min(Math.max(Math.floor(visibilityTimeoutSeconds), 1), 43_200);
  const { config, text } = await sqsQuery(
    {
      Action: "ReceiveMessage",
      MaxNumberOfMessages: String(boundedMax),
      WaitTimeSeconds: String(boundedWait),
      VisibilityTimeout: String(boundedVisibility),
      "AttributeName.1": "All"
    },
    { timeoutMs: (boundedWait + 5) * 1000 }
  );

  const messages: AwsSqsMessage[] = [];
  for (const match of text.matchAll(/<Message>([\s\S]*?)<\/Message>/g)) {
    const block = match[1] ?? "";
    const receiptHandle = xmlValue(block, "ReceiptHandle");
    if (!receiptHandle) continue;
    messages.push({
      messageId: xmlValue(block, "MessageId") || null,
      receiptHandle,
      body: xmlValue(block, "Body")
    });
  }

  return { queueName: config.queueName, messages };
}

export async function deleteSqsMessage(receiptHandle: string) {
  if (!receiptHandle.trim()) throw new Error("SQS receipt handle is required.");
  const { config, text } = await sqsQuery({ Action: "DeleteMessage", ReceiptHandle: receiptHandle });
  return {
    queueName: config.queueName,
    requestId: text.match(/<RequestId>([^<]+)<\/RequestId>/)?.[1] ?? null
  };
}

/**
 * Quarantine a poison message before acknowledging it on the source queue.
 * The destination must be explicitly configured; AWS redrive policies remain
 * the fallback when no application-managed DLQ is available.
 */
export async function sendSqsMessage(body: string, queueUrl: string) {
  if (!queueUrl.trim()) throw new Error("SQS dead-letter queue URL is required.");
  const queueName = queueUrl.split("/").filter(Boolean).pop() || "";
  const params: Record<string, string> = {
    Action: "SendMessage",
    MessageBody: body
  };
  if (queueName.endsWith(".fifo")) {
    params.MessageGroupId = "operational-events";
    params.MessageDeduplicationId = sha256Hex(body);
  }
  const { config, text } = await sqsQuery(
    params,
    { queueUrl }
  );
  return {
    queueName: config.queueName,
    requestId: text.match(/<RequestId>([^<]+)<\/RequestId>/)?.[1] ?? null,
    messageId: text.match(/<MessageId>([^<]+)<\/MessageId>/)?.[1] ?? null
  };
}
