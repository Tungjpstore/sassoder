import assert from "node:assert/strict";
import test from "node:test";
import { getAiFutureCapabilities, isAiFutureCapabilityEnabled } from "./future-capabilities";

test("getAiFutureCapabilities keeps voice and vision disabled by default", () => {
  const capabilities = getAiFutureCapabilities({});

  assert.equal(capabilities.every((capability) => capability.status === "disabled"), true);
  assert.equal(isAiFutureCapabilityEnabled("voice_ordering", {}), false);
});

test("getAiFutureCapabilities supports preview and ready flags", () => {
  const capabilities = getAiFutureCapabilities({
    AI_VOICE_ORDERING_ENABLED: "preview",
    AI_VISION_KITCHEN_QUEUE_ENABLED: "true"
  });

  assert.equal(capabilities.find((capability) => capability.key === "voice_ordering")?.status, "preview");
  assert.equal(capabilities.find((capability) => capability.key === "vision_kitchen_queue")?.status, "ready");
  assert.equal(isAiFutureCapabilityEnabled("vision_kitchen_queue", { AI_VISION_KITCHEN_QUEUE_ENABLED: "true" }), true);
});
