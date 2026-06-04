import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { buildAgentMission } from "@/lib/ai/agent-mission";
import { buildCommandDeck } from "@/lib/ai/command-deck";
import { recordAiSecurityEvent } from "@/lib/ai/security-audit";
import {
  getOwnerAgentToolContract,
  normalizeOwnerAgentCommand,
  normalizeOwnerAgentDomain,
  ownerAgentToolRegistry,
  type OwnerAgentCommand,
  type OwnerAgentDomain,
  type OwnerAgentToolContract
} from "@/lib/ai/owner-agent-command";
import { buildOperationalPassport } from "@/lib/ai/operational-passport";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { buildAiAutomationWorkflows, type AiAutomationWorkflow } from "@/lib/ai/automation-workflows";
import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";
import { getOwnerOperationalSnapshot } from "@/services/ai/runtime";
import type { OwnerAiIntent } from "@/services/ai-prompt-router";
import { persistAiAutomationRuns } from "@/services/ai-automation-run-service";
import { createInventoryPurchaseOrder, getInventorySnapshot } from "@/services/inventory-service";
import { createCategory, createMenuItem, listMenuForAdmin, type AdminMenuCategory } from "@/services/menu-service";
import { createPromotion } from "@/services/promotion-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";

type RestaurantAgentContext = {
  id: string;
  name: string;
  slug: string;
  business_type: string | null;
  address: string | null;
  hotline: string | null;
  description: string | null;
};

type AgentExecutionStatus = "planned" | "created" | "workflow_ready" | "manual_only" | "blocked";

type CreatedRecord = {
  type: string;
  id?: string | null;
  label: string;
  route?: string;
};

export type OwnerAgentExecutionResult = {
  reply: string;
  text: string;
  intent: OwnerAgentDomain;
  intentLabel: string;
  suggestions: string[];
  actions: AiAgentAction[];
  agentPlan: AiAgentPlan;
  mission: ReturnType<typeof buildAgentMission>;
  commandDeck: ReturnType<typeof buildCommandDeck>;
  passport: ReturnType<typeof buildOperationalPassport>;
  agentExecution: {
    domain: OwnerAgentDomain;
    command: OwnerAgentCommand;
    status: AgentExecutionStatus;
    confirmationRequired: boolean;
    route: string;
    dataNeeds: string[];
    writes: string[];
    createdRecords: CreatedRecord[];
    safetyNotes: string[];
    auditTrail: string[];
  };
};

type ExecuteOwnerAgentCommandInput = {
  restaurantId: string;
  userId: string;
  message: string;
  domain?: string | null;
  intent?: string | null;
  command?: string | null;
  confirm?: boolean;
  approvalToken?: string | null;
  mode?: "plan" | "draft" | "execute";
  context?: Record<string, unknown>;
};

const OWNER_AGENT_APPROVAL_TTL_MS = 5 * 60_000;
const OWNER_AGENT_APPROVAL_TABLE = "ai_owner_agent_approval_tokens";

function formatVnd(value: number) {
  return `${Math.max(0, Math.round(value || 0)).toLocaleString("vi-VN")}đ`;
}

function safeText(value: string, fallback: string, maxLength = 140) {
  const compact = value.replace(/\s+/g, " ").trim();
  return (compact || fallback).slice(0, maxLength);
}

function ownerAgentApprovalSecret() {
  const secret =
    process.env.AI_AGENT_APPROVAL_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!secret?.trim()) {
    throw new AppError("Chưa cấu hình khóa ký xác nhận AI agent.", 500);
  }

  return secret;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function hashApprovalMessage(message: string) {
  return createHash("sha256").update(safeText(message, "owner request", 3000)).digest("base64url");
}

function hashApprovalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function signApprovalPayload(encodedPayload: string) {
  return createHmac("sha256", ownerAgentApprovalSecret()).update(encodedPayload).digest("base64url");
}

function isMissingApprovalTokenSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

function createOwnerAgentApprovalPayload(input: {
  restaurantId: string;
  userId: string;
  domain: OwnerAgentDomain;
  command: OwnerAgentCommand;
  message: string;
}) {
  const now = Date.now();
  return {
    v: 1,
    nonce: randomUUID(),
    restaurantId: input.restaurantId,
    userId: input.userId,
    domain: input.domain,
    command: input.command,
    mode: "execute",
    messageHash: hashApprovalMessage(input.message),
    issuedAt: now,
    expiresAt: now + OWNER_AGENT_APPROVAL_TTL_MS
  };
}

function encodeOwnerAgentApprovalToken(payload: Record<string, unknown>) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  return `${encodedPayload}.${signApprovalPayload(encodedPayload)}`;
}

function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseOwnerAgentApprovalToken(
  token: string | null | undefined,
  input: {
    restaurantId: string;
    userId: string;
    domain: OwnerAgentDomain;
    command: OwnerAgentCommand;
    message: string;
  }
) {
  if (!token) {
    throw new AppError("Thiếu mã xác nhận an toàn cho AI agent.", 403);
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !signaturesMatch(signature, signApprovalPayload(encodedPayload))) {
    throw new AppError("Mã xác nhận AI agent không hợp lệ.", 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new AppError("Mã xác nhận AI agent không hợp lệ.", 403);
  }
  const expiresAt = typeof payload.expiresAt === "number" ? payload.expiresAt : 0;
  const nonce = typeof payload.nonce === "string" ? payload.nonce : "";
  const matchesScope =
    payload.v === 1 &&
    nonce.length > 0 &&
    payload.restaurantId === input.restaurantId &&
    payload.userId === input.userId &&
    payload.domain === input.domain &&
    payload.command === input.command &&
    payload.mode === "execute" &&
    payload.messageHash === hashApprovalMessage(input.message);

  if (!matchesScope || expiresAt < Date.now()) {
    throw new AppError("Mã xác nhận AI agent đã hết hạn hoặc không khớp lệnh hiện tại.", 403);
  }

  return {
    nonce,
    expiresAt: new Date(expiresAt).toISOString(),
    messageHash: String(payload.messageHash),
    tokenHash: hashApprovalToken(token)
  };
}

async function issueOwnerAgentApprovalToken(input: {
  restaurantId: string;
  userId: string;
  domain: OwnerAgentDomain;
  command: OwnerAgentCommand;
  message: string;
}) {
  const payload = createOwnerAgentApprovalPayload(input);
  const token = encodeOwnerAgentApprovalToken(payload);
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase.from(OWNER_AGENT_APPROVAL_TABLE).insert({
    restaurant_id: input.restaurantId,
    user_id: input.userId,
    token_nonce: payload.nonce,
    token_hash: hashApprovalToken(token),
    domain: input.domain,
    command: input.command,
    message_hash: payload.messageHash,
    status: "pending",
    expires_at: new Date(payload.expiresAt).toISOString()
  });

  if (result.error) {
    if (isMissingApprovalTokenSchema(result.error)) {
      throw new AppError("Bảng xác nhận AI agent chưa sẵn sàng. Vui lòng chạy migration bảo mật mới trước khi bật execute.", 500);
    }
    throw result.error;
  }

  return token;
}

async function consumeOwnerAgentApprovalToken(
  token: string | null | undefined,
  input: {
    restaurantId: string;
    userId: string;
    domain: OwnerAgentDomain;
    command: OwnerAgentCommand;
    message: string;
  }
) {
  const parsed = parseOwnerAgentApprovalToken(token, input);
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from(OWNER_AGENT_APPROVAL_TABLE)
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
      consumed_by: input.userId
    })
    .eq("restaurant_id", input.restaurantId)
    .eq("user_id", input.userId)
    .eq("domain", input.domain)
    .eq("command", input.command)
    .eq("message_hash", parsed.messageHash)
    .eq("token_nonce", parsed.nonce)
    .eq("token_hash", parsed.tokenHash)
    .eq("status", "pending")
    .gte("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();

  if (result.error) {
    if (isMissingApprovalTokenSchema(result.error)) {
      throw new AppError("Bảng xác nhận AI agent chưa sẵn sàng. Không thể xác nhận lệnh ghi dữ liệu.", 500);
    }
    throw result.error;
  }

  if (!result.data?.id) {
    throw new AppError("Mã xác nhận AI agent đã được dùng, hết hạn hoặc không khớp lệnh hiện tại.", 403);
  }
}

function action(input: AiAgentAction): AiAgentAction {
  return {
    safety: "safe",
    priority: "secondary",
    ...input
  };
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function nowLabel() {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
    .format(new Date())
    .replace(",", "");
}

function ownerIntentForDomain(domain: OwnerAgentDomain): OwnerAiIntent {
  if (domain === "support" || domain === "branch") return "overview";
  if (domain === "growth") return "growth";
  return domain;
}

async function getRestaurantAgentContext(restaurantId: string): Promise<RestaurantAgentContext> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name,slug,business_type,address,hotline,description")
    .eq("id", restaurantId)
    .maybeSingle();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy quán để chạy AI agent.", 404);
  return data as RestaurantAgentContext;
}

function menuDraftPrice(categories: AdminMenuCategory[]) {
  const prices = categories.flatMap((category) => category.items.map((item) => Number(item.price || 0))).filter((price) => price > 0);
  if (prices.length === 0) return 49000;
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  return Math.max(15000, Math.round((average * 1.15) / 1000) * 1000);
}

function menuBlueprint(input: { restaurant: RestaurantAgentContext; message: string; basePrice: number }) {
  const text = fold(`${input.message} ${input.restaurant.business_type ?? ""} ${input.restaurant.description ?? ""}`);
  const stamp = nowLabel();
  const basePrice = input.basePrice;

  if (/tra sua|milk tea|topping|tran chau/.test(text)) {
    return [
      {
        category: `AI nháp - Trà sữa ${stamp}`,
        items: [
          { name: "AI nháp - Trà sữa trân châu nướng", price: basePrice },
          { name: "AI nháp - Ô long kem cheese", price: basePrice + 6000 },
          { name: "AI nháp - Trà đào cam sả topping", price: basePrice + 4000 }
        ]
      },
      {
        category: `AI nháp - Combo ${stamp}`,
        items: [
          { name: "AI nháp - Combo 2 ly + topping", price: basePrice * 2 + 8000 },
          { name: "AI nháp - Set nhóm 4 ly", price: basePrice * 4 - 12000 }
        ]
      }
    ];
  }

  if (/nha hang|quan an|bun|com|pho|lau|nuong|mon an|food/.test(text)) {
    return [
      {
        category: `AI nháp - Món bán nhanh ${stamp}`,
        items: [
          { name: "AI nháp - Cơm gà sốt mắm", price: Math.max(basePrice, 59000) },
          { name: "AI nháp - Mì trộn đặc biệt", price: Math.max(basePrice - 5000, 49000) },
          { name: "AI nháp - Salad khai vị", price: Math.max(basePrice - 12000, 39000) }
        ]
      },
      {
        category: `AI nháp - Set nhóm ${stamp}`,
        items: [
          { name: "AI nháp - Set 2 người", price: Math.max(basePrice * 2, 139000) },
          { name: "AI nháp - Set gia đình", price: Math.max(basePrice * 4, 259000) }
        ]
      }
    ];
  }

  return [
    {
      category: `AI nháp - Signature ${stamp}`,
      items: [
        { name: "AI nháp - Cà phê sữa đá signature", price: Math.max(basePrice - 4000, 29000) },
        { name: "AI nháp - Bạc xỉu kem muối", price: basePrice },
        { name: "AI nháp - Trà đào cam sả", price: basePrice + 3000 }
      ]
    },
    {
      category: `AI nháp - Combo ${stamp}`,
      items: [
        { name: "AI nháp - Combo cafe + bánh", price: Math.max(basePrice + 22000, 59000) },
        { name: "AI nháp - Set nhóm 4 ly", price: Math.max(basePrice * 4 - 10000, 119000) }
      ]
    }
  ];
}

async function executeMenuDraft(input: {
  restaurantId: string;
  restaurant: RestaurantAgentContext;
  message: string;
}): Promise<{ status: AgentExecutionStatus; reply: string; createdRecords: CreatedRecord[]; auditTrail: string[]; actions?: AiAgentAction[] }> {
  const categories = await listMenuForAdmin(input.restaurantId);
  const blueprint = menuBlueprint({
    restaurant: input.restaurant,
    message: input.message,
    basePrice: menuDraftPrice(categories)
  });
  const createdRecords: CreatedRecord[] = [];
  const auditTrail: string[] = [`Đọc ${categories.length} danh mục menu hiện có.`, "Tạo món ở trạng thái is_available=false để không hiện trên QR menu."];

  for (const group of blueprint) {
    const category = await createCategory(input.restaurantId, safeText(group.category, "AI nháp", 80));
    const categoryId = String(category?.id ?? "");
    if (!categoryId) throw new AppError("Không tạo được danh mục menu AI nháp.", 500);
    createdRecords.push({ type: "menu_category", id: categoryId, label: group.category, route: "/dashboard/menu" });

    for (const item of group.items) {
      const created = await createMenuItem({
        restaurantId: input.restaurantId,
        categoryId,
        name: safeText(item.name, "AI nháp - Món mới", 120),
        price: Math.max(1000, Math.round(item.price / 1000) * 1000),
        isAvailable: false
      });
      const itemId = String(created?.id ?? "");
      if (!itemId) throw new AppError("Không tạo được món menu AI nháp.", 500);
      createdRecords.push({ type: "menu_item", id: itemId, label: item.name, route: "/dashboard/menu" });
    }
  }

  return {
    status: "created",
    reply: `Đã tạo ${blueprint.length} danh mục và ${createdRecords.filter((item) => item.type === "menu_item").length} món AI nháp bị ẩn. Chủ quán mở Menu để sửa giá, ảnh, topping rồi bật bán sau.`,
    createdRecords,
    auditTrail,
    actions: [
      action({
        id: "open-created-menu-drafts",
        type: "link",
        label: "Mở menu kiểm tra",
        description: "Các món AI nháp đang bị ẩn, cần chủ quán chỉnh và bật bán.",
        href: "/dashboard/menu",
        intent: "menu",
        priority: "primary",
        safety: "safe"
      })
    ]
  };
}

function promotionDraft(input: { message: string; restaurantName: string }) {
  const text = fold(input.message);
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const code = `AI${stamp}`.replace(/[^A-Z0-9_-]/g, "").slice(0, 20);
  const isDelivery = /ship|giao hang|freeship|free ship/.test(text);
  const isWeekend = /cuoi tuan|weekend|thu 7|chu nhat/.test(text);
  const isRetention = /khach quen|quay lai|retention|loyalty/.test(text);

  if (isDelivery) {
    return {
      name: "AI nháp - Freeship có điều kiện",
      code,
      discountScope: "DELIVERY_FEE" as const,
      discountType: "PERCENT" as const,
      discountValue: 100,
      minOrderAmount: 120000,
      totalUsageLimit: 60,
      perCustomerUsageLimit: 1,
      channels: ["WEBSITE"],
      isActive: false,
      showOnCustomerMenu: false
    };
  }

  return {
    name: safeText(
      isRetention ? "AI nháp - Ưu đãi khách quay lại" : isWeekend ? "AI nháp - Combo cuối tuần" : `AI nháp - Tăng đơn ${input.restaurantName}`,
      "AI nháp - Ưu đãi vận hành",
      80
    ),
    code,
    discountScope: "ORDER" as const,
    discountType: "PERCENT" as const,
    discountValue: isWeekend ? 12 : 10,
    minOrderAmount: isRetention ? 70000 : 90000,
    totalUsageLimit: isWeekend ? 80 : 50,
    perCustomerUsageLimit: 1,
    channels: ["QR_MENU", "WEBSITE"],
    isActive: false,
    showOnCustomerMenu: false
  };
}

async function executePromotionDraft(input: {
  restaurantId: string;
  restaurant: RestaurantAgentContext;
  message: string;
}): Promise<{ status: AgentExecutionStatus; reply: string; createdRecords: CreatedRecord[]; auditTrail: string[]; actions?: AiAgentAction[] }> {
  const draft = promotionDraft({ message: input.message, restaurantName: input.restaurant.name });
  const promotion = await createPromotion(input.restaurantId, draft);
  return {
    status: "created",
    reply: `Đã tạo mã ${promotion.code} ở trạng thái chưa active và chưa hiện trên menu khách. Hãy mở Khuyến mãi để kiểm tra biên lợi nhuận, thời hạn và kênh trước khi bật.`,
    createdRecords: [{ type: "promotion", id: promotion.id, label: promotion.code, route: "/dashboard/promotions" }],
    auditTrail: [
      "Promotion được tạo is_active=false.",
      "Promotion được tạo show_on_customer_menu=false.",
      `Điều kiện tối thiểu: ${formatVnd(draft.minOrderAmount)}.`
    ],
    actions: [
      action({
        id: "open-created-promotion-draft",
        type: "link",
        label: "Mở khuyến mãi kiểm tra",
        description: `${promotion.code} chưa public, cần chủ quán bật sau.`,
        href: "/dashboard/promotions",
        intent: "promotions",
        priority: "primary",
        safety: "safe"
      })
    ]
  };
}

function lowStockPurchaseLines(snapshot: Awaited<ReturnType<typeof getInventorySnapshot>>) {
  return snapshot.lowStockIngredients
    .map((ingredient) => {
      const reorderGap = Math.max(
        ingredient.minimumQuantity - ingredient.onHandQuantity,
        ingredient.minimumQuantity > 0 ? ingredient.minimumQuantity * 0.5 : 1,
        1
      );

      return {
        ingredientId: ingredient.id,
        orderQuantity: Math.ceil(reorderGap * 100) / 100,
        orderUnit: ingredient.unit || undefined,
        unitCost: Math.max(0, Math.round(ingredient.referenceUnitCost || 0)),
        note: "AI nháp từ agent tồn thấp"
      };
    })
    .slice(0, 8);
}

async function executeInventoryDraft(input: {
  restaurantId: string;
  userId: string;
}): Promise<{ status: AgentExecutionStatus; reply: string; createdRecords: CreatedRecord[]; auditTrail: string[]; actions?: AiAgentAction[] }> {
  const snapshot = await getInventorySnapshot(input.restaurantId);
  if (!snapshot.schemaReady) {
    return {
      status: "blocked",
      reply: "Kho chưa sẵn sàng schema để AI tạo PO. Mở Kho hàng để kiểm tra migration và dữ liệu nguyên liệu trước.",
      createdRecords: [],
      auditTrail: ["Inventory schema chưa sẵn sàng hoặc chưa có bảng kho cần thiết."],
      actions: [
        action({
          id: "open-inventory-schema",
          type: "link",
          label: "Mở Kho hàng",
          href: "/dashboard/inventory",
          intent: "inventory",
          priority: "primary",
          safety: "safe"
        })
      ]
    };
  }

  const lines = lowStockPurchaseLines(snapshot);
  if (!lines.length) {
    return {
      status: "workflow_ready",
      reply: "Chưa có nguyên liệu dưới ngưỡng để tạo PO nháp. AI đã chuyển sang checklist kiểm kho và food cost để tránh tạo đơn mua thừa.",
      createdRecords: [],
      auditTrail: [`lowStockCount=${snapshot.lowStockCount}`, `openPurchaseOrderCount=${snapshot.openPurchaseOrderCount}`],
      actions: [
        action({
          id: "open-inventory-review",
          type: "link",
          label: "Mở kiểm kho",
          href: "/dashboard/inventory",
          intent: "inventory",
          priority: "primary",
          safety: "safe"
        })
      ]
    };
  }

  const expectedDeliveryAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const purchaseOrder = await createInventoryPurchaseOrder(input.restaurantId, {
    supplierId: null,
    locationId: null,
    expectedDeliveryAt,
    note: "AI agent nháp từ nguyên liệu dưới ngưỡng. Chủ quán kiểm lại nhà cung cấp, đơn vị và giá trước khi đặt.",
    actorUserId: input.userId,
    lines
  });

  return {
    status: "created",
    reply: `Đã tạo PO nháp ${purchaseOrder.poNumber} với ${lines.length} dòng nguyên liệu tồn thấp. Hãy mở Kho để kiểm lại đơn vị, giá nhập và nhà cung cấp trước khi gọi hàng.`,
    createdRecords: [{ type: "purchase_order", id: purchaseOrder.id, label: purchaseOrder.poNumber, route: "/dashboard/inventory" }],
    auditTrail: [
      `lowStockCount=${snapshot.lowStockCount}`,
      `createdLines=${lines.length}`,
      "Không tự nhận hàng, không trừ kho, chỉ tạo PO nháp."
    ],
    actions: [
      action({
        id: "open-created-po-draft",
        type: "link",
        label: "Mở PO nháp",
        description: `${purchaseOrder.poNumber} cần kiểm nhà cung cấp và đơn vị mua.`,
        href: "/dashboard/inventory",
        intent: "inventory",
        priority: "primary",
        safety: "safe"
      })
    ]
  };
}

function workflowStep(id: string, label: string, description: string, status: "ready" | "needs_confirmation" | "queued" | "manual" | "done") {
  return { id, label, description, status };
}

async function executeStaffingWorkflow(input: {
  restaurantId: string;
  snapshot: unknown;
}): Promise<{ status: AgentExecutionStatus; reply: string; createdRecords: CreatedRecord[]; auditTrail: string[]; actions?: AiAgentAction[] }> {
  const generated = buildAiAutomationWorkflows({ snapshot: input.snapshot, limit: 6 }).filter((workflow) => workflow.domain === "staffing");
  const workflows: AiAutomationWorkflow[] = generated.length
    ? generated
    : [
        {
          id: `workflow-staffing-agent-${new Date().toISOString().slice(0, 10)}`,
          domain: "staffing",
          title: "Rà ca trực và chấm công",
          trigger: "Chủ quán yêu cầu AI tạo workflow nhân sự.",
          outcome: "Có checklist kiểm lượt muộn, yêu cầu chờ duyệt, coverage ca và nhân sự cần coaching.",
          priority: "medium",
          confidence: "medium",
          estimatedMinutes: 6,
          executionMode: "confirm_first",
          evidence: ["owner_requested_staff_agent"],
          steps: [
            workflowStep("review-attendance", "Rà chấm công", "Kiểm người đang check-in, lượt muộn và chỉnh công đang chờ.", "ready"),
            workflowStep("review-shifts", "Rà coverage ca", "Kiểm ca sắp tới, chi nhánh thiếu người và quyền nhân viên.", "needs_confirmation"),
            workflowStep("owner-approve", "Chủ quán chốt", "Không đổi lương, quyền hoặc ca nếu chưa có xác nhận.", "manual")
          ],
          actions: [
            action({
              id: "open-staff-agent-workflow",
              type: "link",
              label: "Mở nhân sự",
              href: "/dashboard/staff",
              intent: "staff",
              priority: "primary",
              safety: "safe"
            })
          ]
        }
      ];

  const persisted = await persistAiAutomationRuns({ restaurantId: input.restaurantId, workflows });
  return {
    status: "workflow_ready",
    reply: persisted.schemaReady
      ? `Đã tạo workflow nhân sự trong AI Automation với ${persisted.workflows.length} luồng cần theo dõi. Mở Nhân sự để xử lý yêu cầu và coverage ca.`
      : "Đã tạo workflow nhân sự trong phiên hiện tại, nhưng schema lưu automation chưa sẵn sàng nên chưa persist được lifecycle.",
    createdRecords: persisted.workflows.map((workflow) => ({
      type: "ai_automation_run",
      id: workflow.lifecycle?.databaseId ?? workflow.id,
      label: workflow.title,
      route: "/dashboard/staff"
    })),
    auditTrail: [
      `workflowCount=${workflows.length}`,
      `schemaReady=${persisted.schemaReady}`,
      "Không tự đổi phân quyền, ca, lương hoặc duyệt công."
    ],
    actions: [
      action({
        id: "open-staff-after-workflow",
        type: "link",
        label: "Mở nhân sự xử lý",
        href: "/dashboard/staff",
        intent: "staff",
        priority: "primary",
        safety: "safe"
      }),
      action({
        id: "open-ai-automation-staff",
        type: "link",
        label: "Mở AI Automation",
        href: "/dashboard/ai-automation",
        intent: "staff",
        priority: "secondary",
        safety: "safe"
      })
    ]
  };
}

function checklistFor(contract: OwnerAgentToolContract, snapshot: unknown) {
  const snapshotRecord = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? (snapshot as Record<string, unknown>) : {};
  const recentOrders = Array.isArray(snapshotRecord.recentOrders) ? snapshotRecord.recentOrders.length : 0;
  const signals = [
    recentOrders ? `${recentOrders} đơn gần đây` : "",
    contract.reads[0] ? `Đã chuẩn bị nguồn đọc: ${contract.reads.slice(0, 3).join(", ")}` : "",
    contract.writes.includes("none") ? "Không ghi database ở lệnh này." : `Ghi nháp: ${contract.writes.join(", ")}`
  ].filter(Boolean);
  return signals;
}

async function executeDeterministicWorkflow(input: {
  contract: OwnerAgentToolContract;
  snapshot: unknown;
}): Promise<{ status: AgentExecutionStatus; reply: string; createdRecords: CreatedRecord[]; auditTrail: string[]; actions?: AiAgentAction[] }> {
  const checklist = checklistFor(input.contract, input.snapshot);
  const status: AgentExecutionStatus = input.contract.safety === "manual_only" ? "manual_only" : input.contract.output === "report" ? "workflow_ready" : "workflow_ready";
  const replyByCommand: Partial<Record<OwnerAgentCommand, string>> = {
    run_operational_sweep: "Đã dựng luồng quét ca: xem cảnh báo chính, chọn một việc ưu tiên, rồi mở AI Ops để xử lý từng item.",
    create_setup_checklist: "Đã dựng checklist setup: ưu tiên hồ sơ quán, menu, bàn/QR, thanh toán và online trước khi bán thật.",
    create_order_workflow: "Đã dựng workflow xử lý đơn: lọc đơn chờ, ưu tiên đơn lâu nhất, rồi mới nhận/hoàn tất bằng action có xác nhận.",
    create_kitchen_workflow: "Đã dựng workflow bếp: ưu tiên món quá SLA, gom món giống nhau và mở màn bếp để điều phối.",
    create_floor_checklist: "Đã dựng checklist sàn: kiểm bàn có đơn mở, bàn chờ thanh toán, QR và bàn cần nhân viên chú ý.",
    create_payment_reconciliation: "Đã dựng checklist đối soát. AI không xác nhận tiền thay bạn; hãy mở Thanh toán để kiểm số tiền, nội dung chuyển khoản và mã đơn.",
    create_online_delivery_draft: "Đã dựng draft vận hành online/giao hàng: kiểm tọa độ, bán kính, phí ship, ETA và mode thanh toán trước khi bật mạnh.",
    create_reservation_policy_draft: "Đã dựng draft đặt bàn: sức chứa, thời gian giữ chỗ, cọc, grace time và chống overbooking.",
    create_report_brief: "Đã dựng báo cáo hành động: tách doanh thu đã thanh toán, món kéo doanh thu, khung giờ yếu và việc cần làm tiếp.",
    create_settings_checklist: "Đã dựng checklist cài đặt: hồ sơ quán, ngân hàng, hóa đơn, thông báo, brand và quyền nhân sự.",
    create_security_checklist: "Đã dựng checklist bảo mật: tenant scope, phân quyền, thanh toán, public settings và dữ liệu nhạy cảm.",
    create_support_playbook: "Đã dựng kịch bản hỗ trợ khách: FAQ, đặt bàn, order, thanh toán, dị ứng và handoff cho nhân viên.",
    create_branch_watchlist: "Đã dựng watchlist chi nhánh: so sánh hiệu quả, attribution, thiếu kho/nhân sự và điểm yếu cần xử lý."
  };

  return {
    status,
    reply: replyByCommand[input.contract.command] ?? `Đã dựng workflow ${input.contract.label.toLowerCase()}.`,
    createdRecords: [],
    auditTrail: checklist,
    actions: [
      action({
        id: `open-${input.contract.command}`,
        type: "link",
        label: input.contract.route.includes("ai-") ? "Mở trung tâm AI" : "Mở màn thao tác",
        description: input.contract.label,
        href: input.contract.route,
        intent: input.contract.domain,
        priority: "primary",
        safety: "safe"
      })
    ]
  };
}

function resultActions(contract: OwnerAgentToolContract, specificActions: AiAgentAction[] = []) {
  const hasPrimary = specificActions.some((item) => item.priority === "primary");
  return [
    ...specificActions,
    ...(hasPrimary
      ? []
      : [
          action({
            id: `open-agent-route-${contract.command}`,
            type: "link",
            label: "Mở màn thao tác",
            description: contract.label,
            href: contract.route,
            intent: contract.domain,
            priority: "primary",
            safety: "safe"
          })
        ]),
    action({
      id: `agent-review-contract-${contract.command}`,
      type: "ui",
      label: "Xem hợp đồng AI",
      description: `Đọc: ${contract.reads.slice(0, 3).join(", ")}. Ghi: ${contract.writes.join(", ")}.`,
      intent: contract.domain,
      priority: "secondary",
      safety: "safe",
      body: {
        kind: "owner_agent_contract",
        command: contract.command,
        reads: contract.reads,
        writes: contract.writes,
        confirmationRequired: contract.confirmationRequired
      }
    })
  ].slice(0, 5);
}

function safetyNotes(contract: OwnerAgentToolContract) {
  const notes = ["Dữ liệu luôn giới hạn trong restaurant_id hiện tại."];
  if (contract.confirmationRequired) notes.push("Lệnh này chỉ chạy sau khi chủ quán xác nhận.");
  if (contract.safety === "manual_only") notes.push("AI chỉ tạo checklist, không thao tác thay chủ quán.");
  if (contract.writes.some((item) => item !== "none")) notes.push("Mọi bản ghi được tạo ở trạng thái nháp/ẩn/chưa public nếu có thể.");
  if (contract.domain === "payments") notes.push("AI không bao giờ xác nhận đã nhận tiền.");
  return notes;
}

function buildExecutionResult(input: {
  contract: OwnerAgentToolContract;
  status: AgentExecutionStatus;
  reply: string;
  createdRecords: CreatedRecord[];
  auditTrail: string[];
  actions?: AiAgentAction[];
}): OwnerAgentExecutionResult {
  const actions = resultActions(input.contract, input.actions ?? []);
  const nextAction = actions.find((item) => item.priority === "primary") ?? actions[0] ?? null;
  const confidence: AiAgentPlan["confidence"] = input.status === "created" ? "high" : input.status === "blocked" ? "low" : "medium";
  const agentPlan: AiAgentPlan = {
    title: input.contract.label,
    summary: input.reply,
    focusArea: input.contract.route,
    nextBestActionId: nextAction?.id ?? null,
    safetyNote: safetyNotes(input.contract).join(" "),
    confidence
  };
  const mission = buildAgentMission({
    surface: "dashboard",
    title: input.contract.label,
    outcome: input.reply,
    route: input.contract.route,
    actions,
    urgency: input.status === "blocked" ? "watch" : input.status === "created" ? "now" : "soon",
    estimatedMinutes: input.status === "created" ? 5 : 8,
    operatorNote: agentPlan.safetyNote,
    successCriteria: [
      nextAction ? `Chủ quán mở hoặc xử lý "${nextAction.label}".` : "Chủ quán có bước tiếp theo rõ.",
      "Không public/thanh toán/xóa dữ liệu nếu chưa kiểm tra.",
      "Có audit trail cho dữ liệu AI đã đọc/ghi."
    ]
  });
  const passport = buildOperationalPassport({
    surface: "dashboard",
    title: `Owner Agent · ${input.contract.label}`,
    status: input.status,
    goal: input.reply,
    route: input.contract.route,
    nextActionId: nextAction?.id ?? null,
    nextActionLabel: nextAction?.label ?? null,
    checkpoint: input.createdRecords[0]?.label ?? input.auditTrail[0] ?? null,
    handoffRoute: input.contract.route,
    handoffLabel: nextAction?.label ?? input.contract.label,
    confidence
  });
  const commandDeck = buildCommandDeck({
    surface: "dashboard",
    title: input.contract.label,
    headline: input.reply,
    actions,
    mission,
    passport,
    confidence,
    premiumReason: "Owner Agent biến yêu cầu của chủ quán thành lệnh có dữ liệu đọc, quyền ghi, trạng thái an toàn và route kiểm tra rõ ràng."
  });

  return {
    reply: input.reply,
    text: input.reply,
    intent: input.contract.domain,
    intentLabel: input.contract.label,
    suggestions: actions.map((item) => item.label),
    actions,
    agentPlan,
    mission,
    commandDeck,
    passport,
    agentExecution: {
      domain: input.contract.domain,
      command: input.contract.command,
      status: input.status,
      confirmationRequired: input.contract.confirmationRequired,
      route: input.contract.route,
      dataNeeds: input.contract.reads,
      writes: input.contract.writes,
      createdRecords: input.createdRecords,
      safetyNotes: safetyNotes(input.contract),
      auditTrail: input.auditTrail
    }
  };
}

async function confirmationPlan(input: { contract: OwnerAgentToolContract; message: string; restaurantId: string; userId: string }) {
  const approvalToken = await issueOwnerAgentApprovalToken({
    restaurantId: input.restaurantId,
    userId: input.userId,
    domain: input.contract.domain,
    command: input.contract.command,
    message: input.message
  });

  return buildExecutionResult({
    contract: input.contract,
    status: "planned",
    reply: `${input.contract.label} đã sẵn sàng. Lệnh này cần xác nhận vì sẽ ${input.contract.writes.some((item) => item !== "none") ? "tạo bản nháp trong dữ liệu quán" : "tác động workflow vận hành"}.`,
    createdRecords: [],
    auditTrail: [`message=${safeText(input.message, "owner request", 180)}`, `requiresConfirmation=${input.contract.confirmationRequired}`, "approvalToken=server_signed"],
    actions: [
      action({
        id: `confirm-agent-${input.contract.command}`,
        type: "api",
        label: `Chạy: ${input.contract.label}`,
        description: "Chạy trong phạm vi quán hiện tại, theo hợp đồng an toàn của AI agent.",
        endpoint: "/api/admin/ai/agent/execute",
        body: {
          domain: input.contract.domain,
          command: input.contract.command,
          message: input.message,
          approvalToken,
          mode: "execute"
        },
        intent: input.contract.domain,
        priority: "primary",
        safety: input.contract.safety
      })
    ]
  });
}

function revalidateAgentSurfaces(route: string) {
  revalidatePath(route);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-ops");
  revalidatePath("/dashboard/ai-execution");
  revalidatePath("/dashboard/ai-apply");
  revalidatePath("/dashboard/ai-automation");
  revalidatePath("/dashboard/ai-menu");
  revalidatePath("/dashboard/ai-growth");
  revalidatePath("/dashboard/ai-support");
}

export async function executeOwnerAgentCommand(input: ExecuteOwnerAgentCommandInput): Promise<OwnerAgentExecutionResult> {
  const domain = normalizeOwnerAgentDomain(input.domain ?? input.intent, input.message);
  const command = normalizeOwnerAgentCommand(input.command, domain, input.message);
  const contract = getOwnerAgentToolContract(command);
  if (!contract || ownerAgentToolRegistry[command].domain !== contract.domain) {
    throw new AppError("AI agent không nhận diện được lệnh vận hành.", 422);
  }

  if (!rateLimit(`owner-agent:${input.restaurantId}:${input.userId}`, 18, 60_000)) {
    throw new AppError("AI agent đang nhận quá nhiều lệnh. Vui lòng chờ một chút.", 429);
  }

  if (contract.requiredFeature) {
    await assertFeatureEntitlement(input.restaurantId, contract.requiredFeature);
  }

  if (input.mode === "plan") {
    return await confirmationPlan({ contract, message: input.message, restaurantId: input.restaurantId, userId: input.userId });
  }

  if (contract.confirmationRequired) {
    if (!input.approvalToken) {
      if (input.confirm || input.mode === "execute") {
        await recordAiSecurityEvent({
          restaurantId: input.restaurantId,
          userId: input.userId,
          surface: "owner",
          eventType: "owner_agent_approval_missing",
          severity: "high",
          metadata: { domain: contract.domain, command: contract.command, mode: input.mode ?? null, legacyConfirm: Boolean(input.confirm) }
        });
        throw new AppError("Lệnh AI agent cần mã xác nhận an toàn từ server.", 403);
      }
      return await confirmationPlan({ contract, message: input.message, restaurantId: input.restaurantId, userId: input.userId });
    }
    try {
      await consumeOwnerAgentApprovalToken(input.approvalToken, {
        restaurantId: input.restaurantId,
        userId: input.userId,
        domain: contract.domain,
        command: contract.command,
        message: input.message
      });
    } catch (error) {
      if (error instanceof AppError && error.status === 403) {
        await recordAiSecurityEvent({
          restaurantId: input.restaurantId,
          userId: input.userId,
          surface: "owner",
          eventType: "owner_agent_approval_denied",
          severity: "high",
          metadata: { domain: contract.domain, command: contract.command, reason: error.message }
        });
      }
      throw error;
    }
  }

  const restaurant = await getRestaurantAgentContext(input.restaurantId);
  const snapshot = await getOwnerOperationalSnapshot(input.restaurantId, ownerIntentForDomain(contract.domain), restaurant).catch(() => null);
  let execution: Awaited<ReturnType<typeof executeDeterministicWorkflow>>;

  if (command === "create_menu_draft") {
    execution = await executeMenuDraft({
      restaurantId: input.restaurantId,
      restaurant,
      message: input.message
    });
  } else if (command === "create_promotion_draft" || command === "create_growth_campaign") {
    execution = await executePromotionDraft({
      restaurantId: input.restaurantId,
      restaurant,
      message: input.message
    });
  } else if (command === "create_purchase_order_draft") {
    await assertFeatureEntitlement(input.restaurantId, "inventory_procurement");
    execution = await executeInventoryDraft({
      restaurantId: input.restaurantId,
      userId: input.userId
    });
  } else if (command === "create_staffing_workflow") {
    execution = await executeStaffingWorkflow({
      restaurantId: input.restaurantId,
      snapshot
    });
  } else {
    execution = await executeDeterministicWorkflow({ contract, snapshot });
  }

  revalidateAgentSurfaces(contract.route);
  return buildExecutionResult({
    contract,
    status: execution.status,
    reply: execution.reply,
    createdRecords: execution.createdRecords,
    auditTrail: execution.auditTrail,
    actions: execution.actions
  });
}
