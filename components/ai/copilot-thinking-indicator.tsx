"use client";

import { useEffect, useMemo, useState } from "react";
import { useCopilotChatInternal } from "@copilotkit/react-core";
import { MessageRole } from "@copilotkit/runtime-client-gql";
import { motion, AnimatePresence } from "framer-motion";

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
    "Đang phân tích ý định và bối cảnh hoạt động...",
    "Đang đọc dữ liệu ca, bàn và kho liên quan...",
    "Đang kích hoạt mô hình lập luận chuyên sâu MiMo Pro...",
    "Đang đối chiếu hiệu suất ca và rà soát rủi ro...",
    "Đang tổng hợp phương án tối ưu một chạm...",
    "Đang hoàn thiện phản hồi chi tiết cho chủ quán..."
  ],
  customer: [
    "Đã nhận câu hỏi của khách...",
    "Đang xem menu, giỏ hàng và trạng thái hiện tại...",
    "Đang đối chiếu món ăn và khơi gợi hương vị...",
    "Đang hoàn thiện gợi ý nhanh kèm nút đặt món..."
  ],
  onboarding: [
    "Đã nhận yêu cầu cấu hình...",
    "Đang đối chiếu tiến độ onboarding của quán...",
    "Đang chuẩn bị lộ trình setup 30 phút tối ưu...",
    "Đang kiểm tra blocker kết nối ngân hàng/VietQR..."
  ],
  platform: [
    "Đã nhận yêu cầu vận hành...",
    "Đang quét thông số hệ thống và phân quyền...",
    "Đang chuẩn bị danh sách hành động quản trị an toàn...",
    "Đang hoàn tất phân tích trạng thái platform..."
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
  
  // Calculate phase based on elapsed time (e.g. change every 3 seconds)
  const phaseDurationMs = 3000;
  const phaseIndex = Math.min(Math.floor(elapsed / phaseDurationMs), copy.length - 1);
  const isReasoningActive = (surface === "dashboard" || surface === "platform") && elapsed > 4500;

  return (
    <div className={`logibot-thinking-indicator logibot-thinking-indicator--${surface} flex items-center justify-between gap-3 px-4 py-3`} role="status" aria-live="polite">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="logibot-thinking-orb shrink-0" aria-hidden="true">
          <span className="logibot-typing-bars" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-[var(--primary)]">
            LogiBot đang nghiên cứu
          </span>
          <div className="relative mt-0.5 h-4 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={phaseIndex}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 block truncate text-xs font-semibold text-[var(--muted-foreground)]"
              >
                {copy[phaseIndex]}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {isReasoningActive && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-2.5 py-1 text-[10px] font-bold text-amber-300 border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.15)] animate-pulse"
          >
            <svg className="animate-spin h-2.5 w-2.5 text-amber-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            MiMo Reasoning
          </motion.span>
        )}
      </AnimatePresence>
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
