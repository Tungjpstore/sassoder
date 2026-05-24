import type { AiAutomationPlaybookStatus } from "@/lib/ai/automation-playbooks";
import type { AiRecommendationPriority, AiRecommendationType } from "@/lib/ai/recommendation-engine";

export type AiGrowthCampaignType =
  | "quiet_hour"
  | "combo_builder"
  | "upsell"
  | "retention"
  | "menu_refresh"
  | "pricing_guard"
  | "delivery_push";

export type AiGrowthCampaignStatus = "ready" | "draft" | "blocked";
export type AiGrowthCampaignChannel = "facebook" | "zalo" | "qr_menu" | "online_ordering" | "push" | "staff_script";

export type AiGrowthRecommendationSignal = {
  id: string;
  type: AiRecommendationType | string;
  priority: AiRecommendationPriority;
  title: string;
  detail: string;
  action?: string | null;
  actionHref?: string | null;
  estimatedImpactLabel?: string | null;
};

export type AiGrowthPlaybookSignal = {
  id: string;
  domain: string;
  status: AiAutomationPlaybookStatus;
  title: string;
  readinessScore: number;
};

export type AiGrowthCampaign = {
  id: string;
  type: AiGrowthCampaignType;
  title: string;
  status: AiGrowthCampaignStatus;
  priority: "critical" | "high" | "medium";
  audience: string;
  offer: string;
  messageAngle: string;
  conversionGoal: string;
  safetyNote: string;
  channels: AiGrowthCampaignChannel[];
  actionHref: string;
  estimatedImpact: string;
  sourceSignals: string[];
  blockers: string[];
  nextAction: string;
};

export type AiGrowthStudioDeck = {
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    draft: number;
    blocked: number;
    highPriority: number;
    activePromotions: number;
    memoryCount: number;
  };
  campaigns: AiGrowthCampaign[];
  copyKits: Array<{
    id: string;
    label: string;
    channel: AiGrowthCampaignChannel;
    prompt: string;
  }>;
};

export type BuildAiGrowthStudioDeckInput = {
  providerConfigured: boolean;
  schemas: {
    recommendations: boolean;
    restaurantMemories: boolean;
  };
  memoryCount?: number;
  activePromotionCount?: number;
  recommendations?: AiGrowthRecommendationSignal[];
  playbooks?: AiGrowthPlaybookSignal[];
};

const growthRecommendationTypes = new Set<string>([
  "combo",
  "upsell",
  "promotion",
  "customer_retention",
  "menu",
  "pricing"
]);

const priorityRank: Record<AiGrowthCampaign["priority"], number> = {
  critical: 3,
  high: 2,
  medium: 1
};

function priorityFromSignals(signals: AiGrowthRecommendationSignal[], fallback: AiGrowthCampaign["priority"]): AiGrowthCampaign["priority"] {
  if (signals.some((signal) => signal.priority === "critical")) return "critical";
  if (signals.some((signal) => signal.priority === "high")) return "high";
  return fallback;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function statusFromBlockers(blockers: string[], sourceSignals: string[]): AiGrowthCampaignStatus {
  if (blockers.length) return "blocked";
  return sourceSignals.length ? "ready" : "draft";
}

function needsProviderBlocker(input: BuildAiGrowthStudioDeckInput) {
  return input.providerConfigured ? [] : ["Chưa có provider AI configured để sinh nội dung và biến thể chiến dịch."];
}

function needsRecommendationBlocker(input: BuildAiGrowthStudioDeckInput) {
  return input.schemas.recommendations ? [] : ["Chưa bật recommendation lifecycle để lưu tín hiệu tăng trưởng."];
}

function needsMemoryBlocker(input: BuildAiGrowthStudioDeckInput) {
  if (!input.schemas.restaurantMemories) return ["Chưa bật restaurant memory để giữ giọng thương hiệu và chính sách quán."];
  if ((input.memoryCount ?? 0) <= 0) return ["Chưa có memory brand/menu/policy để cá nhân hóa nội dung."];
  return [];
}

function buildCampaign(input: {
  id: string;
  type: AiGrowthCampaignType;
  title: string;
  priority: AiGrowthCampaign["priority"];
  audience: string;
  offer: string;
  messageAngle: string;
  conversionGoal: string;
  safetyNote: string;
  channels: AiGrowthCampaignChannel[];
  actionHref: string;
  estimatedImpact: string;
  sourceSignals: string[];
  blockers: string[];
  nextActionReady: string;
  nextActionDraft: string;
}): AiGrowthCampaign {
  const status = statusFromBlockers(input.blockers, input.sourceSignals);
  return {
    ...input,
    status,
    nextAction: status === "blocked" ? input.blockers[0] ?? "Hoàn tất cấu hình trước khi chạy chiến dịch." : status === "ready" ? input.nextActionReady : input.nextActionDraft
  };
}

function signalsByType(recommendations: AiGrowthRecommendationSignal[], types: string[]) {
  const typeSet = new Set(types);
  return recommendations.filter((recommendation) => typeSet.has(recommendation.type));
}

function playbookSignals(playbooks: AiGrowthPlaybookSignal[], domains: string[]) {
  const domainSet = new Set(domains);
  return playbooks
    .filter((playbook) => domainSet.has(playbook.domain) && playbook.status === "ready")
    .map((playbook) => playbook.title);
}

function copyPrompt(campaign: AiGrowthCampaign, channel: AiGrowthCampaignChannel) {
  const channelLabel: Record<AiGrowthCampaignChannel, string> = {
    facebook: "Facebook",
    zalo: "Zalo",
    qr_menu: "QR menu",
    online_ordering: "online ordering",
    push: "push notification",
    staff_script: "script cho nhân viên"
  };

  return [
    `Viết nội dung ${channelLabel[channel]} cho quán F&B Việt Nam.`,
    `Chiến dịch: ${campaign.title}.`,
    `Khách mục tiêu: ${campaign.audience}.`,
    `Offer: ${campaign.offer}.`,
    `Góc truyền thông: ${campaign.messageAngle}.`,
    `Mục tiêu: ${campaign.conversionGoal}.`,
    `Lưu ý an toàn: ${campaign.safetyNote}.`,
    "Output ngắn, tự nhiên, có CTA rõ, không hứa quá đà, không giảm giá sâu nếu không cần."
  ].join("\n");
}

export function buildAiGrowthStudioDeck(input: BuildAiGrowthStudioDeckInput): AiGrowthStudioDeck {
  const recommendations = input.recommendations ?? [];
  const playbooks = input.playbooks ?? [];
  const growthSignals = recommendations.filter((recommendation) => growthRecommendationTypes.has(recommendation.type));
  const providerBlockers = needsProviderBlocker(input);
  const recommendationBlockers = needsRecommendationBlocker(input);
  const memoryBlockers = needsMemoryBlocker(input);

  const promotionSignals = signalsByType(recommendations, ["promotion"]);
  const comboSignals = signalsByType(recommendations, ["combo", "upsell", "menu"]);
  const retentionSignals = signalsByType(recommendations, ["customer_retention"]);
  const pricingSignals = signalsByType(recommendations, ["pricing"]);
  const marketingPlaybooks = playbookSignals(playbooks, ["marketing"]);
  const customerPlaybooks = playbookSignals(playbooks, ["customer"]);

  const campaigns = [
    buildCampaign({
      id: "growth-quiet-hour",
      type: "quiet_hour",
      title: "Kéo khách giờ thấp điểm",
      priority: priorityFromSignals(promotionSignals, "high"),
      audience: "Khách gần quán, khách đã từng order và nhóm văn phòng/đi học trong khung vắng.",
      offer: input.activePromotionCount ? "Tối ưu lại promotion đang chạy thay vì tạo mã mới." : "Combo nhỏ hoặc freeship có min order để bảo vệ biên lợi nhuận.",
      messageAngle: "Nhắc nhẹ một ưu đãi có thời hạn, tập trung vào món dễ chốt và tốc độ phục vụ.",
      conversionGoal: "Tăng số đơn trong 2-4 giờ thấp điểm tiếp theo.",
      safetyNote: "Không giảm sâu toàn menu; ưu tiên min order, combo hoặc topping.",
      channels: ["facebook", "zalo", "push", "online_ordering"],
      actionHref: "/dashboard/promotions",
      estimatedImpact: "Kéo doanh thu ngắn hạn",
      sourceSignals: uniqueStrings([...promotionSignals.map((signal) => signal.title), ...marketingPlaybooks]),
      blockers: [...providerBlockers, ...recommendationBlockers],
      nextActionReady: "Mở khuyến mãi, duyệt offer và tạo nội dung Facebook/Zalo.",
      nextActionDraft: "Giữ sẵn campaign, đợi AI Ops phát hiện doanh thu thấp hoặc giờ vắng."
    }),
    buildCampaign({
      id: "growth-combo-builder",
      type: "combo_builder",
      title: "Biến món mạnh thành combo",
      priority: priorityFromSignals(comboSignals, "high"),
      audience: "Khách gọi món bán chạy, nhóm 2-4 người và khách order online.",
      offer: "Combo món chính + topping/đồ uống thêm, hoặc size upgrade có biên tốt.",
      messageAngle: "Gợi ý lựa chọn tiện hơn thay vì ép mua thêm.",
      conversionGoal: "Tăng average ticket và tỷ lệ add-on.",
      safetyNote: "Không gợi ý món hết hàng; không tạo combo làm giảm margin.",
      channels: ["qr_menu", "online_ordering", "staff_script"],
      actionHref: "/dashboard/menu",
      estimatedImpact: "Tăng giá trị đơn",
      sourceSignals: uniqueStrings([...comboSignals.map((signal) => signal.title), ...customerPlaybooks]),
      blockers: [...providerBlockers, ...recommendationBlockers, ...memoryBlockers],
      nextActionReady: "Mở menu, chọn món anchor và duyệt combo/upsell.",
      nextActionDraft: "Bổ sung memory về best-seller và giọng thương hiệu trước khi tạo combo."
    }),
    buildCampaign({
      id: "growth-retention",
      type: "retention",
      title: "Kéo khách quay lại",
      priority: priorityFromSignals(retentionSignals, "medium"),
      audience: "Khách từng mua nhưng chưa quay lại, khách trung thành và khách order nhóm.",
      offer: "Ưu đãi quay lại hoặc quà nhỏ gắn với món khách hay chọn.",
      messageAngle: "Cảm giác được nhớ đúng món, không spam.",
      conversionGoal: "Tăng repeat order và loyalty engagement.",
      safetyNote: "Không lộ dữ liệu cá nhân; dùng segment hành vi ở mức tổng hợp.",
      channels: ["zalo", "push", "online_ordering"],
      actionHref: "/dashboard/analytics",
      estimatedImpact: "Tăng khách quay lại",
      sourceSignals: retentionSignals.map((signal) => signal.title),
      blockers: [...providerBlockers, ...recommendationBlockers, ...memoryBlockers],
      nextActionReady: "Duyệt nội dung chăm sóc khách quay lại theo segment.",
      nextActionDraft: "Đợi thêm tín hiệu khách quay lại hoặc thêm memory về loyalty policy."
    }),
    buildCampaign({
      id: "growth-menu-refresh",
      type: "menu_refresh",
      title: "Làm mới menu theo mùa",
      priority: "medium",
      audience: "Khách thích món mới, đồ uống theo mùa và nhóm khách social.",
      offer: "Món seasonal, topping mới hoặc ảnh/mô tả mới cho món cần đẩy.",
      messageAngle: "Tươi mới, dễ thử, hợp thời điểm trong ngày hoặc thời tiết.",
      conversionGoal: "Tăng CTR menu và tỷ lệ thử món mới.",
      safetyNote: "Không dùng ảnh gây hiểu nhầm so với món thật; mô tả phải đúng thành phần.",
      channels: ["qr_menu", "facebook", "online_ordering"],
      actionHref: "/dashboard/menu",
      estimatedImpact: "Tăng sức hút menu",
      sourceSignals: comboSignals.filter((signal) => signal.type === "menu").map((signal) => signal.title),
      blockers: [...providerBlockers, ...memoryBlockers],
      nextActionReady: "Tạo mô tả món, ảnh gợi ý hoặc layout menu theo seasonal angle.",
      nextActionDraft: "Thêm memory về phong cách quán và món signature để AI viết đúng hơn."
    }),
    buildCampaign({
      id: "growth-pricing-guard",
      type: "pricing_guard",
      title: "Bảo vệ giá và biên lợi nhuận",
      priority: priorityFromSignals(pricingSignals, "medium"),
      audience: "Chủ quán và quản lý menu.",
      offer: "Điều chỉnh giá, min order hoặc combo để tránh khuyến mãi làm mất biên.",
      messageAngle: "Tăng doanh thu nhưng không đổi lấy thất thoát margin.",
      conversionGoal: "Giữ margin khi chạy campaign.",
      safetyNote: "Mọi đổi giá cần xác nhận thủ công và nên kiểm tra food cost.",
      channels: ["staff_script", "qr_menu"],
      actionHref: "/dashboard/inventory",
      estimatedImpact: "Giảm rủi ro lỗ khuyến mãi",
      sourceSignals: pricingSignals.map((signal) => signal.title),
      blockers: [...recommendationBlockers],
      nextActionReady: "Rà các món/campaign có rủi ro margin trước khi bật promotion.",
      nextActionDraft: "Đợi tín hiệu pricing hoặc food cost trước khi đề xuất đổi giá."
    })
  ].sort((left, right) => {
    if (left.status !== right.status) return left.status === "ready" ? -1 : right.status === "ready" ? 1 : 0;
    return priorityRank[right.priority] - priorityRank[left.priority];
  });

  const copyKits = campaigns
    .filter((campaign) => campaign.status !== "blocked")
    .flatMap((campaign) =>
      campaign.channels.slice(0, 2).map((channel) => ({
        id: `${campaign.id}-${channel}`,
        label: `${campaign.title} · ${channel}`,
        channel,
        prompt: copyPrompt(campaign, channel)
      }))
    )
    .slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: campaigns.length,
      ready: campaigns.filter((campaign) => campaign.status === "ready").length,
      draft: campaigns.filter((campaign) => campaign.status === "draft").length,
      blocked: campaigns.filter((campaign) => campaign.status === "blocked").length,
      highPriority: campaigns.filter((campaign) => campaign.priority === "critical" || campaign.priority === "high").length,
      activePromotions: input.activePromotionCount ?? 0,
      memoryCount: input.memoryCount ?? 0
    },
    campaigns,
    copyKits: growthSignals.length || (input.memoryCount ?? 0) > 0 ? copyKits : []
  };
}
