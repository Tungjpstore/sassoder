import { queueNames } from "./env.js";
import { createGauge } from "./metrics.js";
import { deadLetterQueueName, getQueue } from "./queues.js";

const queueJobsGauge = createGauge({
  name: "logivn_queue_jobs",
  help: "BullMQ jobs by queue and state",
  labelNames: ["queue", "state"]
});

const oldestWaitingGauge = createGauge({
  name: "logivn_queue_oldest_wait_seconds",
  help: "Age in seconds for the oldest waiting BullMQ job",
  labelNames: ["queue"]
});

const states = ["waiting", "active", "delayed", "failed", "completed", "paused"];

export function startQueueMetricsCollector(options = {}) {
  const { logger, intervalMs = 15_000 } = options;
  let stopped = false;

  async function collect() {
    const names = [...queueNames, ...queueNames.map(deadLetterQueueName)];
    await Promise.all(
      names.map(async (name) => {
        const queue = getQueue(name);
        const counts = await queue.getJobCounts(...states);

        for (const state of states) {
          queueJobsGauge.set({ queue: name, state }, counts[state] ?? 0);
        }

        const [oldestWaiting] = await queue.getWaiting(0, 0);
        const ageSeconds = oldestWaiting ? Math.max(0, (Date.now() - oldestWaiting.timestamp) / 1000) : 0;
        oldestWaitingGauge.set({ queue: name }, ageSeconds);
      })
    );
  }

  const tick = async () => {
    if (stopped) return;
    try {
      await collect();
    } catch (error) {
      logger?.warn({ error }, "queue metrics collection failed");
    }
  };

  void tick();
  const interval = setInterval(tick, intervalMs);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
