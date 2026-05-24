"use client";

import { useEffect, useRef, useState } from "react";
import { useCopilotChat } from "@copilotkit/react-core";
import { MessageRole, TextMessage } from "@copilotkit/runtime-client-gql";
import type { AiConversationReplayPayload } from "@/types/ai-history";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

export function useCopilotHistoryReplay({
  threadId,
  historyUrl,
  enabled = true,
  onRecovered
}: {
  threadId?: string | null;
  historyUrl?: string | null;
  enabled?: boolean;
  onRecovered?: (history: AiConversationReplayPayload) => void;
}) {
  const { appendMessage, reset, visibleMessages } = useCopilotChat();
  const visibleMessageCount = Array.isArray(visibleMessages) ? visibleMessages.length : 0;
  const replayedThreadRef = useRef<string | null>(null);
  const [isHydratingHistory, setIsHydratingHistory] = useState(false);
  const [hasRecoveredHistory, setHasRecoveredHistory] = useState(false);

  useEffect(() => {
    if (!enabled || !threadId || !historyUrl) return;

    const activeThreadId = threadId;
    const resolvedHistoryUrl = historyUrl;

    if (replayedThreadRef.current === activeThreadId) return;

    let cancelled = false;

    async function hydrateHistory() {
      setIsHydratingHistory(true);

      try {
        const response = await fetch(resolvedHistoryUrl, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ApiResponse<AiConversationReplayPayload> | null;
        const history = payload?.ok ? payload.data : null;

        if (!history || cancelled) return;

        const historyMessages = Array.isArray(history.messages) ? history.messages : [];

        onRecovered?.(history);
        replayedThreadRef.current = activeThreadId;
        setHasRecoveredHistory(historyMessages.length > 0 || Boolean(history.workflow));

        if (visibleMessageCount > 0 || historyMessages.length === 0) {
          return;
        }

        reset();

        for (const message of historyMessages) {
          await appendMessage(
            new TextMessage({
              role: message.role === "assistant" ? MessageRole.Assistant : MessageRole.User,
              content: message.content
            }),
            { followUp: false, clearSuggestions: false }
          );
        }
      } catch {
        replayedThreadRef.current = activeThreadId;
      } finally {
        if (!cancelled) setIsHydratingHistory(false);
      }
    }

    void hydrateHistory();

    return () => {
      cancelled = true;
    };
  }, [appendMessage, enabled, historyUrl, onRecovered, reset, threadId, visibleMessageCount]);

  return {
    isHydratingHistory,
    hasRecoveredHistory
  };
}
