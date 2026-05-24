import client from "prom-client";

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export function metricsRegistry() {
  return registry;
}

export function createCounter(config) {
  const counter = new client.Counter({ ...config, registers: [registry] });
  return counter;
}

export function createHistogram(config) {
  const histogram = new client.Histogram({ ...config, registers: [registry] });
  return histogram;
}

export function createGauge(config) {
  const gauge = new client.Gauge({ ...config, registers: [registry] });
  return gauge;
}
