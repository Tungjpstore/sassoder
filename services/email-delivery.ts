import { createHmac, createHash, randomUUID } from "crypto";
import { AppError } from "@/lib/response";

export type EmailDeliveryEnv = Record<string, string | undefined>;

export type EmailDeliveryProvider = "resend" | "ses";

export type EmailCategory =
  | "auth_security"
  | "billing_transactional"
  | "operational_notification"
  | "operational_report"
  | "platform_admin"
  | "marketing";

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type SendTransactionalEmailInput = {
  from?: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  category?: EmailCategory;
  preferenceUrl?: string;
  unsubscribeUrl?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

type SendEmailOptions = {
  env?: EmailDeliveryEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
  signal?: AbortSignal;
};

type ResendConfig = {
  provider: "resend";
  apiKey: string;
  baseUrl: string;
};

type SesConfig = {
  provider: "ses";
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  endpoint: string;
};

export type EmailDeliveryConfig = ResendConfig | SesConfig;

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function requestedProvider(env: EmailDeliveryEnv) {
  const provider = clean(env.EMAIL_PROVIDER || env.TRANSACTIONAL_EMAIL_PROVIDER).toLowerCase();
  return provider === "ses" || provider === "resend" ? provider : null;
}

function truthy(value: string | undefined) {
  return ["1", "true", "yes"].includes(clean(value).toLowerCase());
}

function sesProductionAccessConfirmed(env: EmailDeliveryEnv) {
  return truthy(env.SES_PRODUCTION_ACCESS_CONFIRMED || env.AWS_SES_PRODUCTION_ACCESS_CONFIRMED);
}

function hasSesConfig(env: EmailDeliveryEnv) {
  return Boolean(clean(env.AWS_SES_ACCESS_KEY_ID || env.SES_ACCESS_KEY_ID) && clean(env.AWS_SES_SECRET_ACCESS_KEY || env.SES_SECRET_ACCESS_KEY));
}

export function resolveEmailDeliveryConfig(env: EmailDeliveryEnv = process.env): EmailDeliveryConfig | null {
  const provider = requestedProvider(env);
  if (provider === "ses" || (!provider && !clean(env.RESEND_API_KEY) && hasSesConfig(env))) {
    if (!sesProductionAccessConfirmed(env)) return null;
    const accessKeyId = clean(env.AWS_SES_ACCESS_KEY_ID || env.SES_ACCESS_KEY_ID);
    const secretAccessKey = clean(env.AWS_SES_SECRET_ACCESS_KEY || env.SES_SECRET_ACCESS_KEY);
    if (!accessKeyId || !secretAccessKey) return null;
    const region = clean(env.AWS_SES_REGION || env.SES_REGION || env.AWS_REGION) || "us-east-1";
    return {
      provider: "ses",
      accessKeyId,
      secretAccessKey,
      sessionToken: clean(env.AWS_SESSION_TOKEN || env.AWS_SES_SESSION_TOKEN || env.SES_SESSION_TOKEN) || undefined,
      region,
      endpoint: clean(env.AWS_SES_ENDPOINT || env.SES_ENDPOINT) || `https://email.${region}.amazonaws.com`
    };
  }

  const apiKey = clean(env.RESEND_API_KEY);
  if (!apiKey) return null;
  return {
    provider: "resend",
    apiKey,
    baseUrl: clean(env.RESEND_BASE_URL) || "https://api.resend.com"
  };
}

export function isEmailDeliveryConfigured(env: EmailDeliveryEnv = process.env) {
  return Boolean(resolveEmailDeliveryConfig(env));
}

export function configuredEmailProvider(env: EmailDeliveryEnv = process.env): EmailDeliveryProvider | null {
  return resolveEmailDeliveryConfig(env)?.provider ?? null;
}

function jsonErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const candidate = body as { message?: unknown; Message?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.Message === "string") return candidate.Message;
  }
  return fallback;
}

function normalizeEmailAddress(value: string) {
  return envelopeEmailAddress(value).toLowerCase();
}

function suppressedRecipients(env: EmailDeliveryEnv, recipients: string[]) {
  if (clean(env.EMAIL_SUPPRESSION_ENABLED).toLowerCase() === "false") return [];
  const list = clean(env.EMAIL_SUPPRESSION_LIST || env.TRANSACTIONAL_EMAIL_SUPPRESSION_LIST);
  if (!list) return [];
  const suppressed = new Set(list.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean));
  return recipients.filter((recipient) => suppressed.has(normalizeEmailAddress(recipient)));
}

function category(input: SendTransactionalEmailInput) {
  return input.category ?? "operational_notification";
}

function categoryRequiresUnsubscribe(input: SendTransactionalEmailInput) {
  return category(input) === "marketing";
}

function isOptionalEmail(input: SendTransactionalEmailInput) {
  return ["marketing", "operational_report", "operational_notification"].includes(category(input));
}

function complianceFooter(input: SendTransactionalEmailInput) {
  if (!isOptionalEmail(input)) return { html: input.html, text: input.text };
  const preferenceUrl = clean(input.preferenceUrl);
  const unsubscribeUrl = clean(input.unsubscribeUrl);
  if (!preferenceUrl && !unsubscribeUrl) return { html: input.html, text: input.text };

  const links = [
    preferenceUrl ? `<a href="${preferenceUrl}" style="color:#0f4d3a;">quản lý tuỳ chọn email</a>` : "",
    unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#0f4d3a;">ngừng nhận email này</a>` : ""
  ].filter(Boolean);
  const htmlFooter = `<p style="margin-top:24px;color:#64748b;font-size:12px;line-height:1.6;">Bạn nhận email này vì tài khoản hoặc quán của bạn đang bật thông báo trong LogiVN. Bạn có thể ${links.join(" hoặc ")}.</p>`;
  const textFooter = [
    "",
    "Bạn nhận email này vì tài khoản hoặc quán của bạn đang bật thông báo trong LogiVN.",
    preferenceUrl ? `Quản lý tuỳ chọn email: ${preferenceUrl}` : "",
    unsubscribeUrl ? `Ngừng nhận email này: ${unsubscribeUrl}` : ""
  ].filter(Boolean).join("\n");

  return {
    html: input.html ? `${input.html}${htmlFooter}` : input.html,
    text: input.text ? `${input.text}${textFooter}` : input.text
  };
}

function emailHeaders(input: SendTransactionalEmailInput) {
  const headers: Record<string, string> = {
    "X-LogiVN-Email-Category": category(input)
  };
  if (input.preferenceUrl) headers["X-LogiVN-Preference-URL"] = input.preferenceUrl;
  if (input.unsubscribeUrl) headers["List-Unsubscribe"] = `<${input.unsubscribeUrl}>`;
  if (input.unsubscribeUrl) headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  return headers;
}

function resendTags(input: SendTransactionalEmailInput) {
  const metadata = input.metadata ?? {};
  return [
    { name: "category", value: category(input) },
    ...Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null)
      .slice(0, 8)
      .map(([name, value]) => ({ name: name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40), value: String(value).slice(0, 256) }))
  ];
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function sendWithResend(config: ResendConfig, input: SendTransactionalEmailInput, fetchImpl: typeof fetch, signal?: AbortSignal) {
  const body = complianceFooter(input);
  const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      headers: emailHeaders(input),
      tags: resendTags(input),
      ...(body.html ? { html: body.html } : {}),
      ...(body.text ? { text: body.text } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {})
    }),
    signal
  });
  const json = await readJson(response);
  if (!response.ok) throw new AppError(jsonErrorMessage(json, "Resend từ chối gửi email."), 502);
  return { provider: "resend" as const, providerMessageId: typeof (json as { id?: unknown }).id === "string" ? (json as { id: string }).id : null, raw: json };
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
  const serviceKey = hmac(regionKey, "ses");
  return hmac(serviceKey, "aws4_request");
}

function amzTimestamp(now: Date) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const cleaned = cleanHeader(value);
  return /^[\x20-\x7e]*$/.test(cleaned) ? cleaned : `=?UTF-8?B?${Buffer.from(cleaned, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function attachmentContentType(filename: string, explicit?: string) {
  if (explicit) return explicit;
  if (filename.endsWith(".csv")) return "text/csv; charset=UTF-8";
  if (filename.endsWith(".json")) return "application/json; charset=UTF-8";
  return "application/octet-stream";
}

function envelopeEmailAddress(value: string) {
  return value.match(/<([^<>]+)>/)?.[1]?.trim() || value.trim();
}

function mimePart(contentType: string, content: string, extraHeaders: string[] = []) {
  return [`Content-Type: ${contentType}`, "Content-Transfer-Encoding: base64", ...extraHeaders, "", wrapBase64(Buffer.from(content, "utf8").toString("base64"))].join("\r\n");
}

function buildRawEmail(input: SendTransactionalEmailInput, now: Date) {
  const mixedBoundary = `logivn-mixed-${randomUUID()}`;
  const content = complianceFooter(input);
  const body = content.html
    ? mimePart("text/html; charset=UTF-8", content.html)
    : mimePart("text/plain; charset=UTF-8", content.text || "");
  const attachments = (input.attachments ?? []).map((attachment) => {
    const filename = cleanHeader(attachment.filename || "attachment.bin");
    return [
      `--${mixedBoundary}`,
      `Content-Type: ${attachmentContentType(filename, attachment.contentType)}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      wrapBase64(attachment.content)
    ].join("\r\n");
  });

  return [
    `From: ${cleanHeader(input.from || "")}`,
    `To: ${input.to.map(cleanHeader).join(", ")}`,
    `Subject: ${encodeHeader(input.subject)}`,
    `Date: ${now.toUTCString()}`,
    ...Object.entries(emailHeaders(input)).map(([name, value]) => `${name}: ${cleanHeader(value)}`),
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    body,
    ...attachments,
    `--${mixedBoundary}--`,
    ""
  ].join("\r\n");
}

function signedSesHeaders(config: SesConfig, payload: string, now: Date) {
  const endpoint = new URL(config.endpoint);
  const amzDate = amzTimestamp(now);
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);
  const baseHeaders: Record<string, string> = {
    "content-type": "application/json",
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(config.sessionToken ? { "x-amz-security-token": config.sessionToken } : {})
  };
  const signedHeaders = Object.keys(baseHeaders).sort().join(";");
  const canonicalHeaders = Object.keys(baseHeaders)
    .sort()
    .map((key) => `${key}:${baseHeaders[key]}\n`)
    .join("");
  const canonicalRequest = ["POST", "/v2/email/outbound-emails", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${config.region}/ses/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, date, config.region)).update(stringToSign, "utf8").digest("hex");
  return {
    ...baseHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

async function sendWithSes(config: SesConfig, input: SendTransactionalEmailInput, fetchImpl: typeof fetch, now: Date, signal?: AbortSignal) {
  const endpoint = new URL(config.endpoint);
  const payload = JSON.stringify({
    FromEmailAddress: envelopeEmailAddress(input.from || ""),
    Destination: { ToAddresses: input.to },
    Content: { Raw: { Data: Buffer.from(buildRawEmail(input, now), "utf8").toString("base64") } }
  });
  const response = await fetchImpl(`${endpoint.origin}/v2/email/outbound-emails`, {
    method: "POST",
    headers: signedSesHeaders(config, payload, now),
    body: payload,
    signal
  });
  const json = await readJson(response);
  if (!response.ok) throw new AppError(jsonErrorMessage(json, "Amazon SES từ chối gửi email."), 502);
  const messageId = typeof (json as { MessageId?: unknown }).MessageId === "string" ? (json as { MessageId: string }).MessageId : null;
  return { provider: "ses" as const, providerMessageId: messageId, raw: json };
}

export async function sendTransactionalEmail(input: SendTransactionalEmailInput, options: SendEmailOptions = {}) {
  const env = options.env ?? process.env;
  const config = resolveEmailDeliveryConfig(env);
  if (!config) throw new AppError("Thiếu cấu hình provider gửi email transactional.", 500);
  if (!input.from?.trim()) throw new AppError("Thiếu địa chỉ gửi email.", 500);
  if (input.to.length === 0) throw new AppError("Thiếu người nhận email.", 400);
  if (!input.html && !input.text) throw new AppError("Thiếu nội dung email.", 400);
  if (categoryRequiresUnsubscribe(input) && !clean(input.unsubscribeUrl)) throw new AppError("Email marketing phải có unsubscribe URL.", 500);

  const suppressed = suppressedRecipients(env, input.to);
  if (suppressed.length) {
    const remaining = input.to.filter((recipient) => !suppressed.includes(recipient));
    if (remaining.length === 0) throw new AppError("Tất cả người nhận email đang nằm trong suppression list.", 409);
    input = { ...input, to: remaining };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  if (config.provider === "resend") return sendWithResend(config, input, fetchImpl, options.signal);
  return sendWithSes(config, input, fetchImpl, options.now ?? new Date(), options.signal);
}
