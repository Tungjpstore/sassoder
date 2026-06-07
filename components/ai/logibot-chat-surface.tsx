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
  X,
  Bot
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
        "relative shrink-0 overflow-hidden rounded-2xl border border-[#0F5132]/10 bg-white shadow-[0_8px_24px_rgba(15,81,50,0.08)] transition-transform duration-300 hover:scale-105",
        size === "sm" ? "h-8 w-8 rounded-xl" : size === "lg" ? "h-14 w-14 shadow-md" : "h-10 w-10"
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
      className="inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/40 backdrop-blur-md px-3 text-xs font-semibold text-slate-600 shadow-[0_4px_12px_rgba(17,24,39,0.02)] transition-all duration-200 hover:border-[#0F5132]/25 hover:bg-white hover:text-[#0F5132] hover:shadow-md active:scale-[0.95]"
      aria-label={label}
      title={label}
    >
      {children}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function parseBoldText(text: string) {
  const parts = [];
  let current = text;
  let boldIndex = current.indexOf("**");
  let keyIdx = 0;
  while (boldIndex !== -1) {
    const endBoldIndex = current.indexOf("**", boldIndex + 2);
    if (endBoldIndex === -1) break;
    
    if (boldIndex > 0) {
      parts.push(current.substring(0, boldIndex));
    }
    parts.push(
      <strong key={`b-${keyIdx++}`} className="font-bold text-[#0F5132] bg-[#0F5132]/5 px-1.5 py-0.5 rounded-md">
        {current.substring(boldIndex + 2, endBoldIndex)}
      </strong>
    );
    current = current.substring(endBoldIndex + 2);
    boldIndex = current.indexOf("**");
  }
  if (current) {
    parts.push(current);
  }
  return parts.length > 0 ? parts : text;
}

function parseMarkdown(text: string) {
  const lines = text.split("\n");
  const elements = [];
  let inList = false;
  let listItems: ReactNode[] = [];

  const flushList = (key: number) => {
    if (listItems.length > 0) {
      elements.push(<ul key={`list-${key}`} className="my-2 space-y-1.5">{...listItems}</ul>);
      listItems = [];
    }
    inList = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        inList = true;
      }
      const content = trimmed.substring(2);
      listItems.push(
        <li key={`li-${i}`} className="ml-4 list-disc pl-1 text-[15px] font-medium text-slate-800 leading-7">
          {parseBoldText(content)}
        </li>
      );
    } else {
      if (inList) {
        flushList(i);
      }
      if (trimmed) {
        elements.push(
          <p key={`p-${i}`} className="my-1.5 text-[15px] font-medium text-slate-800 leading-7">
            {parseBoldText(line)}
          </p>
        );
      } else {
        elements.push(<div key={`empty-${i}`} className="h-2" />);
      }
    }
  }
  
  if (inList) {
    flushList(lines.length);
  }
  
  return elements;
}

function MessageText({ children }: { children: string }) {
  const [expanded, setExpanded] = useState(false);
  const compactText = children.length > 900 ? `${children.slice(0, 900).trim()}...` : children;
  const shouldClamp = children.length > 900;
  const targetText = shouldClamp && !expanded ? compactText : children;

  return (
    <div className="min-w-0">
      <div className="whitespace-pre-wrap break-words">
        {parseMarkdown(targetText)}
      </div>
      {shouldClamp ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 inline-flex h-8 items-center rounded-lg px-2 text-xs font-bold text-[#0F5132] transition hover:bg-[#0F5132]/10"
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
      setFeedback(result || "Đã hoàn thành.");
      setConfirming(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Thao tác chưa hoàn tất.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#0F5132]/10 bg-[#FFFEFA]/80 p-2.5 shadow-[0_8px_30px_rgba(15,81,50,0.03)] hover:shadow-[0_12px_36px_rgba(15,81,50,0.05)] transition-all duration-200">
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left transition duration-200 disabled:cursor-wait disabled:opacity-60",
          primary
            ? "border-0 bg-gradient-to-r from-[#0F5132] to-[#147A4D] hover:from-[#0B3D27] hover:to-[#0F5132] !text-white shadow-[0_10px_24px_rgba(15,81,50,0.15)] hover:shadow-[0_12px_30px_rgba(15,81,50,0.22)] active:scale-[0.99]"
            : "border-[#0F5132]/10 bg-white/90 text-[#374151] hover:border-[#0F5132]/30 hover:bg-[#0F5132]/5 hover:text-[#0F5132] active:scale-[0.99]"
        )}
      >
        <span className="min-w-0">
          <span className={cn("block truncate text-sm font-bold", primary ? "!text-white" : "text-[#374151]")}>{action.label}</span>
          <span className={cn("mt-0.5 flex items-center gap-1 text-[11px] font-semibold", primary ? "!text-white/70" : "text-slate-500")}>
            <ShieldCheck size={12} className={cn(primary ? "text-white/80" : "text-slate-500")} />
            {actionSafetyLabel(action)}
          </span>
        </span>
        {pending ? (
          <Loader2 size={16} className="shrink-0 animate-spin" />
        ) : action.type === "link" ? (
          <ArrowRight size={16} className={cn("shrink-0", primary ? "!text-white" : "text-slate-500")} />
        ) : (
          <Play size={14} className={cn("shrink-0", primary ? "!text-white" : "text-slate-500")} />
        )}
      </button>
      <AnimatePresence initial={false}>
        {confirming ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-2.5 text-xs font-semibold leading-5 text-[#8A5506]"
          >
            Hành động này cần được bạn xác nhận. Bấm thêm một lần nữa để tiếp tục.
          </motion.div>
        ) : null}
        {feedback ? (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 px-1 text-xs font-bold leading-5 text-[#0F5132]"
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
        initial={{ opacity: 0, y: 12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="ml-auto flex w-fit max-w-[min(760px,88%)] flex-col items-end gap-1.5"
      >
        {message.attachmentLabel ? (
          <span className="mr-1 rounded-full border border-[#0F5132]/10 bg-[#0F5132]/5 px-3 py-1 text-[11px] font-bold text-[#0F5132] shadow-sm">
            📎 {message.attachmentLabel}
          </span>
        ) : null}
        <div className="rounded-2xl rounded-br-sm bg-gradient-to-br from-[#2D3748] to-[#1A202C] border border-white/5 px-4 py-3 text-[15px] font-medium leading-6 !text-white shadow-[0_10px_25px_rgba(26,32,44,0.1)]">
          <p className="whitespace-pre-wrap break-words !text-white">{message.content}</p>
        </div>
      </motion.article>
    );
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="grid max-w-[880px] grid-cols-[32px_minmax(0,1fr)] gap-3"
    >
      <span className="mt-1"><LogibotMark size="sm" /></span>
      <div className="min-w-0">
        <div className="rounded-2xl rounded-tl-sm border border-[#0F5132]/10 bg-[#FFFEFA]/90 backdrop-blur-md px-4.5 py-3.5 shadow-[0_12px_36px_rgba(17,24,39,0.035)]">
          <MessageText>{message.content}</MessageText>
        </div>
        {actions.length ? (
          <div className="mt-2.5 grid gap-2 sm:max-w-[620px]">
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
      <div className="rounded-2xl rounded-tl-sm border border-[#0F5132]/10 bg-[#FFFEFA]/80 p-4 shadow-[0_12px_36px_rgba(15,81,50,0.03)]">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#0F5132]">LogiBot đang xử lý...</span>
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
          <div className="space-y-2 animate-pulse">
            <div className="h-2 w-3/4 rounded bg-slate-200/80" />
            <div className="h-2 w-1/2 rounded bg-slate-200/50" />
          </div>
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
        <h2 className="mx-auto mt-5 max-w-[540px] text-balance text-2xl font-semibold tracking-[-0.015em] text-slate-850 sm:text-3xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-[500px] text-sm font-medium leading-6 text-slate-500">
          {description}
        </p>
        <div className="mx-auto mt-6 flex max-w-[560px] flex-wrap justify-center gap-2">
          {quickActions.slice(0, 4).map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => void onSend(item.prompt)}
              className="min-h-10 rounded-2xl border border-[#0F5132]/10 bg-[#FFFEFA]/90 backdrop-blur-md px-4 text-xs font-bold text-[#151B23] shadow-[0_6px_20px_rgba(15,81,50,0.02)] transition hover:-translate-y-0.5 hover:border-[#0F5132]/35 hover:bg-white hover:text-[#0F5132] hover:shadow-[0_12px_28px_rgba(15,81,50,0.08)] active:scale-95 duration-200"
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
        "flex min-h-0 flex-col overflow-hidden bg-gradient-to-tr from-[#FBFBFA] to-[#F5F5F0] text-slate-800 border border-[#0F5132]/10 shadow-[0_20px_50px_rgba(0,0,0,0.02)]",
        variant === "drawer" ? "h-full rounded-[24px] sm:rounded-[28px]" : "h-full rounded-[24px]",
        className
      )}
    >
      <header className="shrink-0 border-b border-[#0F5132]/10 bg-white/45 backdrop-blur-xl px-3 py-3 shadow-[0_2px_18px_rgba(15,81,50,0.015)] sm:px-4">
        <div className="flex min-h-12 items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-3">
            <LogibotMark />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[#0F5132]">{eyebrow}</span>
                <span className="hidden h-2 w-2 rounded-full bg-[#10B981] animate-pulse shadow-[0_0_8px_#10B981] sm:inline-block" />
                <span className="hidden truncate text-[11px] font-bold text-[#10B981] sm:inline">{statusText}</span>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <h2 className="truncate text-base font-black tracking-[-0.02em] text-[#111827] sm:text-lg">{title}</h2>
                <span className="hidden max-w-[220px] truncate text-xs font-semibold text-slate-500 sm:inline">{subtitle}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onNewChat ? (
              <HeaderIconButton label="Chat mới" onClick={onNewChat}>
                <MessageSquarePlus size={16} />
              </HeaderIconButton>
            ) : null}
            {onCommand ? (
              <HeaderIconButton label="Lệnh nhanh" onClick={onCommand}>
                <Command size={16} />
              </HeaderIconButton>
            ) : null}
            {canExpand ? (
              <HeaderIconButton label={isExpanded ? "Thu nhỏ" : "Mở rộng"} onClick={onToggleExpand}>
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </HeaderIconButton>
            ) : null}
            {canClose ? (
              <HeaderIconButton label="Đóng" onClick={onClose}>
                <X size={17} />
              </HeaderIconButton>
            ) : null}
          </div>
        </div>
        {hasConversation && (compactWorkflowSummary || activeActionCount > 0 || workflowStatus) ? (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#0F5132]/20 bg-[#0F5132]/10 px-3 text-[11px] font-black text-[#0F5132] shadow-sm">
              <Check size={13} />
              {workflowStatus || "Đang vận hành"}
            </span>
            {activeActionCount > 0 ? (
              <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-black/[0.05] bg-white/60 px-3 text-[11px] font-semibold text-slate-500 shadow-sm">
                {activeActionCount} action sẵn sàng
              </span>
            ) : null}
            {compactWorkflowSummary ? (
              <span className="hidden h-8 min-w-0 max-w-[520px] shrink items-center truncate rounded-full border border-black/[0.05] bg-white/60 px-3 text-[11px] font-semibold text-slate-500 shadow-sm sm:inline-flex">
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
          <div className="mx-auto grid w-full max-w-[920px] gap-4.5 pb-2">
            {messages.map((message) => (
              <LogibotMessageRow key={message.id} message={message} onAction={onAction} />
            ))}
            {isSending ? <ThinkingState /> : null}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-[#0F5132]/10 bg-white/50 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl sm:px-5 sm:pb-4">
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
