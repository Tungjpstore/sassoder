import { Queue } from "bullmq";
import { queueNames } from "./env.js";
import { createRedisConnection } from "./redis.js";

const queueConnection = createRedisConnection("logivn-queue-client");
const queues = new Map();

export function getQueue(name) {
  if (!queueNames.includes(name)) {
    throw new Error(`Unsupported queue: ${name}`);
  }

  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: queueConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 604_800, count: 5000 }
        }
      })
    );
  }

  return queues.get(name);
}

export async function enqueueJob({ queueName, name, data, opts = {} }) {
  const queue = getQueue(queueName);
  return queue.add(name, data, opts);
}

export async function queueSummary() {
  const entries = await Promise.all(
    queueNames.map(async (name) => {
      const queue = getQueue(name);
      const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused");
      return [name, counts];
    })
  );
  return Object.fromEntries(entries);
}
