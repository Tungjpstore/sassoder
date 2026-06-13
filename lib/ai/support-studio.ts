import type { RestaurantMemoryCategory } from "@/lib/ai/memory/retrieval";
import type { AiRecommendationPriority, AiRecommendationType } from "@/lib/ai/recommendation-engine";

export type AiSupportScenarioType =
  | "menu_question"
  | "opening_hours"
  | "reservation_help"
  | "order_status"
  | "delivery_question"
  | "payment_question"
  | "complaint_handoff"
  | "allergy_policy";

export type AiSupportScenarioStatus = "ready" | "draft" | "blocked";
export type AiSupportEscalationMode = "self_serve" | "confirm_first" | "human_handoff";
export type AiSupportChannel = "website" | "qr_ordering" | "messenger" | "zalo" | "telegram" | "whatsapp";

export type AiSupportMemorySignal = {
  id: string;
  category: RestaurantMemoryCategory;
  title: string;
  sensitivity: "public" | "internal" | "sensitive";
};

export type AiSupportRecommendationSignal = {
  id: string;
  type: AiRecommendationType | string;
  priority: AiRecommendationPriority;
  title: string;
};

export type AiSupportScenario = {
  id: string;
  type: AiSupportScenarioType;
  title: string;
  status: AiSupportScenarioStatus;
  priority: "critical" | "high" | "medium";
  escalationMode: AiSupportEscalationMode;
  customerIntent: string;
  answerStrategy: string;
  allowedData: string[];
  blockedData: string[];
  guardrails: string[];
  sampleReply: string;
  prompt: string;
  channels: AiSupportChannel[];
  actionHref: string;
  sourceSignals: string[];
  blockers: string[];
  nextAction: string;
};

export type AiSupportStudioDeck = {
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    draft: number;
    blocked: number;
    handoff: number;
    publicMemoryCount: number;
    supportMemoryCount: number;
    activeSignals: number;
  };
  scenarios: AiSupportScenario[];
  replyKits: Array<{
    id: string;
    label: string;
    channel: AiSupportChannel;
    prompt: string;
  }>;
  channelReadiness: Array<{
    channel: AiSupportChannel;
    label: string;
    status: "ready" | "preview" | "future";
    detail: string;
  }>;
  guardrails: Array<{
    id: string;
    title: string;
    detail: string;
  }>;
};

export type BuildAiSupportStudioDeckInput = {
  providerConfigured: boolean;
  schemas: {
    restaurantMemories: boolean;
    recommendations?: boolean;
  };
  memories?: AiSupportMemorySignal[];
  recommendations?: AiSupportRecommendationSignal[];
};

type ScenarioTemplate = Omit<AiSupportScenario, "status" | "sourceSignals" | "blockers" | "nextAction"> & {
  requiredCategories: RestaurantMemoryCategory[];
  optionalSignalTypes: string[];
  readyAction: string;
  draftAction: string;
};

const supportCategories = new Set<RestaurantMemoryCategory>(["brand", "menu", "operations", "policy"]);
const supportSignalTypes = new Set<string>(["menu", "payment", "customer_retention", "promotion"]);

const priorityRank: Record<AiSupportScenario["priority"], number> = {
  critical: 3,
  high: 2,
  medium: 1
};

const scenarioTemplates: ScenarioTemplate[] = [
  {
    id: "support-menu-question",
    type: "menu_question",
    title: "Hỏi món, topping và món bán chạy",
    priority: "high",
    escalationMode: "self_serve",
    customerIntent: "Khách muốn biết món nào hợp khẩu vị, topping nào nên thêm hoặc món nào đang nổi bật.",
    answerStrategy: "Trả lời ngắn theo menu memory, gợi ý 1-2 lựa chọn và một upsell nhẹ nếu có tín hiệu.",
    allowedData: ["Tên món", "mô tả công khai", "topping", "giá hiển thị", "khuyến mãi public"],
    blockedData: ["Food cost", "margin", "doanh thu món", "dữ liệu khách khác"],
    guardrails: ["Không bịa món chưa có trong menu.", "Không hứa còn hàng nếu hệ thống chưa xác nhận tồn.", "Không ép upsell quá đà."],
    sampleReply: "Món dễ chọn nhất hôm nay là trà đào. Nếu thích vị đậm hơn, bạn có thể thêm topping theo menu hiện có.",
    prompt: "Trả lời câu hỏi menu cho khách F&B Việt Nam. Chỉ dùng dữ liệu menu/policy được cung cấp, tối đa 3 câu, có gợi ý nhẹ nếu phù hợp.",
    channels: ["website", "qr_ordering", "messenger", "zalo"],
    actionHref: "/dashboard/menu",
    requiredCategories: ["menu"],
    optionalSignalTypes: ["menu", "promotion"],
    readyAction: "Dùng reply kit này cho FAQ menu, QR ordering và tin nhắn hỏi món.",
    draftAction: "Thêm memory menu: món signature, topping, món nên đẩy và món cần tránh gợi ý."
  },
  {
    id: "support-opening-hours",
    type: "opening_hours",
    title: "Giờ mở cửa, địa chỉ và chính sách cơ bản",
    priority: "high",
    escalationMode: "self_serve",
    customerIntent: "Khách hỏi quán còn mở không, địa chỉ, nhận khách tới mấy giờ hoặc quy định chung.",
    answerStrategy: "Ưu tiên policy/operations memory, trả lời chắc chắn và chuyển người thật nếu thiếu dữ liệu.",
    allowedData: ["Giờ mở cửa public", "địa chỉ chi nhánh", "hotline", "chính sách public"],
    blockedData: ["Lịch nội bộ", "doanh thu chi nhánh", "thông tin nhân sự"],
    guardrails: ["Không đoán giờ mở cửa.", "Nếu nhiều chi nhánh, yêu cầu khách chọn chi nhánh.", "Không đưa ghi chú nội bộ ra ngoài."],
    sampleReply: "Quán hiện trả lời theo giờ hoạt động đã lưu. Bạn cho mình biết chi nhánh muốn ghé để mình kiểm tra đúng nhé.",
    prompt: "Trả lời câu hỏi giờ mở cửa/địa chỉ. Nếu thiếu chi nhánh hoặc thiếu policy, hỏi lại một câu ngắn thay vì đoán.",
    channels: ["website", "messenger", "zalo", "whatsapp"],
    actionHref: "/dashboard/settings",
    requiredCategories: ["policy", "operations"],
    optionalSignalTypes: [],
    readyAction: "Bật câu trả lời public cho website và kênh chat có kiểm soát.",
    draftAction: "Bổ sung memory policy/operations về giờ mở cửa, địa chỉ, hotline và quy định nhận khách."
  },
  {
    id: "support-reservation-help",
    type: "reservation_help",
    title: "Hỗ trợ đặt bàn và đổi lịch",
    priority: "high",
    escalationMode: "confirm_first",
    customerIntent: "Khách muốn đặt bàn, đổi giờ, hủy lịch hoặc hỏi bàn trống.",
    answerStrategy: "Thu thập số khách, thời gian, chi nhánh và thông tin liên hệ; thao tác giữ bàn phải qua xác nhận.",
    allowedData: ["Khung giờ đặt bàn", "sức chứa bàn", "chính sách giữ bàn", "trạng thái đặt bàn của khách hiện tại"],
    blockedData: ["Danh sách khách khác", "số điện thoại khách khác", "ghi chú nhạy cảm"],
    guardrails: ["Không xác nhận đặt bàn nếu chưa có slot.", "Không lộ booking của khách khác.", "Đổi/hủy lịch cần xác nhận."],
    sampleReply: "Mình có thể hỗ trợ đặt bàn. Bạn cho mình số khách, thời gian muốn đến và chi nhánh nhé.",
    prompt: "Hỗ trợ khách đặt bàn F&B. Thu thập đủ thông tin cần thiết, không xác nhận slot nếu tool chưa trả về slot hợp lệ.",
    channels: ["website", "messenger", "zalo"],
    actionHref: "/dashboard/reservations",
    requiredCategories: ["policy", "operations"],
    optionalSignalTypes: ["customer_retention"],
    readyAction: "Dùng flow confirm-first cho đặt bàn, đổi lịch và chuyển nhân viên khi có ngoại lệ.",
    draftAction: "Thêm memory về chính sách đặt bàn, giữ bàn, hủy lịch và rule theo chi nhánh."
  },
  {
    id: "support-order-status",
    type: "order_status",
    title: "Tra cứu trạng thái đơn hàng",
    priority: "critical",
    escalationMode: "confirm_first",
    customerIntent: "Khách hỏi đơn đang ở đâu, bao lâu có món hoặc giao hàng tới chưa.",
    answerStrategy: "Chỉ trả lời từ order tool theo mã đơn/số điện thoại đã xác minh, không đoán SLA.",
    allowedData: ["Trạng thái đơn của chính khách", "ETA từ hệ thống", "mã đơn", "kênh nhận hàng"],
    blockedData: ["Đơn của khách khác", "doanh thu", "ghi chú vận hành nội bộ", "payment evidence nhạy cảm"],
    guardrails: ["Luôn xác minh mã đơn hoặc thông tin liên hệ.", "Không hiển thị dữ liệu khách khác.", "Khi trạng thái lệch, chuyển nhân viên."],
    sampleReply: "Bạn gửi giúp mình mã đơn hoặc số điện thoại đặt hàng để mình kiểm tra đúng đơn nhé.",
    prompt: "Hỗ trợ tra cứu đơn hàng. Yêu cầu định danh đơn trước, chỉ tóm tắt trạng thái an toàn và chuyển người thật khi dữ liệu lệch.",
    channels: ["website", "qr_ordering", "messenger", "zalo"],
    actionHref: "/dashboard/orders",
    requiredCategories: ["policy"],
    optionalSignalTypes: ["payment"],
    readyAction: "Gắn kịch bản này với order lookup tool và bắt buộc xác minh trước khi trả trạng thái.",
    draftAction: "Bổ sung policy về tra cứu đơn, SLA bếp/giao hàng và rule chuyển nhân viên."
  },
  {
    id: "support-delivery-question",
    type: "delivery_question",
    title: "Hỏi giao hàng, phí ship và khu vực phục vụ",
    priority: "medium",
    escalationMode: "self_serve",
    customerIntent: "Khách hỏi quán có giao tới khu vực của họ, phí ship hoặc thời gian giao dự kiến.",
    answerStrategy: "Dùng policy giao hàng public, hỏi địa chỉ/khu vực nếu thiếu, không cam kết ETA nếu chưa có đơn.",
    allowedData: ["Khu vực giao public", "phí ship public", "kênh đặt online", "chính sách freeship"],
    blockedData: ["Địa chỉ khách khác", "thông tin shipper nội bộ", "chi phí vận hành"],
    guardrails: ["Không cam kết ship ngoài vùng.", "Không tự giảm phí ship.", "Không lưu địa chỉ nếu không cần xử lý đơn."],
    sampleReply: "Bạn cho mình khu vực giao hàng để mình kiểm tra chính sách ship phù hợp nhé.",
    prompt: "Trả lời câu hỏi giao hàng cho khách. Hỏi thêm khu vực khi cần, dùng chính sách public và không hứa ngoài phạm vi.",
    channels: ["website", "messenger", "zalo", "whatsapp"],
    actionHref: "/dashboard/online",
    requiredCategories: ["policy", "operations"],
    optionalSignalTypes: ["promotion"],
    readyAction: "Đưa vào FAQ online ordering và tin nhắn hỏi ship.",
    draftAction: "Bổ sung policy vùng giao, phí ship, min order và ngoại lệ theo chi nhánh."
  },
  {
    id: "support-payment-question",
    type: "payment_question",
    title: "Thanh toán, VietQR và hoàn tiền",
    priority: "critical",
    escalationMode: "human_handoff",
    customerIntent: "Khách hỏi đã chuyển khoản chưa, thanh toán lỗi, muốn đổi phương thức hoặc hoàn tiền.",
    answerStrategy: "Giải thích bước an toàn, yêu cầu bằng chứng phù hợp và chuyển nhân viên cho mọi hoàn tiền/tranh chấp.",
    allowedData: ["Phương thức thanh toán public", "trạng thái thanh toán của đơn đã xác minh", "hướng dẫn gửi mã giao dịch"],
    blockedData: ["Tài khoản ngân hàng nội bộ", "giao dịch khách khác", "quyết định hoàn tiền tự động"],
    guardrails: ["Không tự xác nhận tiền nếu payment tool chưa xác nhận.", "Không tự hoàn tiền.", "Không yêu cầu thông tin thẻ nhạy cảm."],
    sampleReply: "Mình sẽ chuyển nhân viên kiểm tra giao dịch giúp bạn. Bạn gửi mã đơn và ảnh/chứng từ chuyển khoản nếu có nhé.",
    prompt: "Xử lý câu hỏi thanh toán ở chế độ handoff. Không tự xác nhận tiền hoặc hoàn tiền nếu chưa có bằng chứng từ hệ thống.",
    channels: ["website", "qr_ordering", "messenger", "zalo"],
    actionHref: "/dashboard/payments",
    requiredCategories: ["policy"],
    optionalSignalTypes: ["payment"],
    readyAction: "Dùng handoff script cho VietQR, thanh toán treo và hoàn tiền.",
    draftAction: "Thêm policy thanh toán, hoàn tiền, VietQR và bằng chứng giao dịch được chấp nhận."
  },
  {
    id: "support-complaint-handoff",
    type: "complaint_handoff",
    title: "Khiếu nại và chuyển người thật",
    priority: "critical",
    escalationMode: "human_handoff",
    customerIntent: "Khách phàn nàn món, phục vụ, giao hàng, thanh toán hoặc trải nghiệm tại quán.",
    answerStrategy: "Xin lỗi ngắn, thu thập mã đơn/chi nhánh/thời gian và chuyển quản lý; không tranh luận.",
    allowedData: ["Mã đơn của khách", "chi nhánh liên quan", "thời gian sự cố", "mô tả vấn đề"],
    blockedData: ["Đổ lỗi nhân viên", "thông tin khách khác", "quyết định bồi thường tự động"],
    guardrails: ["Không tranh cãi.", "Không hứa bồi thường nếu chưa duyệt.", "Không nêu tên nhân viên công khai."],
    sampleReply: "Mình rất tiếc vì trải nghiệm này. Mình sẽ chuyển quản lý kiểm tra ngay, bạn gửi giúp mã đơn hoặc thời gian ghé quán nhé.",
    prompt: "Xử lý khiếu nại F&B với thái độ bình tĩnh. Xin lỗi ngắn, thu thập dữ kiện, chuyển người thật, không hứa bồi thường.",
    channels: ["website", "messenger", "zalo", "telegram", "whatsapp"],
    actionHref: "/dashboard/settings",
    requiredCategories: ["policy"],
    optionalSignalTypes: [],
    readyAction: "Bật kịch bản handoff cho mọi channel có khách nhắn trực tiếp.",
    draftAction: "Bổ sung policy xử lý khiếu nại, SLA phản hồi và người phụ trách theo chi nhánh."
  },
  {
    id: "support-allergy-policy",
    type: "allergy_policy",
    title: "Dị ứng, thành phần và cảnh báo an toàn",
    priority: "critical",
    escalationMode: "human_handoff",
    customerIntent: "Khách hỏi món có thành phần dị ứng, caffeine, sữa, hạt hoặc yêu cầu an toàn thực phẩm.",
    answerStrategy: "Chỉ nói theo thành phần đã lưu, khuyến nghị hỏi nhân viên nếu có dị ứng nghiêm trọng.",
    allowedData: ["Thành phần public", "cảnh báo dị ứng đã lưu", "option bỏ topping nếu có"],
    blockedData: ["Cam kết y tế", "thành phần chưa xác minh", "thay thế không được bếp xác nhận"],
    guardrails: ["Không đưa lời khuyên y tế.", "Không cam kết không nhiễm chéo nếu không có policy.", "Dị ứng nghiêm trọng phải chuyển nhân viên."],
    sampleReply: "Nếu bạn có dị ứng nghiêm trọng, mình sẽ chuyển nhân viên xác nhận trực tiếp với bếp trước khi đặt món.",
    prompt: "Trả lời câu hỏi dị ứng/thành phần. Chỉ dùng dữ liệu đã xác minh, không tư vấn y tế, ưu tiên handoff khi rủi ro cao.",
    channels: ["website", "qr_ordering", "messenger", "zalo"],
    actionHref: "/dashboard/menu",
    requiredCategories: ["menu", "policy"],
    optionalSignalTypes: ["menu"],
    readyAction: "Gắn cảnh báo dị ứng vào menu/QR và chuyển nhân viên khi khách nêu dị ứng nghiêm trọng.",
    draftAction: "Thêm memory thành phần, cảnh báo dị ứng và policy nhiễm chéo trước khi trả lời tự động."
  }
];

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function memoryCategories(memories: AiSupportMemorySignal[]) {
  return new Set(memories.filter((memory) => supportCategories.has(memory.category)).map((memory) => memory.category));
}

function missingCategories(requiredCategories: RestaurantMemoryCategory[], categories: Set<RestaurantMemoryCategory>) {
  return requiredCategories.filter((category) => !categories.has(category));
}

function categoryLabel(category: RestaurantMemoryCategory) {
  if (category === "brand") return "brand";
  if (category === "menu") return "menu";
  if (category === "policy") return "policy";
  return "operations";
}

function statusFromBlockers(blockers: string[], missing: RestaurantMemoryCategory[]): AiSupportScenarioStatus {
  if (blockers.length) return "blocked";
  if (missing.length) return "draft";
  return "ready";
}

function replyPrompt(scenario: AiSupportScenario, channel: AiSupportChannel) {
  const channelLabel = channel === "qr_ordering" ? "QR ordering" : channel;

  return [
    `Kênh: ${channelLabel}.`,
    `Nhiệm vụ: ${scenario.title}.`,
    `Ý định khách: ${scenario.customerIntent}.`,
    `Chiến lược trả lời: ${scenario.answerStrategy}.`,
    `Dữ liệu được dùng: ${scenario.allowedData.join(", ")}.`,
    `Không được dùng: ${scenario.blockedData.join(", ")}.`,
    `Escalation: ${scenario.escalationMode}.`,
    "Output tiếng Việt, tối đa 3 câu, thân thiện, không bịa dữ liệu, không lộ thông tin nội bộ."
  ].join("\n");
}

function memorySignalsForScenario(template: ScenarioTemplate, memories: AiSupportMemorySignal[]) {
  const categories = new Set(template.requiredCategories);
  return memories
    .filter((memory) => categories.has(memory.category))
    .map((memory) => memory.title)
    .slice(0, 4);
}

function recommendationSignalsForScenario(template: ScenarioTemplate, recommendations: AiSupportRecommendationSignal[]) {
  const signalTypes = new Set(template.optionalSignalTypes);
  return recommendations
    .filter((recommendation) => signalTypes.has(recommendation.type) && supportSignalTypes.has(recommendation.type))
    .map((recommendation) => recommendation.title)
    .slice(0, 4);
}

function scenarioBlockers(input: BuildAiSupportStudioDeckInput) {
  const blockers: string[] = [];
  if (!input.providerConfigured) blockers.push("Chưa có provider AI configured cho customer support.");
  if (!input.schemas.restaurantMemories) blockers.push("Chưa bật restaurant memory để lưu FAQ, policy và menu context.");
  return blockers;
}

function buildScenario(
  template: ScenarioTemplate,
  input: BuildAiSupportStudioDeckInput,
  categories: Set<RestaurantMemoryCategory>
): AiSupportScenario {
  const { requiredCategories, readyAction, draftAction } = template;
  const memories = input.memories ?? [];
  const recommendations = input.recommendations ?? [];
  const blockers = scenarioBlockers(input);
  const missing = missingCategories(requiredCategories, categories);
  const status = statusFromBlockers(blockers, missing);
  const missingLabels = missing.map(categoryLabel).join(", ");
  const sourceSignals = uniqueStrings([
    ...memorySignalsForScenario(template, memories),
    ...recommendationSignalsForScenario(template, recommendations)
  ]);

  return {
    id: template.id,
    type: template.type,
    title: template.title,
    priority: template.priority,
    escalationMode: template.escalationMode,
    customerIntent: template.customerIntent,
    answerStrategy: template.answerStrategy,
    allowedData: template.allowedData,
    blockedData: template.blockedData,
    guardrails: template.guardrails,
    sampleReply: template.sampleReply,
    prompt: template.prompt,
    channels: template.channels,
    actionHref: template.actionHref,
    status,
    sourceSignals,
    blockers,
    nextAction:
      status === "blocked"
        ? blockers[0] ?? "Hoàn tất cấu hình AI support trước khi bật kênh khách."
        : status === "draft"
          ? `${draftAction}${missingLabels ? ` Thiếu memory: ${missingLabels}.` : ""}`
          : readyAction
  };
}

function channelReadiness(scenarios: AiSupportScenario[]) {
  const readyScenarios = scenarios.filter((scenario) => scenario.status === "ready");
  const hasWebsite = readyScenarios.some((scenario) => scenario.channels.includes("website"));
  const hasQr = readyScenarios.some((scenario) => scenario.channels.includes("qr_ordering"));

  return [
    {
      channel: "website" as const,
      label: "Website widget",
      status: hasWebsite ? ("ready" as const) : ("preview" as const),
      detail: hasWebsite ? "Có kịch bản FAQ public đủ điều kiện." : "Cần thêm memory public/policy trước khi bật tự động."
    },
    {
      channel: "qr_ordering" as const,
      label: "QR ordering",
      status: hasQr ? ("ready" as const) : ("preview" as const),
      detail: hasQr ? "Có thể gắn hỗ trợ menu/order ở QR." : "Cần menu/policy memory để tránh trả lời sai món."
    },
    {
      channel: "messenger" as const,
      label: "Messenger",
      status: "preview" as const,
      detail: "Sẵn sàng về logic, cần connector và quyền fanpage."
    },
    {
      channel: "zalo" as const,
      label: "Zalo OA",
      status: "preview" as const,
      detail: "Chuẩn bị prompt/guardrail cho thị trường Việt Nam, chờ connector."
    },
    {
      channel: "whatsapp" as const,
      label: "WhatsApp",
      status: "future" as const,
      detail: "Future-ready cho chuỗi có khách du lịch hoặc thị trường ngoài Việt Nam."
    }
  ];
}

export function buildAiSupportStudioDeck(input: BuildAiSupportStudioDeckInput): AiSupportStudioDeck {
  const memories = input.memories ?? [];
  const recommendations = input.recommendations ?? [];
  const categories = memoryCategories(memories);
  const scenarios = scenarioTemplates
    .map((template) => buildScenario(template, input, categories))
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "ready" ? -1 : right.status === "ready" ? 1 : 0;
      return priorityRank[right.priority] - priorityRank[left.priority];
    });
  const replyKits = scenarios
    .filter((scenario) => scenario.status !== "blocked")
    .flatMap((scenario) =>
      scenario.channels.slice(0, 2).map((channel) => ({
        id: `${scenario.id}-${channel}`,
        label: `${scenario.title} · ${channel === "qr_ordering" ? "QR" : channel}`,
        channel,
        prompt: replyPrompt(scenario, channel)
      }))
    )
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: scenarios.length,
      ready: scenarios.filter((scenario) => scenario.status === "ready").length,
      draft: scenarios.filter((scenario) => scenario.status === "draft").length,
      blocked: scenarios.filter((scenario) => scenario.status === "blocked").length,
      handoff: scenarios.filter((scenario) => scenario.escalationMode === "human_handoff").length,
      publicMemoryCount: memories.filter((memory) => memory.sensitivity === "public").length,
      supportMemoryCount: memories.filter((memory) => supportCategories.has(memory.category)).length,
      activeSignals: recommendations.filter((recommendation) => supportSignalTypes.has(recommendation.type)).length
    },
    scenarios,
    replyKits,
    channelReadiness: channelReadiness(scenarios),
    guardrails: [
      {
        id: "no-financial-hallucination",
        title: "Không bịa dữ liệu đơn/tiền",
        detail: "AI chỉ trả lời trạng thái đơn, thanh toán và hoàn tiền từ tool hoặc chuyển nhân viên."
      },
      {
        id: "privacy-first",
        title: "Không lộ PII",
        detail: "Mọi câu hỏi order/reservation phải xác minh khách và không hiển thị dữ liệu người khác."
      },
      {
        id: "menu-truth",
        title: "Không bịa menu",
        detail: "Chỉ dùng menu/policy memory hoặc dữ liệu public; món hết hàng và dị ứng cần xác nhận."
      },
      {
        id: "handoff-sensitive",
        title: "Handoff tình huống nhạy cảm",
        detail: "Khiếu nại, dị ứng nghiêm trọng, hoàn tiền và tranh chấp thanh toán luôn có người thật."
      }
    ]
  };
}
