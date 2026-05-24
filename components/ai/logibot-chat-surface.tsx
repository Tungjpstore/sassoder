"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Command,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Play,
  ShieldCheck,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";
import { LogibotComposer, type LogibotAttachmentDraft } from "@/components/ai/logibot-composer";

const logibotOperatorIcon = "/brand/logivn/logibot-icons/operator.png";

type LogibotMessageResult = {
  actions?: AiAgentAction[];
  agentPlan?: AiAgentPlan;
  suggestions?: string[];
  intentLabel?: string;
} | null;

export type LogibotChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  attachmentLabel?: string;
  result?: LogibotMessageResult;
};

export type LogibotChatQuickAction = {
  label: string;
  prompt: string;
};

export type LogibotChatSurfaceProps = {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  statusText?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  composerPlaceholder?: string;
  composerDisclaimer?: string | null;
  variant?: "workspace" | "drawer";
  className?: string;
  messages: LogibotChatMessage[];
  draft: string;
  isSending: boolean;
  quickActions?: LogibotChatQuickAction[];
  workflowStatus?: string;
  workflowSummary?: string | null;
  activeActionCount?: number;
  isExpanded?: boolean;
  canExpand?: boolean;
  canClose?: boolean;
  onDraftChange: (value: string) => void;
  onSend: (message: string, attachments?: LogibotAttachmentDraft[]) => Promise<void> | void;
  onAction: (action: AiAgentAction) => Promise<string | void>;
  onCommand?: () => void;
  onNewChat?: () => void;
  onClose?: () => void;
  onToggleExpand?: () => void;
};

function actionSafetyLabel(action: AiAgentAction) {
  if (action.safety === "manual_only") return "Cần kiểm tra";
  if (action.safety === "confirm") return "Cần xác nhận";
  return "An toàn";
}

function requiresApproval(action: AiAgentAction) {
  return action.type !== "link" && (action.safety === "manual_only" || action.safety === "confirm");
}

function LogibotMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-2xl border border-[#0F5132]/10 bg-[#F8F7F4] shadow-[0_12px_30px_rgba(17,24,39,0.08)]",
        size === "sm" ? "h-8 w-8 rounded-xl" : size === "lg" ? "h-14 w-14" : "h-10 w-10"
      )}
    >
      <Image src={logibotOperatorIcon} alt="LogiBot" fill sizes={size === "lg" ? "56px" : size === "sm" ? "32px" : "40px"} className="object-cover" />
    </span>
  );
}

function HeaderIconButton({
  label,
  children,
  onClick
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-2xl border border-[#111827]/[0.08] bg-white/72 px-3 text-xs font-semibold text-[#4B5563] shadow-[0_8px_22px_rgba(17,24,39,0.045)] transition hover:border-[#0F5132]/25 hover:bg-white hover:text-[#0F5132] active:scale-[0.98]"
      aria-label={label}
      title={label}
    >
      {children}
      <span className="hidden 2xl:inline">{label}</span>
    </button>
  );
}

function MessageText({ children }: { children: string }) {
  const [expanded, setExpanded] = useState(false);
  const compactText = children.length > 900 ? `${children.slice(0, 900).trim()}...` : children;
  const shouldClamp = children.length > 900;

  return (
    <div className="min-w-0">
      <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-7 text-[#151B23]">
        {shouldClamp && !expanded ? compactText : children}
      </p>
      {shouldClamp ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 inline-flex h-8 items-center rounded-lg px-2 text-xs font-bold text-[#0F5132] transition hover:bg-[#0F5132]/[0.06]"
        >
          {expanded ? "Thu gọn" : "Xem đầy đủ"}
        </button>
      ) : null}
    </div>
  );
}

function LogibotActionButton({
  action,
  onAction
}: {
  action: AiAgentAction;
  onAction: (action: AiAgentAction) => Promise<string | void>;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const primary = action.priority === "primary";

  async function run() {
    if (pending) return;
    if (requiresApproval(action) && !confirming) {
      setConfirming(true);
      return;
    }

    setPending(true);
    setFeedback(null);
    try {
      const result = await onAction(action);
      setFeedback(result || "Đã xử lý action.");
      setConfirming(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Action chưa chạy được.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#111827]/[0.07] bg-[#FFFEFA]/78 p-2 shadow-[0_10px_30px_rgba(17,24,39,0.045)]">
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left transition disabled:cursor-wait disabled:opacity-60",
          primary
            ? "border-[#0F5132] bg-[#0F5132] text-[#FFFEFA] shadow-[0_12px_28px_rgba(15,81,50,0.18)] hover:bg-[#0B3D27]"
            : "border-[#111827]/[0.07] bg-white/70 text-[#111827] hover:border-[#0F5132]/25 hover:bg-white"
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{action.label}</span>
          <span className={cn("mt-0.5 flex items-center gap-1 text-[11px] font-semibold", primary ? "text-white/72" : "text-[#6B7280]")}>
            <ShieldCheck size={12} />
            {actionSafetyLabel(action)}
          </span>
        </span>
        {pending ? <Loader2 size={16} className="shrink-0 animate-spin" /> : action.type === "link" ? <ArrowRight size={16} className="shrink-0" /> : <Play size={16} className="shrink-0" />}
      </button>
      <AnimatePresence initial={false}>
        {confirming ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/[0.08] p-2 text-xs font-semibold leading-5 text-[#7A4A05]"
          >
            Action này cần bạn xác nhận. Bấm lại để chạy.
          </motion.div>
        ) : null}
        {feedback ? (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 text-xs font-semibold leading-5 text-[#0F5132]"
          >
            {feedback}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function LogibotMessageRow({
  message,
  onAction
}: {
  message: LogibotChatMessage;
  onAction: (action: AiAgentAction) => Promise<string | void>;
}) {
  const actions = message.result?.actions?.slice(0, 3) ?? [];

  if (message.role === "user") {
    return (
      <motion.article
        initial={{ opacity: 0, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="ml-auto flex w-fit max-w-[min(760px,88%)] flex-col items-end gap-1"
      >
        {message.attachmentLabel ? (
          <span className="mr-1 rounded-full border border-[#0F5132]/12 bg-[#0F5132]/[0.055] px-2.5 py-1 text-[11px] font-bold text-[#0F5132]">
            File: {message.attachmentLabel}
          </span>
        ) : null}
        <div className="rounded-2xl rounded-br-md bg-[#111827] px-4 py-3 text-[15px] font-medium leading-6 text-white shadow-[0_14px_34px_rgba(17,24,39,0.16)]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </motion.article>
    );
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="grid max-w-[880px] grid-cols-[32px_minmax(0,1fr)] gap-3"
    >
      <span className="mt-1"><LogibotMark size="sm" /></span>
      <div className="min-w-0">
        <div className="rounded-2xl rounded-tl-md border border-[#111827]/[0.07] bg-[#FFFEFA]/84 px-4 py-3 shadow-[0_16px_44px_rgba(17,24,39,0.055)]">
          <MessageText>{message.content}</MessageText>
        </div>
        {actions.length ? (
          <div className="mt-2 grid gap-2 sm:max-w-[620px]">
            {actions.map((action) => (
              <LogibotActionButton key={action.id} action={action} onAction={onAction} />
            ))}
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}

function ThinkingState() {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid max-w-[580px] grid-cols-[32px_minmax(0,1fr)] gap-3"
    >
      <span className="mt-1"><LogibotMark size="sm" /></span>
      <div className="rounded-2xl rounded-tl-md border border-[#111827]/[0.07] bg-[#FFFEFA]/82 px-4 py-3 shadow-[0_16px_44px_rgba(17,24,39,0.05)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#0F5132]">LogiBot đang suy nghĩ</span>
          <span className="flex items-center gap-1">
            {[0, 1, 2].map((index) => (
              <motion.span
                key={index}
                animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                transition={{ duration: 1.05, repeat: Infinity, delay: index * 0.16 }}
                className="h-1.5 w-1.5 rounded-full bg-[#0F5132]"
              />
            ))}
          </span>
        </div>
      </div>
    </motion.article>
  );
}

function EmptyState({
  quickActions,
  title,
  description,
  onSend
}: {
  quickActions: LogibotChatQuickAction[];
  title: string;
  description: string;
  onSend: (message: string) => Promise<void> | void;
}) {
  return (
    <section className="grid min-h-full place-items-center px-4 py-8 text-center">
      <div className="w-full max-w-[620px]">
        <span className="mx-auto inline-flex"><LogibotMark size="lg" /></span>
        <h2 className="mx-auto mt-5 max-w-[540px] text-balance text-2xl font-semibold tracking-[-0.01em] text-[#111827] sm:text-3xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-[500px] text-sm font-medium leading-6 text-[#6B7280]">
          {description}
        </p>
        <div className="mx-auto mt-6 flex max-w-[560px] flex-wrap justify-center gap-2">
          {quickActions.slice(0, 4).map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => void onSend(item.prompt)}
              className="min-h-10 rounded-2xl border border-[#111827]/[0.07] bg-[#FFFEFA]/82 px-3.5 text-xs font-bold text-[#151B23] shadow-[0_10px_26px_rgba(17,24,39,0.045)] transition hover:-translate-y-0.5 hover:border-[#0F5132]/25 hover:bg-white hover:shadow-[0_14px_34px_rgba(17,24,39,0.07)]"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LogibotChatSurface({
  title = "LogiBot",
  subtitle = "AI vận hành quán",
  eyebrow = "AI operator",
  statusText = "Sẵn sàng",
  emptyTitle = "LogiBot sẵn sàng vận hành cùng bạn.",
  emptyDescription = "Hỏi, nói bằng giọng nói, hoặc tải menu/hóa đơn. LogiBot chỉ hiển thị dữ liệu sau khi bạn ra lệnh.",
  composerPlaceholder = "Hỏi LogiBot về quán của bạn…",
  composerDisclaimer = "File ảnh menu/hóa đơn sẽ được đọc bằng AI khi câu hỏi liên quan đến menu hoặc kho.",
  variant = "workspace",
  className,
  messages,
  draft,
  isSending,
  quickActions = [],
  workflowStatus,
  workflowSummary,
  activeActionCount = 0,
  isExpanded = false,
  canExpand = false,
  canClose = false,
  onDraftChange,
  onSend,
  onAction,
  onCommand,
  onNewChat,
  onClose,
  onToggleExpand
}: LogibotChatSurfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasConversation = messages.length > 0 || isSending;
  const compactWorkflowSummary = useMemo(() => workflowSummary?.trim() || null, [workflowSummary]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length, isSending]);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-[#FFFEFA] text-[#111827]",
        variant === "drawer" ? "h-full rounded-[24px] sm:rounded-[28px]" : "h-full rounded-[24px]",
        className
      )}
    >
      <header className="shrink-0 border-b border-[#111827]/[0.06] bg-[#FFFEFA]/86 px-3 py-3 backdrop-blur-2xl sm:px-4">
        <div className="flex min-h-12 items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-3">
            <LogibotMark />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0F5132]">{eyebrow}</span>
                <span className="hidden h-1.5 w-1.5 rounded-full bg-[#F59E0B] sm:inline-block" />
                <span className="hidden truncate text-[11px] font-semibold text-[#6B7280] sm:inline">{statusText}</span>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <h2 className="truncate text-base font-semibold tracking-[-0.01em] text-[#111827] sm:text-lg">{title}</h2>
                <span className="hidden max-w-[220px] truncate text-xs font-medium text-[#6B7280] sm:inline">{subtitle}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onNewChat ? (
              <HeaderIconButton label="Chat mới" onClick={onNewChat}>
                <MessageSquarePlus size={17} />
              </HeaderIconButton>
            ) : null}
            {onCommand ? (
              <HeaderIconButton label="Lệnh nhanh" onClick={onCommand}>
                <Command size={17} />
              </HeaderIconButton>
            ) : null}
            {canExpand ? (
              <HeaderIconButton label={isExpanded ? "Thu nhỏ" : "Mở rộng"} onClick={onToggleExpand}>
                {isExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </HeaderIconButton>
            ) : null}
            {canClose ? (
              <HeaderIconButton label="Đóng" onClick={onClose}>
                <X size={18} />
              </HeaderIconButton>
            ) : null}
          </div>
        </div>
        {hasConversation && (compactWorkflowSummary || activeActionCount > 0 || workflowStatus) ? (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#0F5132]/12 bg-[#0F5132]/[0.055] px-3 text-[11px] font-bold text-[#0F5132]">
              <Check size={13} />
              {workflowStatus || "Đang vận hành"}
            </span>
            {activeActionCount > 0 ? (
              <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-[#111827]/[0.07] bg-white/62 px-3 text-[11px] font-semibold text-[#6B7280]">
                {activeActionCount} action sẵn sàng
              </span>
            ) : null}
            {compactWorkflowSummary ? (
              <span className="hidden h-8 min-w-0 max-w-[520px] shrink items-center truncate rounded-full border border-[#111827]/[0.07] bg-white/62 px-3 text-[11px] font-semibold text-[#6B7280] sm:inline-flex">
                {compactWorkflowSummary}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5",
          variant === "drawer" ? "scroll-pb-36" : "scroll-pb-40"
        )}
      >
        {!hasConversation ? (
          <EmptyState quickActions={quickActions} title={emptyTitle} description={emptyDescription} onSend={(prompt) => onSend(prompt, [])} />
        ) : (
          <div className="mx-auto grid w-full max-w-[920px] gap-4 pb-2">
            {messages.map((message) => (
              <LogibotMessageRow key={message.id} message={message} onAction={onAction} />
            ))}
            {isSending ? <ThinkingState /> : null}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-[#111827]/[0.06] bg-[#FFFEFA]/90 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-2xl sm:px-5 sm:pb-4">
        <div className="mx-auto w-full max-w-[920px]">
          <LogibotComposer
            value={draft}
            isSending={isSending}
            onChange={onDraftChange}
            onSubmit={(message, attachments) => onSend(message, attachments)}
            onCommand={onCommand}
            placeholder={composerPlaceholder}
            disclaimer={composerDisclaimer ?? undefined}
          />
        </div>
      </footer>
    </section>
  );
}
