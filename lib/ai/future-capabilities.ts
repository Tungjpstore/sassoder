export type AiFutureCapabilityKey =
  | "voice_ordering"
  | "phone_reservation"
  | "vision_table_analytics"
  | "vision_kitchen_queue";

export type AiFutureCapability = {
  key: AiFutureCapabilityKey;
  label: string;
  status: "disabled" | "preview" | "ready";
  enabled: boolean;
  envName: string;
  safetyMode: "manual_only" | "confirm_first";
  dataScope: string;
};

const capabilityDefinitions: Array<Omit<AiFutureCapability, "enabled" | "status">> = [
  {
    key: "voice_ordering",
    label: "AI voice ordering",
    envName: "AI_VOICE_ORDERING_ENABLED",
    safetyMode: "confirm_first",
    dataScope: "Menu public, cart session, allergy notes and order confirmation only."
  },
  {
    key: "phone_reservation",
    label: "AI phone reservation",
    envName: "AI_PHONE_RESERVATION_ENABLED",
    safetyMode: "confirm_first",
    dataScope: "Opening hours, reservation slots, customer phone and reservation status."
  },
  {
    key: "vision_table_analytics",
    label: "AI table vision analytics",
    envName: "AI_VISION_TABLE_ANALYTICS_ENABLED",
    safetyMode: "manual_only",
    dataScope: "Aggregated table occupancy signals; no face recognition or identity inference."
  },
  {
    key: "vision_kitchen_queue",
    label: "AI kitchen queue vision",
    envName: "AI_VISION_KITCHEN_QUEUE_ENABLED",
    safetyMode: "manual_only",
    dataScope: "Kitchen queue timing and item readiness signals; no biometric identification."
  }
];

function envEnabled(name: string, env: Record<string, string | undefined>) {
  const value = env[name]?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "preview";
}

function envStatus(name: string, env: Record<string, string | undefined>): AiFutureCapability["status"] {
  const value = env[name]?.trim().toLowerCase();
  if (value === "true" || value === "1") return "ready";
  if (value === "preview") return "preview";
  return "disabled";
}

export function getAiFutureCapabilities(env: Record<string, string | undefined> = process.env): AiFutureCapability[] {
  return capabilityDefinitions.map((definition) => ({
    ...definition,
    enabled: envEnabled(definition.envName, env),
    status: envStatus(definition.envName, env)
  }));
}

export function isAiFutureCapabilityEnabled(key: AiFutureCapabilityKey, env: Record<string, string | undefined> = process.env) {
  return getAiFutureCapabilities(env).find((capability) => capability.key === key)?.enabled ?? false;
}
