type SqsRecord = {
  messageId: string;
  body: string;
  attributes?: Record<string, string>;
  messageAttributes?: Record<string, unknown>;
};

type SqsEvent = {
  Records?: SqsRecord[];
};

type SqsBatchResponse = {
  batchItemFailures: Array<{ itemIdentifier: string }>;
};

type OperationalEvent = {
  eventId?: unknown;
  type?: unknown;
  tenantId?: unknown;
  restaurantId?: unknown;
  occurredAt?: unknown;
  [key: string]: unknown;
};

const defaultGatewayTimeoutMs = 8_000;

export async function handler(event: SqsEvent): Promise<SqsBatchResponse> {
  const records = event.Records ?? [];
  const failures: SqsBatchResponse["batchItemFailures"] = [];

  for (const record of records) {
    try {
      const payload = parseRecordBody(record.body);
      await forwardOperationalEvent(payload);
      console.info("operational event forwarded", {
        messageId: record.messageId,
        eventId: payload.eventId,
        type: payload.type
      });
    } catch (error) {
      failures.push({ itemIdentifier: record.messageId });
      console.error("operational event forward failed", {
        messageId: record.messageId,
        error: safeError(error)
      });
    }
  }

  return { batchItemFailures: failures };
}

function parseRecordBody(body: string): OperationalEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`invalid_json:${errorMessage(error)}`);
  }

  if (!parsed || typeof parsed !== "object") throw new Error("message_body_not_object");
  const payload = parsed as OperationalEvent;
  if (typeof payload.type !== "string" || !payload.type.trim()) throw new Error("event_type_required");
  if (typeof payload.eventId !== "string" || payload.eventId.length < 8) throw new Error("event_id_required");
  return payload;
}

async function forwardOperationalEvent(payload: OperationalEvent) {
  const gatewayUrl = clean(process.env.LOGIVN_API_INTERNAL_URL || process.env.LOGIVN_API_PUBLIC_URL);
  const internalKey = clean(process.env.LOGIVN_INTERNAL_API_KEY);
  if (!gatewayUrl) throw new Error("LOGIVN_API_INTERNAL_URL_required");
  if (!internalKey) throw new Error("LOGIVN_INTERNAL_API_KEY_required");

  const response = await fetch(new URL("/events", ensureTrailingSlash(gatewayUrl)), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(numberEnv("LOGIVN_GATEWAY_TIMEOUT_MS", defaultGatewayTimeoutMs))
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`gateway_rejected:${response.status}:${body.slice(0, 300)}`);
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}
