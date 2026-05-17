import type { RestaurantMemoryCategory } from "@/lib/ai/memory/retrieval";
import type { AiRecommendationPriority, AiRecommendationType } from "@/lib/ai/recommendation-engine";

export type AiMenuOpportunityType =
  | "image_refresh"
  | "combo_builder"
  | "modifier_upsell"
  | "seasonal_item"
  | "pricing_guard"
  | "availability_cleanup"
  | "category_balance"
  | "menu_copy";

export type AiMenuOpportunityStatus = "ready" | "draft" | "blocked";
export type AiMenuStudioChannel = "qr_menu" | "online_ordering" | "staff_script" | "facebook" | "zalo" | "menu_editor";

export type AiMenuStudioItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  isAvailable: boolean;
  modifierGroupCount?: number;
  modifierOptionCount?: number;
  isTopSeller?: boolean;
};

export type AiMenuMemorySignal = {
  id: string;
  category: RestaurantMemoryCategory;
  title: string;
  sensitivity: "public" | "internal" | "sensitive";
};

export type AiMenuRecommendationSignal = {
  id: string;
  type: AiRecommendationType | string;
  priority: AiRecommendationPriority;
  title: string;
  detail?: string | null;
};

export type AiMenuOpportunity = {
  id: string;
  type: AiMenuOpportunityType;
  title: string;
  status: AiMenuOpportunityStatus;
  priority: "critical" | "high" | "medium";
  target: string;
  reason: string;
  action: string;
  safetyNote: string;
  channels: AiMenuStudioChannel[];
  actionHref: string;
  estimatedImpact: string;
  sourceSignals: string[];
  blockers: string[];
  nextAction: string;
};

export type AiMenuStudioDeck = {
  generatedAt: string;
  summary: {
    totalItems: number;
    availableItems: number;
    pausedItems: number;
    missingImageItems: number;
    modifierCoveragePercent: number;
    topSellerCount: number;
    opportunities: number;
    ready: number;
    draft: number;
    blocked: number;
  };
  opportunities: AiMenuOpportunity[];
  promptKits: Array<{
    id: string;
    label: string;
    channel: AiMenuStudioChannel;
    prompt: string;
  }>;
  menuHealth: Array<{
    id: string;
    label: string;
    value: string;
    status: "good" | "watch" | "risk";
    detail: string;
  }>;
  guardrails: Array<{
    id: string;
    title: string;
    detail: string;
  }>;
};

export type BuildAiMenuStudioDeckInput = {
  providerConfigured: boolean;
  schemas: {
    recommendations?: boolean;
    restaurantMemories?: boolean;
  };
  items: AiMenuStudioItem[];
  memories?: AiMenuMemorySignal[];
  recommendations?: AiMenuRecommendationSignal[];
};

const menuMemoryCategories = new Set<RestaurantMemoryCategory>(["brand", "menu", "marketing", "policy"]);
const menuRecommendationTypes = new Set<string>(["combo", "upsell", "menu", "pricing", "promotion"]);

const priorityRank: Record<AiMenuOpportunity["priority"], number> = {
  critical: 3,
  high: 2,
  medium: 1
};

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")}đ`;
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function priorityFromSignals(signals: AiMenuRecommendationSignal[], fallback: AiMenuOpportunity["priority"]) {
  if (signals.some((signal) => signal.priority === "critical")) return "critical";
  if (signals.some((signal) => signal.priority === "high")) return "high";
  return fallback;
}

function statusFrom(blockers: string[], sourceSignals: string[], hasDraftSignal = false): AiMenuOpportunityStatus {
  if (blockers.length) return "blocked";
  if (sourceSignals.length || hasDraftSignal) return "ready";
  return "draft";
}

function providerBlockers(input: BuildAiMenuStudioDeckInput) {
  return input.providerConfigured ? [] : ["Chưa có provider AI configured để tạo mô tả, prompt ảnh và combo copy."];
}

function memoryBlockers(input: BuildAiMenuStudioDeckInput) {
  if (!input.schemas.restaurantMemories) return ["Chưa bật restaurant memory để giữ brand voice và policy menu."];
  if (!(input.memories ?? []).some((memory) => menuMemoryCategories.has(memory.category))) {
    return ["Chưa có memory brand/menu/marketing để AI viết đúng phong cách quán."];
  }
  return [];
}

function recommendationBlockers(input: BuildAiMenuStudioDeckInput) {
  return input.schemas.recommendations ? [] : ["Chưa bật recommendation lifecycle để nối tín hiệu menu với AI Ops."];
}

function signalsByType(recommendations: AiMenuRecommendationSignal[], types: string[]) {
  const typeSet = new Set(types);
  return recommendations.filter((recommendation) => typeSet.has(recommendation.type));
}

function topItems(input: BuildAiMenuStudioDeckInput) {
  return input.items.filter((item) => item.isTopSeller);
}

function itemsMissingImages(items: AiMenuStudioItem[]) {
  return items.filter((item) => item.isAvailable && !item.imageUrl);
}

function itemsWithoutModifiers(items: AiMenuStudioItem[]) {
  return items.filter((item) => item.isAvailable && (item.modifierGroupCount ?? 0) === 0);
}

function categoryCounts(items: AiMenuStudioItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.categoryName, (counts.get(item.categoryName) ?? 0) + 1);
  }
  return counts;
}

function weakestCategory(items: AiMenuStudioItem[]) {
  const counts = Array.from(categoryCounts(items).entries()).sort((left, right) => left[1] - right[1]);
  return counts[0] ?? null;
}

function averagePrice(items: AiMenuStudioItem[]) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + item.price, 0) / items.length;
}

function buildOpportunity(input: {
  id: string;
  type: AiMenuOpportunityType;
  title: string;
  priority: AiMenuOpportunity["priority"];
  target: string;
  reason: string;
  action: string;
  safetyNote: string;
  channels: AiMenuStudioChannel[];
  actionHref: string;
  estimatedImpact: string;
  sourceSignals: string[];
  blockers: string[];
  hasDraftSignal?: boolean;
  nextActionReady: string;
  nextActionDraft: string;
}): AiMenuOpportunity {
  const status = statusFrom(input.blockers, input.sourceSignals, input.hasDraftSignal);
  return {
    ...input,
    status,
    nextAction: status === "blocked" ? input.blockers[0] ?? "Hoàn tất cấu hình trước khi dùng AI Menu Studio." : status === "ready" ? input.nextActionReady : input.nextActionDraft
  };
}

function promptFor(opportunity: AiMenuOpportunity, channel: AiMenuStudioChannel) {
  const channelLabel: Record<AiMenuStudioChannel, string> = {
    qr_menu: "QR menu",
    online_ordering: "online ordering",
    staff_script: "script nhân viên",
    facebook: "Facebook",
    zalo: "Zalo",
    menu_editor: "menu editor"
  };

  return [
    `Tạo nội dung cho ${channelLabel[channel]} của quán F&B Việt Nam.`,
    `Việc cần làm: ${opportunity.title}.`,
    `Đối tượng/menu target: ${opportunity.target}.`,
    `Lý do: ${opportunity.reason}.`,
    `Hành động: ${opportunity.action}.`,
    `Lưu ý an toàn: ${opportunity.safetyNote}.`,
    "Output ngắn, rõ, không bịa thành phần/giá, không hứa còn hàng, không làm giảm margin nếu thiếu dữ liệu."
  ].join("\n");
}

function menuHealth(input: {
  items: AiMenuStudioItem[];
  missingImageCount: number;
  modifierCoveragePercent: number;
  pausedItems: number;
}) {
  return [
    {
      id: "image-coverage",
      label: "Ảnh món",
      value: `${Math.max(0, input.items.length - input.missingImageCount)}/${input.items.length}`,
      status: input.missingImageCount === 0 ? ("good" as const) : input.missingImageCount <= 3 ? ("watch" as const) : ("risk" as const),
      detail: input.missingImageCount ? `${input.missingImageCount} món đang thiếu ảnh hiển thị.` : "Menu có ảnh đủ để bán online/QR."
    },
    {
      id: "modifier-coverage",
      label: "Topping/option",
      value: percent(input.modifierCoveragePercent),
      status: input.modifierCoveragePercent >= 60 ? ("good" as const) : input.modifierCoveragePercent >= 30 ? ("watch" as const) : ("risk" as const),
      detail: "Tỷ lệ món có ít nhất một nhóm topping hoặc tùy chọn."
    },
    {
      id: "availability",
      label: "Món đang bán",
      value: `${input.items.length - input.pausedItems}/${input.items.length}`,
      status: input.pausedItems <= 2 ? ("good" as const) : input.pausedItems <= 6 ? ("watch" as const) : ("risk" as const),
      detail: input.pausedItems ? `${input.pausedItems} món đang tạm ngưng, cần rà menu public.` : "Không có món tạm ngưng."
    }
  ];
}

export function buildAiMenuStudioDeck(input: BuildAiMenuStudioDeckInput): AiMenuStudioDeck {
  const items = input.items;
  const availableItems = items.filter((item) => item.isAvailable);
  const pausedItems = items.length - availableItems.length;
  const missingImages = itemsMissingImages(items);
  const noModifierItems = itemsWithoutModifiers(items);
  const menuSignals = signalsByType(input.recommendations ?? [], ["menu", "combo", "upsell"]);
  const pricingSignals = signalsByType(input.recommendations ?? [], ["pricing"]);
  const promotionSignals = signalsByType(input.recommendations ?? [], ["promotion"]);
  const provider = providerBlockers(input);
  const memory = memoryBlockers(input);
  const recommendation = recommendationBlockers(input);
  const top = topItems(input);
  const weakest = weakestCategory(availableItems);
  const avgPrice = averagePrice(availableItems);
  const modifierCoveragePercent = availableItems.length ? ((availableItems.length - noModifierItems.length) / availableItems.length) * 100 : 0;
  const imageTargets = missingImages.slice(0, 4).map((item) => item.name);
  const modifierTargets = noModifierItems.slice(0, 4).map((item) => item.name);
  const topTargets = top.slice(0, 4).map((item) => item.name);

  const opportunities = [
    buildOpportunity({
      id: "menu-image-refresh",
      type: "image_refresh",
      title: "Bổ sung ảnh cho món cần bán online",
      priority: missingImages.length >= 5 ? "high" : "medium",
      target: imageTargets.length ? imageTargets.join(", ") : "Các món chưa có ảnh",
      reason: missingImages.length ? `${missingImages.length} món đang bán chưa có ảnh.` : "Ảnh món đã đủ, giữ prompt để làm mới seasonal.",
      action: "Tạo prompt ảnh món sạch, đúng nguyên liệu, góc chụp dùng được cho QR và online ordering.",
      safetyNote: "Ảnh AI phải giống món thật, không thêm topping/size không bán.",
      channels: ["menu_editor", "qr_menu", "online_ordering"],
      actionHref: "/dashboard/menu",
      estimatedImpact: "Tăng độ tin cậy menu",
      sourceSignals: imageTargets,
      blockers: provider,
      hasDraftSignal: missingImages.length > 0,
      nextActionReady: "Mở menu, tạo ảnh cho các món thiếu ảnh và duyệt trước khi publish.",
      nextActionDraft: "Giữ bộ prompt ảnh cho lần refresh seasonal tiếp theo."
    }),
    buildOpportunity({
      id: "menu-combo-builder",
      type: "combo_builder",
      title: "Biến món bán mạnh thành combo",
      priority: priorityFromSignals(menuSignals, "high"),
      target: topTargets.length ? topTargets.join(", ") : "Món bán chạy hoặc món chủ lực",
      reason: menuSignals.length ? "AI Ops đang có tín hiệu combo/upsell/menu." : "Top seller có thể kéo thêm topping, size hoặc món kèm.",
      action: "Đề xuất combo anchor + add-on có biên tốt, kèm script nhân viên và copy QR menu.",
      safetyNote: "Không tạo combo làm giảm margin; mọi giá/offer cần chủ quán duyệt.",
      channels: ["qr_menu", "online_ordering", "staff_script"],
      actionHref: "/dashboard/menu",
      estimatedImpact: "Tăng giá trị đơn",
      sourceSignals: uniqueStrings([...topTargets, ...menuSignals.map((signal) => signal.title)]),
      blockers: [...provider, ...recommendation],
      hasDraftSignal: topTargets.length > 0,
      nextActionReady: "Chọn một món anchor, tạo combo và gắn upsell vào QR/online.",
      nextActionDraft: "Đợi dữ liệu món bán chạy hoặc đánh dấu món chủ lực trong báo cáo."
    }),
    buildOpportunity({
      id: "menu-modifier-upsell",
      type: "modifier_upsell",
      title: "Tăng topping và tùy chọn món",
      priority: noModifierItems.length >= 5 ? "high" : "medium",
      target: modifierTargets.length ? modifierTargets.join(", ") : "Các món chưa có topping",
      reason: `${Math.round(modifierCoveragePercent)}% món đang bán có topping/option.`,
      action: "Gợi ý nhóm topping/size/độ ngọt phù hợp để tăng AOV mà không làm menu rối.",
      safetyNote: "Không gợi ý topping không có trong vận hành; option bắt buộc cần min/max rõ.",
      channels: ["menu_editor", "qr_menu", "staff_script"],
      actionHref: "/dashboard/menu",
      estimatedImpact: "Tăng add-on",
      sourceSignals: uniqueStrings([...modifierTargets, ...menuSignals.map((signal) => signal.title)]),
      blockers: provider,
      hasDraftSignal: noModifierItems.length > 0,
      nextActionReady: "Thêm topping/option cho nhóm món dễ upsell trước.",
      nextActionDraft: "Menu đã có coverage tốt; dùng AI để chuẩn hóa tên nhóm topping."
    }),
    buildOpportunity({
      id: "menu-seasonal-refresh",
      type: "seasonal_item",
      title: "Làm mới món theo mùa",
      priority: "medium",
      target: weakest ? `${weakest[0]} (${weakest[1]} món)` : "Danh mục cần làm mới",
      reason: weakest ? `Danh mục ${weakest[0]} đang mỏng hơn các nhóm khác.` : "Menu cần lịch refresh để giữ sự mới mẻ.",
      action: "Tạo ý tưởng món seasonal, mô tả ngắn và kênh launch phù hợp thị trường Việt Nam.",
      safetyNote: "Không thêm món nếu bếp/kho chưa đáp ứng; mọi món mới là bản nháp.",
      channels: ["menu_editor", "facebook", "zalo"],
      actionHref: "/dashboard/menu",
      estimatedImpact: "Tăng sức hút menu",
      sourceSignals: uniqueStrings([weakest?.[0] ?? "", ...promotionSignals.map((signal) => signal.title)]),
      blockers: [...provider, ...memory],
      hasDraftSignal: Boolean(weakest),
      nextActionReady: "Duyệt một món seasonal thử nghiệm và tạo copy launch.",
      nextActionDraft: "Bổ sung memory về phong cách quán, món signature và nguyên liệu seasonal."
    }),
    buildOpportunity({
      id: "menu-pricing-guard",
      type: "pricing_guard",
      title: "Rà giá và ngưỡng combo",
      priority: priorityFromSignals(pricingSignals, "medium"),
      target: `Giá trung bình ${money(avgPrice)}`,
      reason: pricingSignals.length ? "Có tín hiệu pricing cần kiểm tra." : "Cần kiểm tra giá trước khi chạy combo/promotion.",
      action: "Tạo checklist giá, min order và biên an toàn trước khi publish campaign.",
      safetyNote: "AI không tự đổi giá; mọi thay đổi cần chủ quán xác nhận.",
      channels: ["menu_editor", "staff_script"],
      actionHref: "/dashboard/menu",
      estimatedImpact: "Giảm rủi ro mất biên",
      sourceSignals: pricingSignals.map((signal) => signal.title),
      blockers: recommendation,
      hasDraftSignal: availableItems.length > 0,
      nextActionReady: "Rà các món/combo sắp chạy và xác nhận giá trước khi publish.",
      nextActionDraft: "Đợi thêm dữ liệu food cost hoặc recommendation pricing."
    }),
    buildOpportunity({
      id: "menu-availability-cleanup",
      type: "availability_cleanup",
      title: "Dọn món tạm ngưng khỏi menu public",
      priority: pausedItems >= 5 ? "high" : "medium",
      target: pausedItems ? `${pausedItems} món tạm ngưng` : "Menu public",
      reason: pausedItems ? "Có món tạm ngưng cần rà trước giờ cao điểm." : "Menu đang sạch, giữ checklist trước ca bán.",
      action: "Rà món hết hàng/tạm ngưng, đồng bộ nhân viên và tránh gợi ý món không bán.",
      safetyNote: "Không tự bật lại món nếu kho/bếp chưa xác nhận.",
      channels: ["menu_editor", "qr_menu", "staff_script"],
      actionHref: "/dashboard/menu",
      estimatedImpact: "Giảm order lỗi",
      sourceSignals: pausedItems ? [`${pausedItems} món tạm ngưng`] : [],
      blockers: [],
      hasDraftSignal: pausedItems > 0,
      nextActionReady: "Mở menu, xác nhận món tạm ngưng và cập nhật script nhân viên.",
      nextActionDraft: "Menu chưa có rủi ro availability rõ; tiếp tục theo dõi."
    })
  ].sort((left, right) => {
    if (left.status !== right.status) return left.status === "ready" ? -1 : right.status === "ready" ? 1 : 0;
    return priorityRank[right.priority] - priorityRank[left.priority];
  });

  const promptKits = opportunities
    .filter((opportunity) => opportunity.status !== "blocked")
    .flatMap((opportunity) =>
      opportunity.channels.slice(0, 2).map((channel) => ({
        id: `${opportunity.id}-${channel}`,
        label: `${opportunity.title} · ${channel}`,
        channel,
        prompt: promptFor(opportunity, channel)
      }))
    )
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalItems: items.length,
      availableItems: availableItems.length,
      pausedItems,
      missingImageItems: missingImages.length,
      modifierCoveragePercent: Math.round(modifierCoveragePercent),
      topSellerCount: top.length,
      opportunities: opportunities.length,
      ready: opportunities.filter((opportunity) => opportunity.status === "ready").length,
      draft: opportunities.filter((opportunity) => opportunity.status === "draft").length,
      blocked: opportunities.filter((opportunity) => opportunity.status === "blocked").length
    },
    opportunities,
    promptKits,
    menuHealth: menuHealth({ items, missingImageCount: missingImages.length, modifierCoveragePercent, pausedItems }),
    guardrails: [
      {
        id: "truthful-menu",
        title: "Không bịa món hoặc thành phần",
        detail: "Prompt chỉ được dựa trên món, topping và policy đang có; món mới luôn là bản nháp."
      },
      {
        id: "margin-safe",
        title: "Không tự giảm giá",
        detail: "Combo, promotion và thay đổi giá cần chủ quán duyệt, ưu tiên min order và add-on có biên tốt."
      },
      {
        id: "availability-safe",
        title: "Không gợi ý món tạm ngưng",
        detail: "Món paused hoặc hết hàng không được đưa vào upsell, chatbot hoặc campaign."
      },
      {
        id: "image-honesty",
        title: "Ảnh phải gần món thật",
        detail: "Không thêm topping, size, bao bì hoặc nguyên liệu không bán trong ảnh AI."
      }
    ]
  };
}
