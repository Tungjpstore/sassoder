type OperationalEventInput = {
  event: string;
  area: "ai" | "audit" | "billing" | "entitlement" | "payment";
  restaurantId?: string | null;
  status?: "success" | "warn" | "error";
  latencyMs?: number;
  metadata?: Record<string, unknown>;
};

export function writeOperationalEvent(input: OperationalEventInput) {
  const payload = {
    ts: new Date().toISOString(),
    service: "logivn",
    status: input.status ?? "success",
    area: input.area,
    event: input.event,
    restaurantId: input.restaurantId ?? null,
    latencyMs: input.latencyMs,
    metadata: input.metadata ?? {}
  };

  const line = JSON.stringify(payload);
  if (payload.status === "error") console.error("[logivn-observability]", line);
  else if (payload.status === "warn") console.warn("[logivn-observability]", line);
  else console.info("[logivn-observability]", line);
}
