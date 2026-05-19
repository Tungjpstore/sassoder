"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCopilotChatInternal } from "@copilotkit/react-core";
import { MessageRole, TextMessage } from "@copilotkit/runtime-client-gql";

type WatchdogMessage = {
  id?: string;
  content: string;
  index: number;
};

type CopilotResponseWatchdogOptions = {
  enabled?: boolean;
  timeoutMs?: number;
  fallbackText: string | ((lastUserMessage: string) => string);
  onFallback?: (lastUserMessage: string) => void | string | null | Promise<void | string | null>;
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
    if (content) return { id: getTextMessageId(message), content, index };
  }
  return null;
}

function hasVisibleAssistantResponse(message: unknown) {
  const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
  if (!record || getTextMessageRole(message) !== MessageRole.Assistant) return false;
  if (getTextMessageContent(message)) return true;
  if (typeof record.generativeUI === "function") return true;
  const toolCalls = record.toolCalls;
  return Array.isArray(toolCalls) && toolCalls.length > 0;
}

function hasAssistantResponseAfter(messages: unknown[], index: number) {
  return messages.slice(index + 1).some((message) => {
    return hasVisibleAssistantResponse(message);
  });
}

export function useCopilotResponseWatchdog({
  enabled = true,
  timeoutMs = 14_000,
  fallbackText,
  onFallback
}: CopilotResponseWatchdogOptions) {
  const { messages, isLoading, appendMessage, stopGeneration } = useCopilotChatInternal();
  const handledKeyRef = useRef<string | null>(null);
  const safeVisibleMessages = useMemo(() => (Array.isArray(messages) ? messages : []), [messages]);

  const lastUserMessage = useMemo(() => findLastUserMessage(safeVisibleMessages), [safeVisibleMessages]);
  const hasAnswerAfterLastUser = useMemo(
    () => (lastUserMessage ? hasAssistantResponseAfter(safeVisibleMessages, lastUserMessage.index) : false),
    [lastUserMessage, safeVisibleMessages]
  );

  const triggerFallback = useCallback(
    async (messageKey: string, lastUserText: string, shouldStopGeneration: boolean) => {
      if (handledKeyRef.current === messageKey) return;
      handledKeyRef.current = messageKey;

      if (shouldStopGeneration) stopGeneration();
      let overrideText: string | null | void = null;
      try {
        overrideText = await onFallback?.(lastUserText);
      } catch {
        overrideText = null;
      }

      const text =
        typeof overrideText === "string" && overrideText.trim()
          ? overrideText.trim()
          : typeof fallbackText === "function"
            ? fallbackText(lastUserText)
            : fallbackText;
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
      void triggerFallback(messageKey, lastUserMessage.content, true);
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [enabled, isLoading, lastUserMessage, timeoutMs, triggerFallback, safeVisibleMessages.length]);

  useEffect(() => {
    if (!enabled || isLoading || !lastUserMessage || hasAnswerAfterLastUser) return;

    const messageKey = `${lastUserMessage.id ?? lastUserMessage.content}:${safeVisibleMessages.length}`;
    const timeoutId = window.setTimeout(() => {
      void triggerFallback(messageKey, lastUserMessage.content, false);
    }, 2_800);

    return () => window.clearTimeout(timeoutId);
  }, [enabled, hasAnswerAfterLastUser, isLoading, lastUserMessage, triggerFallback, safeVisibleMessages.length]);
}
