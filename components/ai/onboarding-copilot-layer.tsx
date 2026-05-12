"use client";

import { useCallback, useState } from "react";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotReadable } from "@copilotkit/react-core";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { CopilotSidebar } from "@copilotkit/react-core/v2";
import { Bot, Sparkles, X } from "lucide-react";
import { LogiVNCopilotProvider } from "@/components/ai/logivn-copilot-provider";
import { useCopilotResponseWatchdog } from "@/components/ai/use-copilot-response-watchdog";
import { buildCopilotThreadId } from "@/lib/ai/copilot-thread";
import { buildCopilotSystemInstructions } from "@/lib/ai/prompts/copilot-system";

/* ─── Types ─── */
export type OnboardingAiState = {
  step: number;
  restaurantName: string;
  slug: string;
  businessType: string;
  tableCount: number;
  planCode: string;
  bankCode: string;
  bankAccount: string;
};

type MenuSuggestion = {
  category: string;
  items: { name: string; price: number; description?: string }[];
};

type OnboardingCopilotProps = {
  state: OnboardingAiState;
  onApplyMenuSuggestion?: (menus: MenuSuggestion[]) => void;
  onApplyTableCount?: (count: number) => void;
  onApplyBusinessType?: (type: string) => void;
};

type OnboardingAgentAction = {
  id: string;
  label: string;
  description?: string;
  tone?: "primary" | "secondary" | "safe";
};

type OnboardingAiResult = {
  title?: string;
  text: string;
  actions?: OnboardingAgentAction[];
  metrics?: Array<{ label: string; value: string | number }>;
};

/* ─── Step Contexts ─── */
const stepContextMap: Record<number, string> = {
  0: "User đang ở bước Tài khoản. Giúp họ hiểu cần email + mật khẩu (hoặc Google). Giải thích sự khác biệt giữa gói Pro và Premium nếu được hỏi.",
  1: "User đang nhập thông tin quán (tên, địa chỉ). Gợi ý tên quán hay, kiểm tra subdomain phù hợp. Khuyến khích chọn tên ngắn gọn, dễ nhớ.",
  2: "User đang chọn mô hình quán và có thể upload menu PDF. Giúp họ chọn đúng loại quán. Nếu họ muốn, dùng action generateSampleMenu để tạo menu mẫu.",
  3: "User đang cấu hình số bàn và thông tin VietQR. Gợi ý số bàn phù hợp theo mô hình quán. Giải thích cách VietQR hoạt động.",
  4: "User đang ở bước xác nhận cuối cùng. Kiểm tra lại thông tin và khuyến khích hoàn tất."
};

/* ─── Copilot Experience ─── */
function OnboardingCopilotExperience({ state, onApplyMenuSuggestion, onApplyTableCount, onApplyBusinessType }: OnboardingCopilotProps) {
  const [isOpen, setIsOpen] = useState(false);

  useCopilotResponseWatchdog({
    timeoutMs: 12_000,
    fallbackText:
      "LogiBot chưa nhận được phản hồi đầy đủ, nhưng mình vẫn có thể tiếp tục bằng lộ trình an toàn: hoàn tất thông tin quán, tạo menu mẫu, chọn số bàn và kiểm tra VietQR trước khi tạo quán."
  });

  // Readable state
  useCopilotReadable(
    {
      description: "Trạng thái onboarding hiện tại của user đang thiết lập quán mới trên LogiVN",
      value: {
        surface: "onboarding",
        currentStep: state.step,
        stepName: ["Tài khoản", "Thông tin", "Thực đơn", "Bàn & QR", "Hoàn tất"][state.step] ?? "Unknown",
        restaurantName: state.restaurantName || "(chưa nhập)",
        slug: state.slug || "(chưa tạo)",
        businessType: state.businessType,
        tableCount: state.tableCount,
        planCode: state.planCode,
        hasBankInfo: Boolean(state.bankCode && state.bankAccount)
      }
    },
    [state]
  );

  // System instructions
  useCopilotAdditionalInstructions(
    {
      instructions: [
        buildCopilotSystemInstructions("onboarding"),
        "Gợi ý tối ưu dựa trên loại quán đã chọn.",
        "Khi user ở bước Thực đơn, chủ động hỏi có muốn tạo menu mẫu không.",
        "Khi user ở bước Bàn & QR, gợi ý số bàn phù hợp.",
        `Ngữ cảnh bước hiện tại: ${stepContextMap[state.step] ?? "Không rõ bước."}`,
        "Ưu tiên dùng action (generateSampleMenu, suggestTableCount) thay vì chỉ mô tả bằng lời."
      ].join("\n")
    },
    [state.step]
  );

  // Chat suggestions based on current step
  const suggestions = useStepSuggestions(state.step, state.businessType);
  useCopilotChatSuggestions({ available: "before-first-message", suggestions }, [state.step, state.businessType]);

  // Action: Generate sample menu
  useCopilotAction(
    {
      name: "generateSampleMenu",
      description: "Tạo menu mẫu phù hợp với loại quán. Trả về danh sách danh mục và món kèm giá tham khảo.",
      parameters: [
        {
          name: "businessType",
          type: "string",
          required: true,
          enum: ["CAFE", "RESTAURANT", "FAST_FOOD", "BAR", "OTHER"],
          description: "Loại quán"
        },
        {
          name: "specialization",
          type: "string",
          required: false,
          description: "Mô tả chi tiết hơn (VD: cafe sữa đá Sài Gòn, phở bò Hà Nội, pizza Ý)"
        },
        {
          name: "priceRange",
          type: "string",
          required: false,
          enum: ["budget", "mid", "premium"],
          description: "Phân khúc giá"
        }
      ],
      handler: async ({ businessType, specialization, priceRange }) => {
        const menus = buildSampleMenu(businessType, specialization, priceRange);
        onApplyMenuSuggestion?.(menus);
        const totalItems = menus.reduce((sum, cat) => sum + cat.items.length, 0);
        return {
          text: `Đã tạo ${menus.length} danh mục với ${totalItems} món mẫu. Menu đã được đưa vào bước onboarding và sẽ lưu theo quán khi hoàn tất đăng ký.`,
          actions: [
            { id: "menu-applied", label: "Đã áp dụng menu", description: "Có thể chỉnh giá/tên món trong dashboard sau.", tone: "primary" },
            { id: "next-table", label: "Tiếp tục Bàn & QR", description: "Hoàn thiện số bàn và VietQR để bán thật.", tone: "secondary" }
          ],
          metrics: [
            { label: "Danh mục", value: menus.length },
            { label: "Món", value: totalItems }
          ]
        } satisfies OnboardingAiResult;
      },
      render: ({ status, result }) => (
        <AiResultCard
          title="Menu mẫu AI"
          status={status}
          result={result as OnboardingAiResult}
        />
      )
    },
    [onApplyMenuSuggestion]
  );

  // Action: Suggest table count
  useCopilotAction(
    {
      name: "suggestTableCount",
      description: "Gợi ý số bàn phù hợp dựa trên mô hình quán và diện tích (nếu có).",
      parameters: [
        {
          name: "businessType",
          type: "string",
          required: true,
          enum: ["CAFE", "RESTAURANT", "FAST_FOOD", "BAR", "OTHER"],
          description: "Loại quán"
        },
        {
          name: "areaSqm",
          type: "number",
          required: false,
          description: "Diện tích quán tính bằng m²"
        }
      ],
      handler: async ({ businessType, areaSqm }) => {
        const suggested = calculateTableSuggestion(businessType, areaSqm);
        onApplyTableCount?.(suggested.recommended);
        return {
          text: `Gợi ý ${suggested.recommended} bàn. Đã tự điền vào onboarding, bạn có thể chỉnh lại nếu layout thực tế khác.`,
          actions: [
            { id: "table-applied", label: "Đã áp dụng số bàn", description: suggested.reasoning, tone: "primary" },
            { id: "vietqr-next", label: "Kiểm VietQR", description: "Bước tiếp theo là ngân hàng và tài khoản nhận tiền.", tone: "secondary" }
          ],
          metrics: [{ label: "Bàn đề xuất", value: suggested.recommended }]
        } satisfies OnboardingAiResult;
      },
      render: ({ status, result }) => (
        <AiResultCard
          title="Gợi ý số bàn"
          status={status}
          result={result as OnboardingAiResult}
        />
      )
    },
    [onApplyTableCount]
  );

  // Action: Explain plan differences
  useCopilotAction(
    {
      name: "explainPlans",
      description: "So sánh chi tiết gói Pro và Premium cho user đang cân nhắc.",
      parameters: [],
      handler: async () => {
        return buildPlanExplanation();
      },
      render: ({ status, result }) => (
        <AiResultCard
          title="So sánh gói dịch vụ"
          status={status}
          result={result as OnboardingAiResult}
        />
      )
    },
    []
  );

  // Action: Suggest business type
  useCopilotAction(
    {
      name: "suggestBusinessType",
      description: "Gợi ý loại quán phù hợp dựa trên mô tả của user.",
      parameters: [
        {
          name: "description",
          type: "string",
          required: true,
          description: "Mô tả quán của user"
        }
      ],
      handler: async ({ description }) => {
        const { suggested, reason } = inferBusinessType(description);

        onApplyBusinessType?.(suggested);
        return {
          text: `Gợi ý ${reason}. Đã chọn mô hình ${suggested} trong onboarding, bạn có thể đổi nếu chưa đúng.`,
          actions: [
            { id: "business-type-applied", label: "Đã chọn mô hình", description: reason, tone: "primary" },
            { id: "menu-next", label: "Tạo menu mẫu", description: "LogiBot có thể tạo menu phù hợp mô hình này.", tone: "secondary" }
          ],
          metrics: [{ label: "Loại quán", value: suggested }]
        } satisfies OnboardingAiResult;
      },
      render: ({ status, result }) => (
        <AiResultCard
          title="Gợi ý mô hình quán"
          status={status}
          result={result as OnboardingAiResult}
        />
      )
    },
    [onApplyBusinessType]
  );

  useCopilotAction(
    {
      name: "answer_onboarding_request",
      description:
        "Catch-all bắt buộc cho mọi câu hỏi tự do trong onboarding. Luôn trả card hành động rõ ràng; nếu phù hợp thì tự áp dụng menu mẫu, số bàn hoặc mô hình quán.",
      parameters: [
        {
          name: "message",
          type: "string",
          required: true,
          description: "Nguyên văn câu hỏi/yêu cầu của user đang onboarding."
        }
      ],
      handler: async ({ message }) => {
        const result = runOnboardingAgent({
          message: String(message || "Tôi nên làm gì tiếp?"),
          state,
          onApplyMenuSuggestion,
          onApplyTableCount,
          onApplyBusinessType
        });
        return result;
      },
      render: ({ status, result }) => (
        <AiResultCard
          title="Onboarding Agent"
          status={status}
          result={result as OnboardingAiResult}
        />
      )
    },
    [onApplyBusinessType, onApplyMenuSuggestion, onApplyTableCount, state]
  );

  useCopilotAction(
    {
      name: "continue_onboarding_setup",
      description: "Tiếp tục setup theo bước hiện tại bằng runtime deterministic, không gọi model nếu chỉ cần chỉ bước tiếp theo.",
      parameters: [],
      handler: async () => buildOnboardingStepResult(state),
      render: ({ status, result }) => (
        <AiResultCard
          title="Bước tiếp theo"
          status={status}
          result={result as OnboardingAiResult}
        />
      )
    },
    [state]
  );

  return (
    <>
      {/* FAB toggle button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-28 right-5 z-[70] flex h-14 items-center gap-2.5 rounded-full border border-[var(--primary)]/20 bg-[var(--surface)] px-4 text-sm font-bold text-[var(--primary-strong)] shadow-[var(--glow-primary)] backdrop-blur-xl transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(15,77,58,0.16)] md:bottom-28 md:right-6"
          aria-label="Mở LogiBot trợ lý"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
            <Bot className="h-5 w-5" />
          </span>
          <span className="hidden sm:inline">Trợ lý AI</span>
          <Sparkles className="h-4 w-4 text-[var(--accent)] sm:hidden" />
        </button>
      )}

      {/* Sidebar */}
      {isOpen && (
        <CopilotSidebar
          defaultOpen={true}
          width="min(420px, 100vw)"
          labels={{
            modalHeaderTitle: "LogiBot · Trợ lý thiết lập",
            welcomeMessageText: "Mình sẽ biến onboarding thành checklist có hành động: chọn loại quán, tạo menu mẫu, gợi ý số bàn và chỉ bước tiếp theo.",
            chatInputPlaceholder: "VD: quán phở 60m2 cần bao nhiêu bàn, tạo menu mẫu...",
            chatDisclaimerText: "LogiBot chỉ tạo gợi ý và bản nháp; bạn xác nhận trước khi lưu dữ liệu thật.",
            chatToggleOpenLabel: "Mở trợ lý",
            chatToggleCloseLabel: "Đóng trợ lý"
          }}
        />
      )}
    </>
  );
}

/* ─── Helpers ─── */
function useStepSuggestions(step: number, businessType: string) {
  return useCallback(() => {
    const map: Record<number, { title: string; message: string }[]> = {
      0: [
        { title: "So sánh gói", message: "So sánh gói Pro và Premium cho mình" },
        { title: "Google hay email?", message: "Đăng ký bằng Google hay email tốt hơn?" }
      ],
      1: [
        { title: "Gợi ý tên quán", message: `Gợi ý tên quán hay cho một quán ${businessType.toLowerCase()}` },
        { title: "Subdomain là gì?", message: "Subdomain hoạt động như thế nào?" }
      ],
      2: [
        { title: "Tạo menu mẫu", message: `Tạo menu mẫu cho quán ${businessType.toLowerCase()} của mình` },
        { title: "Loại quán nào?", message: "Mình bán cà phê và bánh ngọt, nên chọn loại quán nào?" }
      ],
      3: [
        { title: "Gợi ý số bàn", message: `Quán ${businessType.toLowerCase()} khoảng 60m2 nên có bao nhiêu bàn?` },
        { title: "VietQR là gì?", message: "VietQR hoạt động thế nào? Cần thiết lập gì?" }
      ],
      4: [
        { title: "Kiểm tra lại", message: "Kiểm tra lại thông tin quán cho mình trước khi tạo" },
        { title: "Sau khi tạo?", message: "Sau khi tạo quán xong, mình cần làm gì tiếp theo?" }
      ]
    };
    return map[step] ?? [];
  }, [step, businessType])();
}

function buildSampleMenu(businessType: string, specialization?: string, priceRange?: string): MenuSuggestion[] {
  const multiplier = priceRange === "premium" ? 1.8 : priceRange === "budget" ? 0.7 : 1;

  const templates: Record<string, MenuSuggestion[]> = {
    CAFE: [
      {
        category: "Cà phê",
        items: [
          { name: "Cà phê sữa đá", price: Math.round(29000 * multiplier), description: "Cà phê phin truyền thống" },
          { name: "Americano", price: Math.round(35000 * multiplier), description: "Espresso pha loãng" },
          { name: "Latte", price: Math.round(45000 * multiplier), description: "Espresso + sữa tươi steamed" },
          { name: "Cappuccino", price: Math.round(45000 * multiplier), description: "Espresso + foam sữa dày" }
        ]
      },
      {
        category: "Trà & Nước ép",
        items: [
          { name: "Trà đào cam sả", price: Math.round(39000 * multiplier) },
          { name: "Trà sen vàng", price: Math.round(35000 * multiplier) },
          { name: "Nước ép cam tươi", price: Math.round(35000 * multiplier) },
          { name: "Sinh tố bơ", price: Math.round(39000 * multiplier) }
        ]
      },
      {
        category: "Bánh ngọt",
        items: [
          { name: "Bánh tiramisu", price: Math.round(55000 * multiplier) },
          { name: "Croissant bơ", price: Math.round(35000 * multiplier) },
          { name: "Bánh chuối nướng", price: Math.round(30000 * multiplier) }
        ]
      }
    ],
    RESTAURANT: [
      {
        category: "Món chính",
        items: [
          { name: "Cơm tấm sườn bì chả", price: Math.round(55000 * multiplier) },
          { name: "Phở bò tái nạm", price: Math.round(50000 * multiplier) },
          { name: "Bún chả Hà Nội", price: Math.round(50000 * multiplier) },
          { name: "Cơm gà xối mỡ", price: Math.round(55000 * multiplier) }
        ]
      },
      {
        category: "Món kèm",
        items: [
          { name: "Gỏi cuốn tôm thịt", price: Math.round(30000 * multiplier) },
          { name: "Chả giò rế", price: Math.round(35000 * multiplier) },
          { name: "Canh chua cá lóc", price: Math.round(45000 * multiplier) }
        ]
      },
      {
        category: "Đồ uống",
        items: [
          { name: "Trà đá", price: Math.round(5000 * multiplier) },
          { name: "Nước ngọt", price: Math.round(15000 * multiplier) },
          { name: "Bia Sài Gòn", price: Math.round(20000 * multiplier) }
        ]
      },
      {
        category: "Tráng miệng",
        items: [
          { name: "Chè ba màu", price: Math.round(20000 * multiplier) },
          { name: "Rau câu dừa", price: Math.round(15000 * multiplier) }
        ]
      }
    ],
    FAST_FOOD: [
      {
        category: "Combo",
        items: [
          { name: "Combo gà rán + khoai + nước", price: Math.round(79000 * multiplier) },
          { name: "Combo burger bò + khoai", price: Math.round(69000 * multiplier) },
          { name: "Combo cơm gà + nước", price: Math.round(55000 * multiplier) }
        ]
      },
      {
        category: "Món lẻ",
        items: [
          { name: "Gà rán (2 miếng)", price: Math.round(49000 * multiplier) },
          { name: "Khoai tây chiên", price: Math.round(25000 * multiplier) },
          { name: "Burger bò phô mai", price: Math.round(45000 * multiplier) }
        ]
      },
      {
        category: "Đồ uống",
        items: [
          { name: "Coca-Cola", price: Math.round(15000 * multiplier) },
          { name: "Trà đào", price: Math.round(25000 * multiplier) }
        ]
      }
    ],
    BAR: [
      {
        category: "Cocktail",
        items: [
          { name: "Mojito", price: Math.round(89000 * multiplier) },
          { name: "Old Fashioned", price: Math.round(99000 * multiplier) },
          { name: "Gin & Tonic", price: Math.round(79000 * multiplier) },
          { name: "Whiskey Sour", price: Math.round(99000 * multiplier) }
        ]
      },
      {
        category: "Bia & Rượu",
        items: [
          { name: "Heineken draft", price: Math.round(45000 * multiplier) },
          { name: "Tiger Crystal", price: Math.round(35000 * multiplier) },
          { name: "Rượu vang đỏ (ly)", price: Math.round(79000 * multiplier) }
        ]
      },
      {
        category: "Món nhắm",
        items: [
          { name: "Khoai tây chiên truffle", price: Math.round(59000 * multiplier) },
          { name: "Phô mai que", price: Math.round(49000 * multiplier) },
          { name: "Cánh gà chiên nước mắm", price: Math.round(69000 * multiplier) }
        ]
      }
    ]
  };

  return templates[businessType] ?? templates.RESTAURANT;
}

function calculateTableSuggestion(businessType: string, areaSqm?: number) {
  const spacePerTable: Record<string, number> = {
    CAFE: 2.2,
    RESTAURANT: 3,
    FAST_FOOD: 1.8,
    BAR: 2.5,
    OTHER: 2.5
  };

  const defaults: Record<string, { min: number; max: number; recommended: number }> = {
    CAFE: { min: 8, max: 30, recommended: 15 },
    RESTAURANT: { min: 10, max: 50, recommended: 24 },
    FAST_FOOD: { min: 6, max: 25, recommended: 12 },
    BAR: { min: 8, max: 35, recommended: 18 },
    OTHER: { min: 10, max: 40, recommended: 20 }
  };

  const fallback = defaults[businessType] ?? defaults.OTHER;

  if (areaSqm && areaSqm > 0) {
    const space = spacePerTable[businessType] ?? 2.5;
    const usableArea = areaSqm * 0.6; // 60% usable for seating
    const calculated = Math.round(usableArea / space);
    const clamped = Math.max(fallback.min, Math.min(fallback.max, calculated));
    return {
      recommended: clamped,
      reasoning: `${areaSqm}m² × 60% = ${Math.round(usableArea)}m² khả dụng, mỗi bàn ~${space}m²`
    };
  }

  return {
    recommended: fallback.recommended,
    reasoning: `Mặc định cho ${businessType.toLowerCase()}: ${fallback.min}-${fallback.max} bàn`
  };
}

function foldOnboardingText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sanitizeCardText(value?: string) {
  const text = String(value || "").trim();
  if (!text) return "Mình đã chuẩn bị bước tiếp theo để bạn tiếp tục setup.";
  if (/^[{[]/.test(text) || /"(summary|actions|agentPlan|reply)"\s*:/.test(text)) {
    return "Mình đã chuyển kết quả AI thành card thao tác an toàn để bạn dùng ngay.";
  }
  return text.replace(/\*\*/g, "").slice(0, 700);
}

function normalizeBusinessType(value?: string) {
  const type = String(value || "").toUpperCase();
  return ["CAFE", "RESTAURANT", "FAST_FOOD", "BAR", "OTHER"].includes(type) ? type : "RESTAURANT";
}

function inferPriceRange(message: string) {
  const text = foldOnboardingText(message);
  if (/premium|cao cap|sang|dat/.test(text)) return "premium";
  if (/re|binh dan|budget|sinh vien/.test(text)) return "budget";
  return "mid";
}

function extractAreaSqm(message: string) {
  const text = foldOnboardingText(message).replace(/,/g, ".");
  const match = text.match(/(\d+(?:\.\d+)?)\s*(m2|m²|met|sqm)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function inferBusinessType(description: string) {
  const lower = description.toLowerCase();
  if (/cafe|cà phê|coffee|trà|tea|bánh/.test(lower)) {
    return { suggested: "CAFE", reason: "quán cafe / trà / bánh ngọt" };
  }
  if (/bar|pub|cocktail|bia|rượu|nhậu/.test(lower)) {
    return { suggested: "BAR", reason: "bar / pub / quán nhậu" };
  }
  if (/nhanh|fast|burger|pizza|gà rán|ăn vặt|combo/.test(lower)) {
    return { suggested: "FAST_FOOD", reason: "đồ ăn nhanh / ăn vặt" };
  }
  if (/phở|bún|cơm|lẩu|nướng|hải sản|đặc sản/.test(lower)) {
    return { suggested: "RESTAURANT", reason: "quán ăn / nhà hàng" };
  }
  return { suggested: "RESTAURANT", reason: "quán ăn phổ thông" };
}

function buildPlanExplanation(): OnboardingAiResult {
  return {
    text:
      "Pro phù hợp quán muốn bán thật nhanh với QR gọi món, đơn realtime, online ordering, nhân viên và VietQR. Premium phù hợp nếu cần OCR menu, đặt bàn/cọc, AI ảnh món và báo cáo nâng cao. Cả hai đều có trial, nên chọn theo tính năng cần vận hành ngay.",
    actions: [
      { id: "choose-pro", label: "Chọn Pro nếu cần bán nhanh", description: "Đủ QR, đơn, online, nhân viên và VietQR.", tone: "primary" },
      { id: "choose-premium", label: "Chọn Premium nếu cần AI/OCR", description: "Thêm OCR menu, ảnh món, đặt bàn/cọc và báo cáo nâng cao.", tone: "secondary" }
    ],
    metrics: [
      { label: "Pro", value: "99k" },
      { label: "Premium", value: "199k" }
    ]
  };
}

function buildOnboardingStepResult(state: OnboardingAiState): OnboardingAiResult {
  const stepActions: Record<number, OnboardingAgentAction[]> = {
    0: [
      { id: "create-account", label: "Tạo tài khoản", description: "Dùng email thật để nhận thông báo đơn và reset mật khẩu.", tone: "primary" },
      { id: "compare-plan", label: "So sánh Pro/Premium", description: "Chọn gói theo nhu cầu vận hành.", tone: "secondary" }
    ],
    1: [
      { id: "finish-profile", label: "Hoàn thiện hồ sơ quán", description: "Tên, slug, địa chỉ và hotline giúp QR/hóa đơn rõ ràng.", tone: "primary" },
      { id: "short-slug", label: "Giữ slug ngắn", description: "Slug dễ đọc giúp khách mở link nhanh.", tone: "secondary" }
    ],
    2: [
      { id: "generate-menu", label: "Tạo menu mẫu", description: "AI có thể thêm danh mục/món mẫu vào onboarding.", tone: "primary" },
      { id: "pick-business-type", label: "Chốt mô hình quán", description: "Mô hình đúng giúp menu và số bàn hợp lý hơn.", tone: "secondary" }
    ],
    3: [
      { id: "suggest-tables", label: "Gợi ý số bàn", description: "Số bàn quyết định số QR cần in.", tone: "primary" },
      { id: "vietqr-ready", label: "Kiểm VietQR", description: "Ngân hàng và số tài khoản cần đúng trước khi bán thật.", tone: "secondary" }
    ],
    4: [
      { id: "final-review", label: "Kiểm tra lần cuối", description: "Menu, bàn QR, VietQR và gói cần sẵn sàng trước khi tạo quán.", tone: "primary" },
      { id: "open-dashboard-next", label: "Sau khi tạo", description: "Vào dashboard để in QR và bật nhận đơn.", tone: "secondary" }
    ]
  };

  const stepName = ["Tài khoản", "Thông tin quán", "Thực đơn", "Bàn & QR", "Hoàn tất"][state.step] ?? "Setup";
  const missing = [
    !state.restaurantName ? "tên quán" : "",
    !state.slug ? "slug" : "",
    !state.businessType ? "mô hình quán" : "",
    !state.tableCount ? "số bàn" : "",
    !(state.bankCode && state.bankAccount) ? "VietQR" : ""
  ].filter(Boolean);

  return {
    title: `Bước ${state.step + 1}: ${stepName}`,
    text: missing.length
      ? `Bạn đang ở bước ${stepName}. Cần hoàn thiện ${missing.slice(0, 3).join(", ")} để quán có thể bán thật mượt hơn.`
      : `Bước ${stepName} đang đủ dữ liệu chính. Tiếp tục hoàn tất để vào dashboard in QR và kiểm thử đơn đầu tiên.`,
    actions: stepActions[state.step] ?? stepActions[4],
    metrics: [
      { label: "Bước", value: `${state.step + 1}/5` },
      { label: "Thiếu", value: missing.length }
    ]
  };
}

function runOnboardingAgent(input: {
  message: string;
  state: OnboardingAiState;
  onApplyMenuSuggestion?: (menus: MenuSuggestion[]) => void;
  onApplyTableCount?: (count: number) => void;
  onApplyBusinessType?: (type: string) => void;
}): OnboardingAiResult {
  const text = foldOnboardingText(input.message);
  const businessType = normalizeBusinessType(input.state.businessType);

  if (/goi|plan|premium|pro|gia|phi/.test(text)) {
    return buildPlanExplanation();
  }

  if (/mo hinh|loai quan|chon loai|business type|cafe|ca phe|pho|bun|com|bar|fast|pizza|burger/.test(text)) {
    const { suggested, reason } = inferBusinessType(input.message);
    input.onApplyBusinessType?.(suggested);
    return {
      text: `Mình chọn ${suggested} vì nhận diện đây là ${reason}. Nếu chưa đúng, bạn vẫn có thể đổi ở bước mô hình quán.`,
      actions: [
        { id: "business-type-applied", label: "Đã áp dụng mô hình", description: reason, tone: "primary" },
        { id: "menu-from-type", label: "Tạo menu theo mô hình", description: "Hỏi: tạo menu mẫu cho mô hình này.", tone: "secondary" }
      ],
      metrics: [{ label: "Loại quán", value: suggested }]
    };
  }

  if (/menu|thuc don|mon|ocr|tao mau|tao menu/.test(text)) {
    const menus = buildSampleMenu(businessType, input.message, inferPriceRange(input.message));
    input.onApplyMenuSuggestion?.(menus);
    const totalItems = menus.reduce((sum, category) => sum + category.items.length, 0);
    return {
      text: `Đã tạo menu mẫu cho ${businessType}: ${menus.length} danh mục, ${totalItems} món. Menu đã được áp dụng vào onboarding để lưu khi tạo quán.`,
      actions: [
        { id: "menu-applied", label: "Đã áp dụng menu", description: "Sau khi tạo quán, vào dashboard để chỉnh ảnh/giá.", tone: "primary" },
        { id: "table-next", label: "Tiếp tục số bàn", description: "Hỏi LogiBot gợi ý số bàn nếu chưa chắc.", tone: "secondary" }
      ],
      metrics: [
        { label: "Danh mục", value: menus.length },
        { label: "Món", value: totalItems }
      ]
    };
  }

  if (/ban|qr|so ban|m2|m²|dien tich/.test(text)) {
    const suggestion = calculateTableSuggestion(businessType, extractAreaSqm(input.message));
    input.onApplyTableCount?.(suggestion.recommended);
    return {
      text: `Mình đề xuất ${suggestion.recommended} bàn và đã điền vào onboarding. Lý do: ${suggestion.reasoning}.`,
      actions: [
        { id: "tables-applied", label: "Đã áp dụng số bàn", description: "Số bàn này sẽ tạo QR tương ứng.", tone: "primary" },
        { id: "vietqr-next", label: "Hoàn thiện VietQR", description: "Kiểm ngân hàng và số tài khoản trước khi bán thật.", tone: "secondary" }
      ],
      metrics: [{ label: "Bàn", value: suggestion.recommended }]
    };
  }

  return buildOnboardingStepResult(input.state);
}

function AiResultCard({
  title,
  status,
  text,
  result
}: {
  title: string;
  status?: string;
  text?: string;
  result?: OnboardingAiResult | string;
}) {
  const isLoading = status === "executing" || status === "inProgress";
  const payload = typeof result === "string" ? { text: result } : result;
  const displayTitle = payload?.title || title;
  const displayText = sanitizeCardText(payload?.text ?? text);
  const actions = payload?.actions ?? [];
  const metrics = payload?.metrics ?? [];

  return (
    <div className="logibot-agent-card rounded-[28px] border border-[var(--border)] p-4 text-sm text-[var(--foreground)] shadow-[var(--shadow-soft)]">
      <div className="relative z-[1] flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--primary)] text-white">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{displayTitle}</p>
          <p className="truncate text-xs text-[var(--muted-foreground)]">{isLoading ? "Đang xử lý..." : "Setup action card"}</p>
        </div>
      </div>
      {metrics.length ? (
        <div className="relative z-[1] mt-3 grid grid-cols-2 gap-2">
          {metrics.slice(0, 2).map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-[rgba(15,77,58,0.1)] bg-white/55 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{metric.label}</p>
              <p className="mt-1 text-lg font-black text-[var(--primary)]">{metric.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="relative z-[1] mt-3 whitespace-pre-line leading-6 text-[var(--text-secondary)]">
        {isLoading ? "Đang xử lý..." : displayText}
      </p>
      {actions.length ? (
        <div className="relative z-[1] mt-3 grid gap-2">
          {actions.slice(0, 4).map((action) => (
            <div
              key={action.id}
              className={`rounded-2xl border px-3 py-3 ${
                action.tone === "primary"
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[#FFF7EB]"
                  : "border-[var(--border)] bg-white/60 text-[var(--foreground)]"
              }`}
            >
              <p className="text-sm font-semibold">{action.label}</p>
              {action.description ? (
                <p className={`mt-1 text-xs leading-5 ${action.tone === "primary" ? "text-[#FFF7EB]/82" : "text-[var(--muted-foreground)]"}`}>
                  {action.description}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Export ─── */
export function OnboardingCopilotLayer(props: OnboardingCopilotProps) {
  const threadId = buildCopilotThreadId("logivn", "onboarding", "setup");

  return (
    <LogiVNCopilotProvider threadId={threadId}>
      <OnboardingCopilotExperience {...props} />
    </LogiVNCopilotProvider>
  );
}
