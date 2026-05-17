import assert from "node:assert/strict";
import test from "node:test";
import { buildAiApplyLayerDeck } from "@/lib/ai/apply-layer";
import type { AiExecutionCenterDeck } from "@/lib/ai/execution-center";
import type { AiFutureCapability } from "@/lib/ai/future-capabilities";
import { buildAiProductionReadinessDeck } from "@/lib/ai/production-readiness";
import type { AiProviderReadiness } from "@/lib/ai/router/types";

function provider(configured: boolean): AiProviderReadiness {
  return {
    provider: configured ? "openai" : "gemini",
    configured,
    protocol: "openai-compatible",
    envNames: ["OPENAI_API_KEY"],
    missingEnvNames: configured ? [] : ["OPENAI_API_KEY"],
    chatModel: "gpt-4.1-mini",
    fastModel: "gpt-4.1-nano",
    imageModel: "gpt-image-1",
    ocrModel: "gpt-4.1-mini",
    supportsJsonMode: configured,
    supportsToolCalling: configured,
    supportsImageGeneration: configured,
    supportsOcr: configured,
    priority: 20
  };
}

function schemas(ready: boolean) {
  return {
    ready,
    checks: [
      { key: "recommendations", table: "ai_recommendations", label: "AI recommendations", ready },
      { key: "automationRuns", table: "ai_automation_runs", label: "AI automation runs", ready },
      { key: "restaurantMemories", table: "ai_restaurant_memories", label: "AI restaurant memories", ready }
    ]
  };
}

function futureCapabilities(enabled = false): AiFutureCapability[] {
  return [
    {
      key: "voice_ordering",
      label: "AI voice ordering",
      status: enabled ? "ready" : "disabled",
      enabled,
      envName: "AI_VOICE_ORDERING_ENABLED",
      safetyMode: "confirm_first",
      dataScope: "Menu public and order confirmation only."
    }
  ];
}

function executionDeck(): AiExecutionCenterDeck {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: 1,
      pending: 1,
      approved: 0,
      manual: 0,
      completed: 0,
      blocked: 0,
      critical: 0,
      confirmFirst: 1
    },
    items: [
      {
        id: "recommendation:combo",
        kind: "recommendation",
        domain: "menu",
        title: "Tạo combo trà đào",
        detail: "Trà đào có reorder tốt.",
        action: "Mở menu để tạo combo.",
        actionHref: "/dashboard/menu",
        priority: "high",
        status: "pending",
        safetyMode: "confirm_first",
        estimatedImpact: "Tăng AOV",
        source: "AI Ops recommendation",
        blockers: []
      }
    ],
    lanes: [],
    runbook: []
  };
}

test("buildAiProductionReadinessDeck blocks production when provider and schemas are missing", () => {
  const execution = executionDeck();
  const deck = buildAiProductionReadinessDeck({
    providers: [provider(false)],
    schemas: schemas(false),
    futureCapabilities: futureCapabilities(),
    executionDeck: execution,
    applyDeck: buildAiApplyLayerDeck(execution)
  });

  assert.equal(deck.summary.status, "blocked");
  assert.equal(deck.summary.blockers >= 2, true);
  assert.equal(deck.releaseChecklist.find((item) => item.id === "provider")?.done, false);
});

test("buildAiProductionReadinessDeck becomes watch-ready with provider schemas and confirm-first queue", () => {
  const execution = executionDeck();
  const deck = buildAiProductionReadinessDeck({
    providers: [provider(true)],
    schemas: schemas(true),
    futureCapabilities: futureCapabilities(),
    executionDeck: execution,
    applyDeck: buildAiApplyLayerDeck(execution)
  });

  assert.notEqual(deck.summary.status, "blocked");
  assert.equal(deck.summary.configuredProviders, 1);
  assert.equal(deck.summary.readySchemas, 3);
  assert.equal(deck.securityGuardrails.some((guardrail) => guardrail.id === "no-financial-hallucination"), true);
});

test("buildAiProductionReadinessDeck warns when future voice or vision is enabled", () => {
  const execution = executionDeck();
  const deck = buildAiProductionReadinessDeck({
    providers: [provider(true), { ...provider(true), provider: "gemini", priority: 30 }],
    schemas: schemas(true),
    futureCapabilities: futureCapabilities(true),
    executionDeck: execution,
    applyDeck: buildAiApplyLayerDeck(execution)
  });

  assert.equal(deck.summary.futureEnabled, 1);
  assert.equal(deck.checks.some((check) => check.id === "future-voice_ordering" && check.severity === "warn"), true);
  assert.equal(deck.securityGuardrails.find((guardrail) => guardrail.id === "future-consent")?.status, "preview");
});
