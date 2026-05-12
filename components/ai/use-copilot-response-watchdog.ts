"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCopilotChat } from "@copilotkit/react-core";
import { MessageRole, TextMessage } from "@copilotkit/runtime-client-gql";

type WatchdogMessage = {
  id?: string;
  content: string;
};

type CopilotResponseWatchdogOptions = {
  enabled?: boolean;
  timeoutMs?: number;
  fallbackText: string | ((lastUserMessage: string) => string);
  onFallback?: (lastUserMessage: string) => void;
};

function getTextMessageContent(message: unknown) {
  const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
  const content = record?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.filter((item): item is string => typeof item === "string").join("").trim();
  return "";
}

function getTextMessageRole(message: unknown) {
  const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
  return typeof record?.role === "string" ? record.role : "";
}

function getTextMessageId(message: unknown) {
  const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
  return typeof record?.id === "string" ? record.id : undefined;
}

function findLastUserMessage(messages: unknown[]): WatchdogMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (getTextMessageRole(message) !== MessageRole.User) continue;
    const content = getTextMessageContent(message);
    if (content) return { id: getTextMessageId(message), content };
  }
  return null;
}

export function useCopilotResponseWatchdog({
  enabled = true,
  timeoutMs = 14_000,
  fallbackText,
  onFallback
}: CopilotResponseWatchdogOptions) {
  const { visibleMessages, isLoading, appendMessage, stopGeneration } = useCopilotChat();
  const handledKeyRef = useRef<string | null>(null);
  const safeVisibleMessages = useMemo(() => (Array.isArray(visibleMessages) ? visibleMessages : []), [visibleMessages]);

  const lastUserMessage = useMemo(() => findLastUserMessage(safeVisibleMessages), [safeVisibleMessages]);
  const lastVisibleRole = safeVisibleMessages.length ? getTextMessageRole(safeVisibleMessages[safeVisibleMessages.length - 1]) : "";

  const triggerFallback = useCallback(
    (messageKey: string, lastUserText: string, shouldStopGeneration: boolean) => {
      if (handledKeyRef.current === messageKey) return;
      handledKeyRef.current = messageKey;

      if (shouldStopGeneration) stopGeneration();
      onFallback?.(lastUserText);

      const text = typeof fallbackText === "function" ? fallbackText(lastUserText) : fallbackText;
      void appendMessage(
        new TextMessage({
          role: MessageRole.Assistant,
          content: text
        }),
        { followUp: false, clearSuggestions: false }
      );
    },
    [appendMessage, fallbackText, onFallback, stopGeneration]
  );

  useEffect(() => {
    if (!enabled || !isLoading || !lastUserMessage) return;

    const messageKey = `${lastUserMessage.id ?? lastUserMessage.content}:${safeVisibleMessages.length}`;
    const timeoutId = window.setTimeout(() => {
      triggerFallback(messageKey, lastUserMessage.content, true);
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [enabled, isLoading, lastUserMessage, timeoutMs, triggerFallback, safeVisibleMessages.length]);

  useEffect(() => {
    if (!enabled || isLoading || !lastUserMessage || lastVisibleRole !== MessageRole.User) return;

    const messageKey = `${lastUserMessage.id ?? lastUserMessage.content}:${safeVisibleMessages.length}`;
    const timeoutId = window.setTimeout(() => {
      triggerFallback(messageKey, lastUserMessage.content, false);
    }, 2_800);

    return () => window.clearTimeout(timeoutId);
  }, [enabled, isLoading, lastUserMessage, lastVisibleRole, triggerFallback, safeVisibleMessages.length]);
}
