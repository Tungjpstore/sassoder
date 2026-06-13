"use client";

import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { ArrowRight, BadgePercent, BarChart3, Boxes, Search, UsersRound, X } from "lucide-react";
import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";
import { logibotAttachmentLabel, type LogibotAttachmentDraft } from "@/components/ai/logibot-composer";
import {
  logibotResultText,
  postLogibotJson,
  requestLogibot,
  type LogibotOwnerIntent,
  type LogibotOwnerResult
} from "@/components/ai/logibot-client";
import { LogibotChatSurface, type LogibotChatMessage, type LogibotChatQuickAction } from "@/components/ai/logibot-chat-surface";
import { cn } from "@/lib/utils";

export type LogibotWorkspaceData = {
  restaurantId: string;
  restaurantName: string;
  ownerName: string;
  branchName: string;
  branchStatus: string;
  threadId: string;
};

const quickActions: LogibotChatQuickAction[] = [
  {
    label: "Doanh thu hôm nay",
    prompt: "Phân tích doanh thu hôm nay từ dữ liệu thật và chỉ ra việc cần xử lý ngay."
  },
  {
    label: "Món bán chạy",
    prompt: "Món nào đang bán chạy hôm nay? Chỉ dùng dữ liệu thật và đề xuất bước vận hành tiếp theo."
  },
  {
    label: "Nhân viên online",
    prompt: "Nhân viên nào đang online hoặc cần chủ quán xử lý trong ca hiện tại?"
  },
  {
    label: "Tồn kho thấp",
    prompt: "Kiểm tra tồn kho thấp và đề xuất kế hoạch nhập hàng nháp nếu cần."
  },
  {
    label: "Tạo khuyến mãi",
    prompt: "Tạo chiến dịch khuyến mãi nháp dựa trên dữ liệu thật, không public nếu chưa xác nhận."
  }
];

const commandItems = [
  {
    icon: BarChart3,
    label: "Phân tích doanh thu",
    prompt: "Phân tích doanh thu hôm nay từ dữ liệu thật và chỉ ra việc cần xử lý ngay."
  },
  {
    icon: Boxes,
    label: "Kiểm tra kho",
    prompt: "Kiểm tra tồn kho thấp và đề xuất kế hoạch nhập hàng nháp nếu cần."
  },
  {
    icon: UsersRound,
    label: "Xem nhân sự",
    prompt: "Nhân viên nào đang online hoặc cần chủ quán xử lý trong ca hiện tại?"
  },
  {
    icon: BadgePercent,
    label: "Tạo campaign",
    prompt: "Tạo chiến dịch khuyến mãi nháp dựa trên dữ liệu thật, không public nếu chưa xác nhận."
  }
];

const ownerIntentHints: Array<[LogibotOwnerIntent, string[]]> = [
  ["menu", ["menu", "thực đơn", "thuc don", "món", "mon", "bảng giá", "bang gia"]],
  ["inventory", ["kho", "ton kho", "tồn kho", "nguyên liệu", "nguyen lieu", "nhập kho", "nhap kho", "hóa đơn", "hoa don"]],
  ["payments", ["thanh toán", "thanh toan", "vietqr", "đối soát", "doi soat"]],
  ["orders", ["đơn", "don", "order", "bếp", "bep"]],
  ["reports", ["báo cáo", "bao cao", "doanh thu", "analytics", "thống kê", "thong ke"]],
  ["promotions", ["khuyến mãi", "khuyen mai", "voucher", "campaign"]],
  ["staff", ["nhân viên", "nhan vien", "ca làm", "ca lam"]],
  ["growth", ["marketing", "tăng trưởng", "tang truong", "upsell"]],
  ["settings", ["cài đặt", "cau hinh", "thiết lập", "setup"]]
];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function foldText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferIntent(message: string): LogibotOwnerIntent {
  const folded = foldText(message);
  return ownerIntentHints.find(([, hints]) => hints.some((hint) => folded.includes(foldText(hint))))?.[0] ?? "overview";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function workflowSummaryFrom(result: LogibotOwnerResult | null) {
  const plan = result?.agentPlan as AiAgentPlan | undefined;
  return plan?.summary || result?.intentLabel || null;
}

function CommandPalette({
  open,
  onClose,
  onCommand
}: {
  open: boolean;
  onClose: () => void;
  onCommand: (prompt: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi-VN");
    if (!normalized) return commandItems;
    return commandItems.filter((item) => `${item.label} ${item.prompt}`.toLocaleLowerCase("vi-VN").includes(normalized));
  }, [query]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[var(--z-dashboard-modal)] grid place-items-start justify-center bg-[var(--d-text)]/20 px-3 pt-[10vh] backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.section
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            className="w-full max-w-[680px] overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-md)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[var(--d-line)] px-4 py-3">
              <Search size={18} className="shrink-0 text-[var(--d-text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                name="logibot-command-search"
                autoComplete="off"
                aria-label="Tìm lệnh LogiBot"
                placeholder="Ra lệnh cho LogiBot…"
                className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[length:var(--d-fs-sm)] font-medium text-[var(--d-text)] outline-none placeholder:text-[var(--d-text-faint)]"
              />
              <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]" aria-label="Đóng command">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {filtered.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      onCommand(item.prompt);
                      onClose();
                    }}
                    className="flex min-h-14 w-full items-center gap-3 rounded-[var(--d-r-md)] px-3 text-left transition hover:bg-[var(--d-surface-2)]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]">
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{item.label}</span>
                      <span className="block truncate text-[length:var(--d-fs-xs)] font-medium text-[var(--d-text-muted)]">Chỉ đọc dữ liệu thật sau khi chạy</span>
                    </span>
                    <ArrowRight size={16} className="shrink-0 text-[var(--d-primary)]" />
                  </button>
                );
              })}
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function LogibotAiWorkspace({ workspace }: { workspace: LogibotWorkspaceData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [messages, setMessages] = useState<LogibotChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const latestResult = messages.findLast((message) => message.role === "assistant")?.result as LogibotOwnerResult | null | undefined;
  const activeActionCount = latestResult?.actions?.length ?? 0;

  async function sendMessage(rawMessage: string, attachments: LogibotAttachmentDraft[] = []) {
    const message = rawMessage.trim();
    if ((!message && !attachments.length) || isSending) return;

    const userMessage = message || "Đọc file đính kèm và cho biết bước xử lý tiếp theo.";
    const attachmentLabel = logibotAttachmentLabel(attachments);
    setDraft("");
    setMessages((current) => [
      ...current,
      {
        id: makeId(),
        role: "user",
        content: userMessage,
        attachmentLabel: attachmentLabel || undefined
      }
    ]);
    setIsSending(true);

    try {
      const result = await requestLogibot({
        message: userMessage,
        attachments,
        assistantBody: {
          intent: inferIntent(userMessage),
          threadId: workspace.threadId,
          message: userMessage,
          context: {
            currentPath: pathname,
            restaurantId: workspace.restaurantId,
            restaurantName: workspace.restaurantName,
            branchName: workspace.branchName,
            source: "logibot_ai_workspace_v3"
          }
        }
      });

      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: logibotResultText(result),
          result
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: error instanceof Error ? error.message : "LogiBot chưa xử lý được yêu cầu này.",
          result: null
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function runAction(action: AiAgentAction) {
    if (action.type === "link" && action.href) {
      router.push(action.href);
      return `Đã mở ${action.label.toLowerCase()}.`;
    }

    if (action.type === "prompt" && action.prompt) {
      await sendMessage(action.prompt);
      return "Đang yêu cầu LogiBot phân tích tiếp.";
    }

    if (action.type === "api" && action.endpoint) {
      const payload = await postLogibotJson<unknown>(action.endpoint, action.body ?? {});
      const record = asRecord(payload);
      const reply =
        typeof record?.reply === "string"
          ? record.reply
          : typeof record?.text === "string"
            ? record.text
            : `${action.label} đã chạy.`;
      router.refresh();
      return reply;
    }

    return "Action đã được chuẩn bị.";
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)]/80 p-1.5 shadow-[var(--d-sh-md)] backdrop-blur-xl transition-[height,box-shadow,background-color] duration-200",
        isExpanded
          ? "fixed inset-2 z-[var(--z-dashboard-modal)] h-[calc(100dvh_-_1rem)] min-h-0 sm:inset-4 sm:h-[calc(100dvh_-_2rem)]"
          : "h-[calc(100dvh_-_112px_-_var(--dashboard-mobile-content-bottom))] min-h-[min(540px,calc(100dvh_-_128px))] md:h-[calc(100dvh_-_112px)] lg:h-[calc(100dvh_-_92px)]"
      )}
    >
      <LogibotChatSurface
        title="LogiBot AI"
        subtitle={`${workspace.restaurantName} · ${workspace.branchName}`}
        eyebrow="AI vận hành"
        statusText={workspace.branchStatus}
        variant="workspace"
        className="h-full rounded-[22px]"
        messages={messages}
        draft={draft}
        isSending={isSending}
        quickActions={quickActions}
        workflowStatus={latestResult ? "Đã đọc dữ liệu" : undefined}
        workflowSummary={workflowSummaryFrom(latestResult ?? null)}
        activeActionCount={activeActionCount}
        onDraftChange={setDraft}
        onSend={sendMessage}
        onAction={runAction}
        onCommand={() => setCommandOpen(true)}
        canExpand
        canClose
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded((current) => !current)}
        onClose={() => router.push("/dashboard")}
        onNewChat={() => {
          setMessages([]);
          setDraft("");
        }}
      />
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} onCommand={(prompt) => void sendMessage(prompt)} />
    </section>
  );
}
