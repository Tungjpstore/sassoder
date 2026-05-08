"use client";

import { useCallback, useState } from "react";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotReadable } from "@copilotkit/react-core";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { CopilotSidebar } from "@copilotkit/react-core/v2";
import { Bot, Sparkles, X } from "lucide-react";
import { LogiVNCopilotProvider } from "@/components/ai/logivn-copilot-provider";

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
        "Bạn là LogiBot, trợ lý thiết lập quán cho LogiVN.",
        "Luôn trả lời bằng tiếng Việt tự nhiên, ngắn gọn, thân thiện.",
        "Vai trò: hướng dẫn user qua từng bước onboarding, giải thích tại sao cần mỗi thông tin.",
        "Gợi ý tối ưu dựa trên loại quán đã chọn.",
        "Nếu user hỏi về tính năng, giải thích plan Pro vs Premium.",
        "Khi user ở bước Thực đơn, chủ động hỏi có muốn tạo menu mẫu không.",
        "Khi user ở bước Bàn & QR, gợi ý số bàn phù hợp.",
        `Ngữ cảnh bước hiện tại: ${stepContextMap[state.step] ?? "Không rõ bước."}`,
        "Không yêu cầu API key, token hay dữ liệu nhạy cảm.",
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
        return `Đã tạo ${menus.length} danh mục với ${totalItems} món mẫu. Menu sẽ tự động được thêm vào quán sau khi hoàn tất đăng ký. Bạn có thể chỉnh sửa chi tiết trong dashboard sau.`;
      },
      render: ({ status, result }) => (
        <AiResultCard
          title="Menu mẫu AI"
          status={status}
          text={typeof result === "string" ? result : "Đang tạo menu mẫu..."}
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
        return `Gợi ý: ${suggested.recommended} bàn (${suggested.reasoning}). Đã tự điền cho bạn, có thể điều chỉnh thêm.`;
      },
      render: ({ status, result }) => (
        <AiResultCard
          title="Gợi ý số bàn"
          status={status}
          text={typeof result === "string" ? result : "Đang tính toán..."}
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
        return [
          "📦 LogiVN Pro (99k/tháng):",
          "• QR gọi món theo bàn, đơn realtime",
          "• Bán online qua link riêng",
          "• AI vận hành cơ bản (LogiBot)",
          "• Quản lý nhân viên, thanh toán VietQR",
          "",
          "💎 LogiVN Premium (199k/tháng):",
          "• Tất cả tính năng Pro",
          "• Đặt bàn online + nhận cọc tự động",
          "• AI OCR menu (chụp/upload PDF → tự nhập)",
          "• AI sinh ảnh món, mô tả menu",
          "• Báo cáo nâng cao + AI phân tích doanh thu",
          "",
          "Cả 2 gói đều được thử miễn phí 30 ngày."
        ].join("\n");
      },
      render: ({ status, result }) => (
        <AiResultCard
          title="So sánh gói dịch vụ"
          status={status}
          text={typeof result === "string" ? result : "Đang lấy thông tin..."}
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
        const lower = description.toLowerCase();
        let suggested = "RESTAURANT";
        let reason = "Quán ăn phổ thông";

        if (/cafe|cà phê|coffee|trà|tea|bánh/.test(lower)) {
          suggested = "CAFE";
          reason = "Quán cafe / trà / bánh ngọt";
        } else if (/bar|pub|cocktail|bia|rượu|nhậu/.test(lower)) {
          suggested = "BAR";
          reason = "Bar / pub / quán nhậu";
        } else if (/nhanh|fast|burger|pizza|gà rán|ăn vặt|combo/.test(lower)) {
          suggested = "FAST_FOOD";
          reason = "Đồ ăn nhanh / ăn vặt";
        } else if (/phở|bún|cơm|lẩu|nướng|hải sản|đặc sản/.test(lower)) {
          suggested = "RESTAURANT";
          reason = "Quán ăn / nhà hàng";
        }

        onApplyBusinessType?.(suggested);
        return `Gợi ý: ${reason} (${suggested}). Đã chọn cho bạn, bạn có thể đổi nếu chưa đúng.`;
      },
      render: ({ status, result }) => (
        <AiResultCard
          title="Gợi ý mô hình quán"
          status={status}
          text={typeof result === "string" ? result : "Đang phân tích..."}
        />
      )
    },
    [onApplyBusinessType]
  );

  return (
    <>
      {/* FAB toggle button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-28 right-5 z-[1190] flex h-14 items-center gap-2.5 rounded-full border border-[var(--primary)]/20 bg-[var(--surface)] px-4 text-sm font-bold text-[var(--primary-strong)] shadow-[var(--glow-primary)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(52,211,153,0.2)] md:bottom-28 md:right-6"
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
            welcomeMessageText: "Chào bạn! Mình giúp bạn thiết lập quán nhanh hơn. Hỏi bất cứ điều gì về menu, số bàn, gói dịch vụ hay cách vận hành nhé!",
            chatInputPlaceholder: "Hỏi LogiBot: tạo menu mẫu, gợi ý số bàn...",
            chatDisclaimerText: "LogiBot gợi ý dựa trên kinh nghiệm vận hành 1000+ quán. Bạn luôn có thể chỉnh sửa sau.",
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

function AiResultCard({ title, status, text }: { title: string; status?: string; text: string }) {
  const isLoading = status === "executing" || status === "inProgress";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-sm text-[var(--foreground)]">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--primary)] text-white">
          <Sparkles size={15} />
        </span>
        <p className="font-bold">{title}</p>
      </div>
      <p className="mt-3 whitespace-pre-line leading-6 text-[var(--text-secondary)]">
        {isLoading ? "Đang xử lý..." : text}
      </p>
    </div>
  );
}

/* ─── Export ─── */
export function OnboardingCopilotLayer(props: OnboardingCopilotProps) {
  return (
    <LogiVNCopilotProvider>
      <OnboardingCopilotExperience {...props} />
    </LogiVNCopilotProvider>
  );
}
