"use client";

import { useEffect, useMemo, useState } from "react";
import { useCopilotChatInternal } from "@copilotkit/react-core";
import { MessageRole } from "@copilotkit/runtime-client-gql";

type CopilotThinkingSurface = "dashboard" | "customer" | "onboarding" | "platform";

type WatchMessage = {
  id?: string;
  content: string;
  index: number;
};

type CopilotThinkingIndicatorProps = {
  enabled?: boolean;
  surface?: CopilotThinkingSurface;
};

const thinkingCopy: Record<CopilotThinkingSurface, string[]> = {
  dashboard: [
    "Đã nhận câu hỏi, đang hiểu đúng ý chủ quán...",
    "Đang đọc dữ liệu ca và khu vực liên quan...",
    "Đang dựng câu trả lời kèm bước thao tác rõ ràng...",
    "Hơi lâu hơn bình thường, LogiBot vẫn giữ lượt hỏi và sẽ tự phục hồi nếu cần."
  ],
  customer: [
    "Đã nhận câu hỏi của khách...",
    "Đang xem menu, giỏ hàng và trạng thái hiện tại...",
    "Đang chọn câu trả lời ngắn nhất kèm nút thao tác...",
    "Mạng hơi chậm, LogiBot vẫn đang xử lý để không mất lượt hỏi."
  ],
  onboarding: [
    "Đã nhận yêu cầu setup...",
    "Đang đối chiếu bước onboarding hiện tại...",
    "Đang chuẩn bị gợi ý có thể áp dụng ngay...",
    "Hơi lâu hơn bình thường, LogiBot vẫn giữ tiến trình setup."
  ],
  platform: [
    "Đã nhận yêu cầu platform...",
    "Đang rà soát khu vực admin liên quan...",
    "Đang chuẩn bị checklist và shortcut an toàn...",
    "Hơi lâu hơn bình thường, LogiBot vẫn giữ lượt phân tích."
  ]
};

function getMessageContent(message: unknown) {
  const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
  const content = record?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function getMessageRole(message: unknown) {
  const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
  return typeof record?.role === "string" ? record.role : "";
}

function getMessageId(message: unknown) {
  const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
  return typeof record?.id === "string" ? record.id : undefined;
}

function findLastUser(messages: unknown[]): WatchMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (getMessageRole(message) !== MessageRole.User) continue;
    const content = getMessageContent(message);
    if (content) return { id: getMessageId(message), content, index };
  }
  return null;
}

function hasVisibleAssistantResponse(message: unknown) {
  const record = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
  if (!record || getMessageRole(message) !== MessageRole.Assistant) return false;
  if (getMessageContent(message)) return true;
  if (typeof record.generativeUI === "function") return true;
  const toolCalls = record.toolCalls;
  return Array.isArray(toolCalls) && toolCalls.length > 0;
}

function hasAssistantResponseAfter(messages: unknown[], index: number) {
  return messages.slice(index + 1).some((message) => hasVisibleAssistantResponse(message));
}

function CopilotThinkingTicker({ surface }: { surface: CopilotThinkingSurface }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => setElapsed((current) => current + 700), 700);
    return () => window.clearInterval(intervalId);
  }, []);

  const copy = thinkingCopy[surface];
  const phaseIndex = elapsed > 10_000 ? 3 : elapsed > 5_200 ? 2 : elapsed > 1_600 ? 1 : 0;

  return (
    <div className={`logibot-thinking-indicator logibot-thinking-indicator--${surface}`} role="status" aria-live="polite">
      <span className="logibot-thinking-orb" aria-hidden="true">
        <span className="logibot-typing-bars" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">LogiBot đang nghiên cứu</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted-foreground)]">{copy[phaseIndex]}</span>
      </span>
    </div>
  );
}

export function CopilotThinkingIndicator({ enabled = true, surface = "dashboard" }: CopilotThinkingIndicatorProps) {
  const { messages, isLoading } = useCopilotChatInternal();
  const safeMessages = useMemo(() => (Array.isArray(messages) ? messages : []), [messages]);
  const lastUserMessage = useMemo(() => findLastUser(safeMessages), [safeMessages]);
  const hasAnswerAfterLastUser = useMemo(
    () => (lastUserMessage ? hasAssistantResponseAfter(safeMessages, lastUserMessage.index) : false),
    [lastUserMessage, safeMessages]
  );
  const pendingKey =
    enabled && isLoading && lastUserMessage && !hasAnswerAfterLastUser
      ? `${lastUserMessage.id ?? lastUserMessage.content}:${lastUserMessage.index}`
      : null;
  if (!pendingKey) return null;

  return <CopilotThinkingTicker key={pendingKey} surface={surface} />;
}
