import { readEnv, numberEnv } from "../shared/env.js";
import { deleteSqsMessage, receiveSqsMessages, resolveAwsSqsConfig, type AwsSqsMessage } from "../shared/aws-sqs.mjs";
import { publishOperationalEvent } from "../shared/queues.js";

type SqsConsumerState = {
  enabled: boolean;
  configured: boolean;
  running: boolean;
  stopping: boolean;
  queueName: string | null;
  lastPollAt: string | null;
  lastError: string | null;
  processed: number;
  failed: number;
  discarded: number;
};

type SqsConsumerController = {
  state: SqsConsumerState;
  stop: () => void;
};

export function startSqsOperationalEventConsumer({ logger }: { logger: any }): SqsConsumerController {
  const enabled = readEnv("OPERATIONAL_EVENT_SQS_CONSUMER_ENABLED", "false") === "true";
  const config = resolveAwsSqsConfig();
  const state: SqsConsumerState = {
    enabled,
    configured: Boolean(config),
    running: false,
    stopping: false,
    queueName: config?.queueName ?? null,
    lastPollAt: null,
    lastError: null,
    processed: 0,
    failed: 0,
    discarded: 0
  };
  let timer: ReturnType<typeof setTimeout> | null = null;

  if (!enabled) {
    logger.info("SQS operational event consumer disabled");
    return { state, stop: () => undefined };
  }

  if (!config) {
    logger.warn("SQS operational event consumer skipped: missing SQS queue config");
    return { state, stop: () => undefined };
  }

  const schedule = (delayMs: number) => {
    if (state.stopping) return;
    timer = setTimeout(() => {
      void pollOnce().catch((error) => {
        state.failed += 1;
        state.lastError = errorMessage(error);
        logger.error({ error: safeLogError(error) }, "SQS operational event poll failed");
        schedule(numberEnv("OPERATIONAL_EVENT_SQS_ERROR_BACKOFF_MS", 5000));
      });
    }, delayMs);
    timer.unref?.();
  };

  const pollOnce = async () => {
    if (state.running || state.stopping) return;
    state.running = true;
    state.lastPollAt = new Date().toISOString();
    try {
      const batch = await receiveSqsMessages({
        maxNumberOfMessages: numberEnv("OPERATIONAL_EVENT_SQS_MAX_MESSAGES", 10),
        waitTimeSeconds: numberEnv("OPERATIONAL_EVENT_SQS_WAIT_SECONDS", 20),
        visibilityTimeoutSeconds: numberEnv("OPERATIONAL_EVENT_SQS_VISIBILITY_SECONDS", 90)
      });
      state.queueName = batch.queueName;
      state.lastError = null;

      for (const message of batch.messages) {
        if (state.stopping) break;
        await processMessage(message, state, logger);
      }
    } finally {
      state.running = false;
      schedule(numberEnv("OPERATIONAL_EVENT_SQS_POLL_DELAY_MS", 1000));
    }
  };

  schedule(0);
  logger.info({ queueName: config.queueName }, "SQS operational event consumer started");

  return {
    state,
    stop: () => {
      state.stopping = true;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

async function processMessage(message: AwsSqsMessage, state: SqsConsumerState, logger: any) {
  try {
    const event = parseMessageBody(message.body);
    const jobs = await publishOperationalEvent(event);
    await deleteSqsMessage(message.receiptHandle);
    state.processed += 1;
    logger.info({ messageId: message.messageId, eventId: event.eventId, type: event.type, jobs: jobs.length }, "SQS operational event published");
  } catch (error) {
    if (isPermanentMessageError(error)) {
      await deleteSqsMessage(message.receiptHandle);
      state.discarded += 1;
      logger.error({ messageId: message.messageId, error: safeLogError(error) }, "SQS operational event discarded");
      return;
    }

    state.failed += 1;
    state.lastError = errorMessage(error);
    logger.error({ messageId: message.messageId, error: safeLogError(error) }, "SQS operational event failed; leaving message for retry");
  }
}

function parseMessageBody(body: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new PermanentSqsMessageError(`invalid_json:${errorMessage(error)}`);
  }

  if (!parsed || typeof parsed !== "object") throw new PermanentSqsMessageError("message_body_not_object");
  const event = parsed as Record<string, unknown>;
  if (typeof event.type !== "string" || !event.type) throw new PermanentSqsMessageError("event_type_required");
  if (typeof event.eventId !== "string" || event.eventId.length < 8) throw new PermanentSqsMessageError("event_id_required");
  return event;
}

class PermanentSqsMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentSqsMessageError";
  }
}

function isPermanentMessageError(error: unknown) {
  if (error instanceof PermanentSqsMessageError) return true;
  const message = errorMessage(error);
  return message.includes("Unsupported operational event") || message.includes("must include tenantId") || message.includes("Queue jobs must include tenantId");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeLogError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}
