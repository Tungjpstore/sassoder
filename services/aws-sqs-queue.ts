import { createHash, createHmac } from "crypto";

export type AwsSqsEnv = Record<string, string | undefined>;

type AwsSqsConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  queueUrl: string;
  queueName: string;
  messageGroupId?: string;
};

type SendSqsMessageOptions = {
  env?: AwsSqsEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
};

type SqsRequestOptions = SendSqsMessageOptions & {
  timeoutMs?: number;
};

export type AwsSqsReceivedMessage = {
  messageId: string | null;
  receiptHandle: string;
  body: string;
};

const defaultSqsRequestTimeoutMs = 5_000;

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function provider(env: AwsSqsEnv) {
  return clean(env.OPERATIONAL_EVENT_QUEUE_PROVIDER || env.BACKGROUND_QUEUE_PROVIDER).toLowerCase();
}

function truthy(value: string | undefined) {
  return ["1", "true", "yes"].includes(clean(value).toLowerCase());
}

function productionSqsConsumerConfirmed(env: AwsSqsEnv) {
  if (clean(env.NODE_ENV) !== "production") return true;
  return truthy(env.OPERATIONAL_EVENT_SQS_CONSUMER_CONFIRMED);
}

export function resolveAwsSqsConfig(env: AwsSqsEnv = process.env): AwsSqsConfig | null {
  if (provider(env) !== "sqs") return null;
  if (!productionSqsConsumerConfirmed(env)) return null;
  const queueUrl = clean(env.OPERATIONAL_EVENT_SQS_QUEUE_URL || env.AWS_SQS_QUEUE_URL || env.SQS_QUEUE_URL);
  const accessKeyId = clean(env.AWS_SQS_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = clean(env.AWS_SQS_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY);
  if (!queueUrl || !accessKeyId || !secretAccessKey) return null;

  const region = clean(env.AWS_SQS_REGION || env.SQS_REGION || env.AWS_REGION) || regionFromQueueUrl(queueUrl) || "us-east-1";
  const queueName = queueUrl.split("/").filter(Boolean).pop() || "operational-events";
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: clean(env.AWS_SESSION_TOKEN || env.AWS_SQS_SESSION_TOKEN || env.SQS_SESSION_TOKEN) || undefined,
    region,
    queueUrl,
    queueName,
    messageGroupId: clean(env.OPERATIONAL_EVENT_SQS_GROUP_ID || env.SQS_MESSAGE_GROUP_ID) || undefined
  };
}

export function isAwsSqsQueueConfigured(env: AwsSqsEnv = process.env) {
  return Boolean(resolveAwsSqsConfig(env));
}

function regionFromQueueUrl(queueUrl: string) {
  try {
    return new URL(queueUrl).hostname.match(/^sqs[.-]([a-z0-9-]+)\./)?.[1] ?? "";
  } catch {
    return "";
  }
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

function messageIdFromXml(xml: string) {
  return xml.match(/<MessageId>([^<]+)<\/MessageId>/)?.[1] ?? null;
}

function xmlValue(xml: string, tag: string) {
  return decodeXml(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "");
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function sqsQuery(params: Record<string, string>, options: SqsRequestOptions = {}) {
  const config = resolveAwsSqsConfig(options.env ?? process.env);
  if (!config) throw new Error("AWS SQS queue is not configured.");

  const url = new URL(config.queueUrl);
  const payload = new URLSearchParams({ Version: "2012-11-05", ...params });
  const payloadText = payload.toString();
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: signedHeaders(config, url, payloadText, options.now ?? new Date()),
    body: payloadText,
    signal: AbortSignal.timeout(options.timeoutMs ?? defaultSqsRequestTimeoutMs)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 500) || `SQS ${params.Action ?? "request"} failed with status ${response.status}.`);

  return { config, text };
}

export async function sendAwsSqsMessage({
  body,
  deduplicationId,
  groupId
}: {
  body: unknown;
  deduplicationId?: string;
  groupId?: string;
}, options: SendSqsMessageOptions = {}) {
  const config = resolveAwsSqsConfig(options.env ?? process.env);
  if (!config) throw new Error("AWS SQS queue is not configured.");

  const url = new URL(config.queueUrl);
  const messageBody = typeof body === "string" ? body : JSON.stringify(body);
  const payload = new URLSearchParams({
    Action: "SendMessage",
    MessageBody: messageBody,
    Version: "2012-11-05"
  });
  if (config.queueName.endsWith(".fifo")) {
    payload.set("MessageDeduplicationId", deduplicationId || sha256Hex(messageBody));
    payload.set("MessageGroupId", groupId || config.messageGroupId || "operational-events");
  }

  const payloadText = payload.toString();
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: signedHeaders(config, url, payloadText, options.now ?? new Date()),
    body: payloadText,
    signal: AbortSignal.timeout(options.timeoutMs ?? defaultSqsRequestTimeoutMs)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 500) || `SQS SendMessage failed with status ${response.status}.`);

  return {
    queueName: config.queueName,
    messageId: messageIdFromXml(text)
  };
}

export async function receiveAwsSqsMessages({
  maxNumberOfMessages = 10,
  waitTimeSeconds = 20,
  visibilityTimeoutSeconds = 60
}: {
  maxNumberOfMessages?: number;
  waitTimeSeconds?: number;
  visibilityTimeoutSeconds?: number;
} = {}, options: SqsRequestOptions = {}) {
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
    { ...options, timeoutMs: options.timeoutMs ?? (boundedWait + 5) * 1000 }
  );

  const messages: AwsSqsReceivedMessage[] = [];
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

export async function deleteAwsSqsMessage({ receiptHandle }: { receiptHandle: string }, options: SqsRequestOptions = {}) {
  if (!receiptHandle?.trim()) throw new Error("SQS receipt handle is required.");
  const { config, text } = await sqsQuery({ Action: "DeleteMessage", ReceiptHandle: receiptHandle }, options);
  return {
    queueName: config.queueName,
    requestId: text.match(/<RequestId>([^<]+)<\/RequestId>/)?.[1] ?? null
  };
}
