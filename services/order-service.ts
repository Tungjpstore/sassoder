import type { PostgrestError } from "@supabase/supabase-js";
import { AppError } from "@/lib/response";
import {
  resolveOrderPaymentStatus,
  resolveDeliveryStatusTransition,
  resolveMerchantAcceptTransition,
  type DeliveryActionStatus
} from "@/lib/orders/order-state-machine";
import { resolveOrderBranchAssignment } from "@/lib/orders/branch-attribution";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { buildDeliveryQuoteSnapshot, calculateServiceFee, getPublicOrderingSettingsBySlug, quoteDeliveryForRestaurant } from "@/services/delivery-service";
import { buildDeliveryTrackingSnapshot } from "@/services/delivery/tracking-snapshot-service";
import {
  normalizeModifierSelections,
  resolveModifierSelections,
  type CustomerModifierSelection,
  type PublicModifierGroup,
  type ResolvedModifierSelection
} from "@/lib/customer/modifier-pricing";
import { recordDeliveryStatusTrackingEvent } from "@/services/delivery-tracking-service";
import { acceptOrderWithInventoryDeduction } from "@/services/inventory-service";
import { getPaymentInstructions } from "@/services/payment-service";
import { resolvePromotionForOrder, withPromotionUsageLock } from "@/services/promotion-service";
import { buildPromotionCustomerKeyHash } from "@/lib/promotion-identity";
import { createPublicTenantAdminClient } from "@/services/public-tenant-admin-boundary";
import { listActiveStoreBranches } from "@/services/branch-service";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import { getPublicTable } from "@/services/table-service";
import { assertPublicTenantActive } from "@/services/tenant-status-guard";
import { buildTelegramOrderSnapshot, enqueueTelegramNotification } from "@/services/telegram-event-queue";
import { writeOperationalEvent } from "@/services/operational-observability-service";
import { canAccessDineInOrder } from "@/lib/customer/dine-in-order-access";
import { createVerifiedOrderOwnershipContext, sanitizeSharedTableHistoryOrder } from "@/lib/customer/public-order-privacy";
import { customerSessionTokenVersion } from "@/lib/customer/customer-session-auth";
import type { VerifiedCustomerSessionTokenClaims } from "@/lib/customer/customer-session-token";
import type { JsonValue } from "@/lib/customer/signed-json-token";
import { broadcastVpsRealtime } from "@/lib/vps/realtime";
import { cancelOrderAtomic, createOnlineOrderAtomic } from "@/services/phase1-financial-rpc-service";
import type {
  DeliveryStatus,
  FulfillmentType,
  OrderBranchAssignmentSource,
  OrderDto,
  PaymentMethod,
  PaymentStatus,
  TableBillStatus
} from "@/types/domain";
import type { Json } from "@/types/supabase";

export type CreateOrderInput = {
  restaurantSlug: string;
  tableId: string;
  tableAccessToken?: string;
  customerSessionId?: string;
  customerNote?: string;
  promotionCode?: string;
  idempotencyKey?: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    note?: string;
    modifiers?: CustomerModifierSelection[];
  }>;
};

export type CreateRemoteOrderInput = {
  restaurantSlug: string;
  branchId?: string;
  fulfillmentType: "PICKUP" | "DELIVERY";
  customerSessionId?: string;
  customerName: string;
  customerPhone: string;
  customerNote?: string;
  promotionCode?: string;
  paymentMethod?: PaymentMethod;
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  idempotencyKey?: string;
  items: CreateOrderInput["items"];
};

export type CustomerOrderAccessInput = {
  restaurantSlug: string;
  tableId: string;
  tableAccessToken?: string;
  customerSessionId?: string;
};

export type RemoteOrderAccessInput = {
  restaurantSlug: string;
  customerSessionId: string;
};

export type OrderCleanupInput = {
  mode: "cancel" | "delete_test";
  statuses?: OrderDto["status"][];
  olderThanMinutes?: number;
  limit?: number;
};

type OrderSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;
type RawOrder = {
  id: string;
  restaurant_id?: string;
  branch_id?: string | null;
  branch_assignment_source?: OrderBranchAssignmentSource | null;
  status: OrderDto["status"];
  subtotal?: number;
  discount_amount?: number;
  promotion_id?: string | null;
  promotion_code?: string | null;
  total: number;
  fulfillment_type?: FulfillmentType;
  bill_id?: string | null;
  payment_method: PaymentMethod | null;
  payment_status?: PaymentStatus | null;
  paid_at?: string | null;
  customer_session_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_note?: string | null;
  delivery_address?: string | null;
  delivery_lat?: number | string | null;
  delivery_lng?: number | string | null;
  delivery_distance_km?: number | string | null;
  delivery_fee?: number | null;
  service_fee?: number | null;
  delivery_status?: DeliveryStatus | null;
  delivery_route_geometry?: Json | null;
  delivery_route_duration_minutes?: number | null;
  delivery_quote_snapshot?: Json | null;
  delivery_tracking_updated_at?: string | null;
  delivery_courier_id?: string | null;
  delivery_assigned_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  accepted_at?: string | null;
  served_at?: string | null;
  service_due_at?: string | null;
  restaurant:
    | {
        name?: string | null;
        address?: string | null;
        store_lat?: number | null;
        store_lng?: number | null;
        bank_code: string | null;
        bank_account: string | null;
        bank_account_name: string | null;
      }
    | Array<{
        name?: string | null;
        address?: string | null;
        store_lat?: number | null;
        store_lng?: number | null;
        bank_code: string | null;
        bank_account: string | null;
        bank_account_name: string | null;
      }>
    | null;
  table: { id?: string; name: string } | { id?: string; name: string }[] | null;
  bill: RawBill | RawBill[] | null;
  deliveryCourier:
    | { id: string; name: string; phone: string | null; status: "offline" | "available" | "assigned" | "busy" | "paused" }
    | Array<{ id: string; name: string; phone: string | null; status: "offline" | "available" | "assigned" | "busy" | "paused" }>
    | null;
  items:
    | Array<{
        id?: string;
        quantity: number;
        price: number;
        modifier_snapshot?: Json | null;
        prepared_at?: string | null;
        note: string | null;
        menuItem: { id?: string; name: string } | { id?: string; name: string }[] | null;
      }>
    | null;
};

type RawBill = {
  id: string;
  status: TableBillStatus;
  total: number;
  payment_method: PaymentMethod | null;
  created_at: string;
  updated_at?: string | null;
  paid_at?: string | null;
  closed_at?: string | null;
};

type CourierLocationRow = {
  order_id: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  heading_degrees: number | null;
  speed_mps: number | null;
  captured_at: string;
};

type StoreBranchAssignmentRow = {
  id: string;
  is_primary: boolean | null;
  is_active: boolean | null;
};

type PublicOrderAccessRow = {
  id: string;
  status: OrderDto["status"];
  customer_session_id: string | null;
  bill:
    | { customer_session_id: string | null; status: TableBillStatus }
    | Array<{ customer_session_id: string | null; status: TableBillStatus }>
    | null;
};

type MutableOrderRow = {
  id: string;
  status: OrderDto["status"];
  total: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus | null;
  paid_at?: string | null;
  fulfillment_type?: FulfillmentType | null;
  delivery_status?: DeliveryStatus | null;
  bill_id?: string | null;
  bill:
    | {
        id: string;
        status: TableBillStatus;
        payment_method: PaymentMethod | null;
        paid_at?: string | null;
      }
    | Array<{
        id: string;
        status: TableBillStatus;
        payment_method: PaymentMethod | null;
        paid_at?: string | null;
      }>
    | null;
};

const orderSelect =
  "id,restaurant_id,branch_id,branch_assignment_source,status,subtotal,discount_amount,promotion_id,promotion_code,total,fulfillment_type,bill_id,payment_method,payment_status,paid_at,customer_session_id,customer_name,customer_phone,customer_note,delivery_address,delivery_lat,delivery_lng,delivery_distance_km,delivery_fee,service_fee,delivery_status,delivery_route_geometry,delivery_route_duration_minutes,delivery_quote_snapshot,delivery_tracking_updated_at,delivery_courier_id,delivery_assigned_at,created_at,updated_at,accepted_at,served_at,service_due_at,deliveryCourier:delivery_couriers(id,name,phone,status),restaurant:restaurants(name,address,store_lat,store_lng,bank_code,bank_account,bank_account_name),table:tables(id,name),bill:table_bills(id,status,total,payment_method,created_at,updated_at,paid_at,closed_at),items:order_items(id,quantity,price,note,prepared_at,modifier_snapshot,menuItem:menu_items(id,name))";

const kitchenOrderSelect =
  "id,branch_id,branch_assignment_source,status,subtotal,discount_amount,promotion_id,promotion_code,total,fulfillment_type,payment_method,payment_status,paid_at,customer_session_id,customer_name,customer_phone,customer_note,delivery_address,delivery_lat,delivery_lng,delivery_distance_km,delivery_fee,service_fee,delivery_status,delivery_route_geometry,delivery_route_duration_minutes,delivery_quote_snapshot,delivery_tracking_updated_at,delivery_courier_id,delivery_assigned_at,created_at,updated_at,accepted_at,served_at,service_due_at,deliveryCourier:delivery_couriers(id,name,phone,status),table:tables(id,name),items:order_items(id,quantity,price,note,prepared_at,modifier_snapshot,menuItem:menu_items(id,name))";

const legacyOrderSelect = orderSelect.replace("branch_id,branch_assignment_source,", "");
const legacyKitchenOrderSelect = kitchenOrderSelect.replace("branch_id,branch_assignment_source,", "");
const orderSelectWithoutModifiers = removeOrderItemModifierColumns(orderSelect);
const legacyOrderSelectWithoutModifiers = removeOrderItemModifierColumns(legacyOrderSelect);
const kitchenOrderSelectWithoutModifiers = removeOrderItemModifierColumns(kitchenOrderSelect);
const legacyKitchenOrderSelectWithoutModifiers = removeOrderItemModifierColumns(legacyKitchenOrderSelect);

const activePublicStatuses: OrderDto["status"][] = ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"];
const defaultCleanupStatuses: OrderDto["status"][] = ["pending", "ordering", "completed", "waiting_payment", "cancelled"];
const defaultActiveOrdersLimit = 1000;
const defaultHistoryOrdersLimit = 250;
const defaultKitchenOrdersLimit = 1000;
const kitchenOrdersCache = new Map<string, { expiresAt: number; data: OrderDto[] }>();
const kitchenOrdersCacheTtlMs = 900;

function readKitchenOrdersCache(restaurantId: string) {
  const cached = kitchenOrdersCache.get(restaurantId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    kitchenOrdersCache.delete(restaurantId);
    return null;
  }
  return cached.data;
}

function writeKitchenOrdersCache(restaurantId: string, data: OrderDto[]) {
  kitchenOrdersCache.set(restaurantId, {
    data,
    expiresAt: Date.now() + kitchenOrdersCacheTtlMs
  });
}

function removeOrderItemModifierColumns(select: string) {
  return select.replace("id,quantity,price,note,prepared_at,modifier_snapshot,", "id,quantity,price,note,");
}

export function invalidateRestaurantOrderCache(restaurantId: string) {
  kitchenOrdersCache.delete(restaurantId);
}

function isMissingOrderBranchSchema(error: PostgrestError | null | undefined) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    /branch_id|branch_assignment_source/i.test(message)
  );
}

async function runOrderSelectWithBranchFallback<TData>(
  buildQuery: (select: string) => PromiseLike<{ data: TData | null; error: PostgrestError | null }>,
  fallbackSelect = legacyOrderSelect
) {
  const result = await buildQuery(orderSelect);
  if (isMissingOrderItemModifierSchema(result.error)) {
    const modifierFallback = await buildQuery(orderSelectWithoutModifiers);
    if (isMissingOrderBranchSchema(modifierFallback.error)) return buildQuery(legacyOrderSelectWithoutModifiers);
    return modifierFallback;
  }
  if (!isMissingOrderBranchSchema(result.error)) return result;
  const branchFallback = await buildQuery(fallbackSelect);
  if (isMissingOrderItemModifierSchema(branchFallback.error)) return buildQuery(legacyOrderSelectWithoutModifiers);
  return branchFallback;
}

async function runKitchenSelectWithBranchFallback<TData>(
  buildQuery: (select: string) => PromiseLike<{ data: TData | null; error: PostgrestError | null }>
) {
  const result = await buildQuery(kitchenOrderSelect);
  if (isMissingOrderItemModifierSchema(result.error)) {
    const modifierFallback = await buildQuery(kitchenOrderSelectWithoutModifiers);
    if (isMissingOrderBranchSchema(modifierFallback.error)) return buildQuery(legacyKitchenOrderSelectWithoutModifiers);
    return modifierFallback;
  }
  if (!isMissingOrderBranchSchema(result.error)) return result;
  const branchFallback = await buildQuery(legacyKitchenOrderSelect);
  if (isMissingOrderItemModifierSchema(branchFallback.error)) return buildQuery(legacyKitchenOrderSelectWithoutModifiers);
  return branchFallback;
}

function normalizeOrderItems(items: CreateOrderInput["items"]) {
  const byMenuItem = new Map<string, CreateOrderInput["items"][number]>();

  for (const item of items) {
    const modifiers = normalizeModifierSelections(item.modifiers);
    const modifierKey = modifiers.map((modifier) => `${modifier.groupId}:${modifier.optionId}:${modifier.quantity ?? 1}`).join("|");
    const lineKey = modifierKey ? `${item.menuItemId}::${modifierKey}` : item.menuItemId;
    const existing = byMenuItem.get(lineKey);
    if (!existing) {
      byMenuItem.set(lineKey, {
        ...item,
        note: item.note?.trim() || undefined,
        ...(modifiers.length > 0 ? { modifiers } : {})
      });
      continue;
    }

    const quantity = existing.quantity + item.quantity;
    if (quantity > 50) {
      throw new AppError("Số lượng mỗi món không được vượt quá 50", 400);
    }

    const notes = [existing.note, item.note].map((note) => note?.trim()).filter(Boolean);
    byMenuItem.set(lineKey, {
      menuItemId: item.menuItemId,
      quantity,
      note: notes.length ? [...new Set(notes)].join("; ").slice(0, 200) : undefined,
      ...(modifiers.length > 0 ? { modifiers } : {})
    });
  }

  return [...byMenuItem.values()];
}

function isMissingOrderItemModifierSchema(error: PostgrestError | null | undefined) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    /base_price|modifier_total|modifier_snapshot|prepared_at/i.test(message)
  );
}

function isMissingMenuModifierSchema(error: PostgrestError | null | undefined) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST205" ||
    /menu_modifier_groups|menu_modifier_options|modifier/i.test(message)
  );
}

type MenuModifierGroupRow = {
  id: string;
  menu_item_id: string;
  name: string;
  kind?: PublicModifierGroup["kind"];
  selection_type?: PublicModifierGroup["selectionType"];
  allow_quantity?: boolean;
  is_required: boolean;
  min_select: number;
  max_select: number | null;
  sort_order: number;
};

type MenuModifierOptionRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  pricing_mode?: PublicModifierGroup["options"][number]["pricingMode"];
  price_value?: number | null;
  is_default?: boolean;
  is_available: boolean;
  sort_order: number;
};

const menuModifierGroupSelect = "id,menu_item_id,name,kind,selection_type,allow_quantity,is_required,min_select,max_select,sort_order";
const menuModifierOptionSelect = "id,group_id,name,price_delta,pricing_mode,price_value,is_default,is_available,sort_order";

async function listOrderModifierGroups(
  supabase: OrderSupabaseClient,
  restaurantId: string,
  menuItemIds: string[],
  requireSchema: boolean
) {
  if (menuItemIds.length === 0) return new Map<string, PublicModifierGroup[]>();

  const [groupsResult, optionsResult] = await Promise.all([
    supabase
      .from("menu_modifier_groups")
      .select(menuModifierGroupSelect)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .in("menu_item_id", menuItemIds)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("menu_modifier_options")
      .select(menuModifierOptionSelect)
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
  ]);

  if (isMissingMenuModifierSchema(groupsResult.error) || isMissingMenuModifierSchema(optionsResult.error)) {
    if (requireSchema) throw new AppError("Tùy chọn món chưa sẵn sàng. Vui lòng tải lại menu hoặc báo quán kiểm tra cấu hình.", 400);
    return new Map();
  }

  throwIfSupabaseError(groupsResult.error);
  throwIfSupabaseError(optionsResult.error);

  const groupIds = new Set(((groupsResult.data ?? []) as MenuModifierGroupRow[]).map((group) => group.id));
  const optionsByGroupId = new Map<string, PublicModifierGroup["options"]>();
  for (const option of (optionsResult.data ?? []) as MenuModifierOptionRow[]) {
    if (!groupIds.has(option.group_id)) continue;
    const groupOptions = optionsByGroupId.get(option.group_id) ?? [];
    groupOptions.push({
      id: option.id,
      name: option.name,
      priceDelta: option.price_delta,
      pricingMode: option.pricing_mode ?? "DELTA",
      priceValue: option.price_value ?? null,
      isDefault: option.is_default ?? false,
      isAvailable: option.is_available
    });
    optionsByGroupId.set(option.group_id, groupOptions);
  }

  const groupsByItemId = new Map<string, PublicModifierGroup[]>();
  for (const group of (groupsResult.data ?? []) as MenuModifierGroupRow[]) {
    const itemGroups = groupsByItemId.get(group.menu_item_id) ?? [];
    itemGroups.push({
      id: group.id,
      name: group.name,
      kind: group.kind ?? "CUSTOM",
      selectionType: group.selection_type ?? (group.max_select === 1 ? "SINGLE" : "MULTIPLE"),
      allowQuantity: group.allow_quantity ?? false,
      required: group.is_required,
      minSelect: group.min_select,
      maxSelect: group.max_select,
      options: optionsByGroupId.get(group.id) ?? []
    });
    groupsByItemId.set(group.menu_item_id, itemGroups);
  }

  return groupsByItemId;
}

function modifierNote(selections: ResolvedModifierSelection[]) {
  return selections
    .map((selection) => {
      const quantity = selection.quantity > 1 ? ` x${selection.quantity}` : "";
      return `${selection.groupName}: ${selection.optionName}${quantity}`;
    })
    .join("; ");
}

function mergeOrderItemNote(note?: string, modifiers?: string) {
  const parts = [modifiers, note?.trim() ? `Ghi chú: ${note.trim()}` : null].filter(Boolean);
  return parts.length ? parts.join(" | ").slice(0, 240) : null;
}

async function priceOrderItems(input: {
  supabase: OrderSupabaseClient;
  restaurantId: string;
  normalizedItems: ReturnType<typeof normalizeOrderItems>;
  menuItems: Array<{ id: string; price: number }>;
  enforceRequiredModifiers?: boolean;
}) {
  const byId = new Map(input.menuItems.map((item) => [item.id, item]));
  const hasModifierSelections = input.normalizedItems.some((item) => (item.modifiers?.length ?? 0) > 0);
  const groupsByItemId = await listOrderModifierGroups(
    input.supabase,
    input.restaurantId,
    input.normalizedItems.map((item) => item.menuItemId),
    hasModifierSelections
  );

  return input.normalizedItems.map((item) => {
    const menuItem = byId.get(item.menuItemId);
    if (!menuItem) throw new AppError("Không tìm thấy món", 400);

    const shouldValidateConfiguredGroups = input.enforceRequiredModifiers === true || (item.modifiers?.length ?? 0) > 0;
    const modifierResolution = resolveModifierSelections(
      shouldValidateConfiguredGroups ? groupsByItemId.get(item.menuItemId) ?? [] : [],
      item.modifiers ?? [],
      { basePrice: menuItem.price }
    );
    if (!modifierResolution.ok) {
      throw new AppError(modifierResolution.errors[0] ?? "Tùy chọn món không hợp lệ", 400);
    }

    const unitPrice = menuItem.price + modifierResolution.totalDelta;
    if (unitPrice <= 0) throw new AppError("Giá món sau tùy chọn phải lớn hơn 0", 400);

    return {
      ...item,
      basePrice: menuItem.price,
      modifierTotal: modifierResolution.totalDelta,
      modifierSnapshot: modifierResolution.selections,
      modifierNote: modifierNote(modifierResolution.selections),
      unitPrice
    };
  });
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function numericOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrZero(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.round(next) : 0;
}

function positiveQuantity(value: unknown) {
  const next = Math.floor(Number(value ?? 1));
  return Number.isFinite(next) && next > 0 ? next : 1;
}

function parseOrderItemModifierSnapshot(value: Json | null | undefined): ResolvedModifierSelection[] {
  if (!Array.isArray(value)) return [];

  const selections: ResolvedModifierSelection[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const groupId = stringOrNull(record.groupId);
    const optionId = stringOrNull(record.optionId);
    const groupName = stringOrNull(record.groupName);
    const optionName = stringOrNull(record.optionName);
    if (!groupId || !optionId || !groupName || !optionName) continue;

    const quantity = positiveQuantity(record.quantity);
    const priceDelta = numberOrZero(record.priceDelta);
    const pricingMode = record.pricingMode === "ABSOLUTE" ? "ABSOLUTE" : "DELTA";
    const priceValue = record.priceValue === null || record.priceValue === undefined ? null : numberOrZero(record.priceValue);
    const lineTotal = numberOrZero(record.lineTotal) || priceDelta * quantity;
    selections.push({
      groupId,
      groupName,
      kind: typeof record.kind === "string" ? record.kind as PublicModifierGroup["kind"] : undefined,
      optionId,
      optionName,
      pricingMode,
      priceValue,
      priceDelta,
      quantity,
      lineTotal
    });
  }

  return selections;
}

function customerOrderItemNote(note: string | null, modifierLabel: string) {
  if (!note?.trim()) return null;
  if (!modifierLabel) return note.trim();

  const marker = "Ghi chú:";
  const markerIndex = note.indexOf(marker);
  if (markerIndex >= 0) {
    const customerNote = note.slice(markerIndex + marker.length).trim();
    return customerNote || null;
  }

  return note.trim() === modifierLabel ? null : note.trim();
}

function routeGeometryOrNull(value: Json | null | undefined): OrderDto["deliveryRouteGeometry"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  const coordinates = geometry.coordinates.filter((point): point is number[] => {
    return (
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1]))
    );
  });
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
}

function mapOrder(order: RawOrder): OrderDto {
  const restaurant = firstOrNull(order.restaurant);
  const bill = firstOrNull(order.bill);
  const courier = firstOrNull(order.deliveryCourier);

  return {
    id: order.id,
    branchId: order.branch_id ?? null,
    branchAssignmentSource: order.branch_assignment_source ?? null,
    status: order.status,
    subtotal: order.subtotal ?? order.total + (order.discount_amount ?? 0),
    discountAmount: order.discount_amount ?? 0,
    promotionId: order.promotion_id ?? null,
    promotionCode: order.promotion_code ?? null,
    total: order.total,
    paymentMethod: order.payment_method,
    paymentStatus: resolveOrderPaymentStatus({
      status: order.status,
      paymentStatus: order.payment_status,
      paidAt: order.paid_at,
      bill: bill ? { status: bill.status, paidAt: bill.paid_at ?? null } : null
    }),
    paidAt: order.paid_at ?? null,
    fulfillmentType: order.fulfillment_type ?? "DINE_IN",
    customerName: order.customer_name ?? null,
    customerPhone: order.customer_phone ?? null,
    customerNote: order.customer_note ?? null,
    deliveryAddress: order.delivery_address ?? null,
    deliveryLat: numericOrNull(order.delivery_lat),
    deliveryLng: numericOrNull(order.delivery_lng),
    deliveryDistanceKm: numericOrNull(order.delivery_distance_km),
    deliveryFee: order.delivery_fee ?? 0,
    serviceFee: order.service_fee ?? 0,
    deliveryStatus: order.delivery_status ?? "none",
    deliveryRouteGeometry: routeGeometryOrNull(order.delivery_route_geometry),
    deliveryRouteDurationMinutes: order.delivery_route_duration_minutes ?? null,
    deliveryQuoteSnapshot: order.delivery_quote_snapshot ?? null,
    deliveryTrackingUpdatedAt: order.delivery_tracking_updated_at ?? null,
    deliveryCourierId: order.delivery_courier_id ?? null,
    deliveryAssignedAt: order.delivery_assigned_at ?? null,
    deliveryCourier: courier
      ? {
          id: courier.id,
          name: courier.name,
          phone: courier.phone,
          status: courier.status
        }
      : null,
    deliveryCourierLocation: null,
    deliveryTrackingSnapshot: order.fulfillment_type === "DELIVERY"
      ? buildDeliveryTrackingSnapshot({
          deliveryStatus: order.delivery_status ?? "none",
          destination: { lat: numericOrNull(order.delivery_lat) ?? undefined, lng: numericOrNull(order.delivery_lng) ?? undefined }
        })
      : null,
    bill: bill
      ? {
          id: bill.id,
          status: bill.status,
          total: bill.total,
          paymentMethod: bill.payment_method,
          createdAt: bill.created_at,
          updatedAt: bill.updated_at ?? null,
          paidAt: bill.paid_at ?? null,
          closedAt: bill.closed_at ?? null
        }
      : null,
    createdAt: order.created_at,
    updatedAt: order.updated_at ?? null,
    acceptedAt: order.accepted_at ?? null,
    servedAt: order.served_at ?? null,
    serviceDueAt: order.service_due_at ?? null,
    paymentConfig: restaurant
      ? {
          bankCode: restaurant.bank_code,
          bankAccount: restaurant.bank_account,
          bankAccountName: restaurant.bank_account_name
        }
      : undefined,
    restaurant: restaurant
      ? {
          name: restaurant.name ?? null,
          address: restaurant.address ?? null,
          storeLat: restaurant.store_lat ?? null,
          storeLng: restaurant.store_lng ?? null
        }
      : undefined,
    table: firstOrNull(order.table),
    items: (order.items ?? []).map((item) => {
      const modifiers = parseOrderItemModifierSnapshot(item.modifier_snapshot);
      const summary = modifierNote(modifiers);
      return {
        id: item.id,
        quantity: item.quantity,
        price: item.price,
        modifiers,
        modifierSummary: summary || null,
        preparedAt: item.prepared_at ?? null,
        note: customerOrderItemNote(item.note, summary),
        menuItem: firstOrNull(item.menuItem)
      };
    })
  };
}

function toFinancialJsonValue(value: Json | null | undefined): JsonValue {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((entry) => toFinancialJsonValue(entry));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, toFinancialJsonValue(entry)])
    );
  }
  return value;
}

function stableDeliveryQuoteSnapshot(value: Json): JsonValue {
  const normalized = toFinancialJsonValue(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return normalized;
  const { generatedAt: _generatedAt, ...stable } = normalized;
  void _generatedAt;
  return stable;
}

async function attachLatestDeliveryLocations(
  restaurantId: string,
  orders: OrderDto[],
  supabase: OrderSupabaseClient = createAdminSupabaseClient()
) {
  const deliveryOrderIds = orders
    .filter((order) => order.fulfillmentType === "DELIVERY")
    .map((order) => order.id);
  if (deliveryOrderIds.length === 0) return orders;

  const { data, error } = await supabase
    .from("courier_locations")
    .select("order_id,latitude,longitude,accuracy_meters,heading_degrees,speed_mps,captured_at")
    .eq("restaurant_id", restaurantId)
    .in("order_id", deliveryOrderIds)
    .order("captured_at", { ascending: false })
    .limit(Math.min(deliveryOrderIds.length * 3, 500));

  throwIfSupabaseError(error);
  const latestByOrderId = new Map<string, CourierLocationRow>();
  for (const row of (data ?? []) as CourierLocationRow[]) {
    if (row.order_id && !latestByOrderId.has(row.order_id)) latestByOrderId.set(row.order_id, row);
  }

  return orders.map((order) => {
    const location = latestByOrderId.get(order.id);
    if (!location) return order;
    return {
      ...order,
      deliveryCourierLocation: {
        lat: Number(location.latitude),
        lng: Number(location.longitude),
        accuracyMeters: location.accuracy_meters,
        headingDegrees: location.heading_degrees,
        speedMps: location.speed_mps,
        capturedAt: location.captured_at
      },
      deliveryTrackingSnapshot: buildDeliveryTrackingSnapshot({
        deliveryStatus: order.deliveryStatus ?? "none",
        destination: { lat: order.deliveryLat ?? undefined, lng: order.deliveryLng ?? undefined },
        courierLocation: { lat: Number(location.latitude), lng: Number(location.longitude) },
        capturedAt: location.captured_at
      })
    };
  });
}

function mapKitchenOrder(order: Omit<RawOrder, "restaurant" | "bill">): OrderDto {
  return mapOrder({
    ...order,
    restaurant: null,
    bill: null
  });
}

async function resolveOrderBranchAssignmentForRestaurant(input: {
  supabase: OrderSupabaseClient;
  restaurantId: string;
  fulfillmentType: FulfillmentType;
  deliveryNearestStoreId?: string | null;
  requestedBranchId?: string | null;
  requireRequestedBranch?: boolean;
}) {
  const branches = await listActiveStoreBranches(input.restaurantId);

  const requestedBranchId = input.requestedBranchId?.trim() || null;
  const assignment = resolveOrderBranchAssignment({
    fulfillmentType: input.fulfillmentType,
    branches: branches.slice(0, 24) as StoreBranchAssignmentRow[],
    deliveryNearestStoreId: input.deliveryNearestStoreId,
    requestedBranchId
  });

  if (input.requireRequestedBranch && requestedBranchId && assignment.branchId !== requestedBranchId) {
    throw new AppError("Chi nhánh nhận món không khả dụng.", 400);
  }

  return assignment;
}

async function getOrderDto(orderId: string, supabase: OrderSupabaseClient = createAdminSupabaseClient()) {
  const { data, error } = await runOrderSelectWithBranchFallback((select) =>
    supabase
      .from("orders")
      .select(select)
      .eq("id", orderId)
      .single()
  );

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đơn hàng", 404);
  const row = data as unknown as RawOrder;
  const order = mapOrder(row);
  const [withLocation] = row.restaurant_id
    ? await attachLatestDeliveryLocations(row.restaurant_id, [order], supabase)
    : [order];
  return withLocation ?? order;
}

async function assertCustomerOrderAccess(
  orderId: string,
  access: CustomerOrderAccessInput,
  supabase: OrderSupabaseClient = createPublicTenantAdminClient("customer_order_access")
) {
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,allow_legacy_qr,platform_status,deleted_at")
    .eq("slug", access.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  assertPublicTenantActive(restaurant);
  await assertFeatureEntitlement(restaurant.id, "order_realtime");

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,status,customer_session_id,bill:table_bills(customer_session_id,status)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurant.id)
    .eq("table_id", access.tableId)
    .maybeSingle();

  throwIfSupabaseError(orderError);
  const accessOrder = order as unknown as PublicOrderAccessRow | null;
  if (!accessOrder) throw new AppError("Không tìm thấy đơn hàng cho bàn này", 404);

  const bill = firstOrNull(accessOrder.bill);
  const table = await getPublicTable(restaurant.id, access.tableId, access.tableAccessToken, {
    allowLegacyQr: restaurant.allow_legacy_qr
  });

  if (
    !canAccessDineInOrder({
      customerSessionId: access.customerSessionId,
      orderCustomerSessionId: accessOrder.customer_session_id,
      orderStatus: accessOrder.status,
      billCustomerSessionId: bill?.customer_session_id,
      billStatus: bill?.status,
      hasValidTableQr: Boolean(table)
    })
  ) {
    writeOperationalEvent({
      area: "ops",
      event: "customer_order_access_mismatch",
      status: "warn",
      restaurantId: restaurant.id,
      metadata: {
        orderId,
        tableId: access.tableId,
        hasCustomerSession: Boolean(access.customerSessionId),
        orderHasCustomerSession: Boolean(accessOrder.customer_session_id),
        billStatus: bill?.status ?? null,
        hasValidTableQr: Boolean(table)
      }
    });
    throw new AppError("Phiên gọi món không khớp với đơn hàng này", 403);
  }
}

async function getMutableOrder(supabase: OrderSupabaseClient, restaurantId: string, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id,status,total,payment_method,payment_status,paid_at,fulfillment_type,delivery_status,bill_id,bill:table_bills(id,status,payment_method,paid_at)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đơn hàng", 404);
  return data as unknown as MutableOrderRow;
}

export async function getOrderLifecycleSnapshot(restaurantId: string, orderId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id,status,total,fulfillment_type,payment_method,payment_status,state_version,paid_at,delivery_status,bill_id,created_at,updated_at,accepted_at,served_at,service_due_at,bill:table_bills(id,status,total,payment_method,state_version,paid_at,closed_at)"
    )
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  throwIfSupabaseError(error);
  return data ?? null;
}

function assertOrderNotPaid(order: MutableOrderRow) {
  const bill = firstOrNull(order.bill);
  if (
    order.status === "paid" ||
    order.payment_status === "paid" ||
    order.payment_status === "refunded" ||
    order.paid_at ||
    bill?.status === "paid" ||
    bill?.paid_at
  ) {
    throw new AppError("Không thể xoá hoặc huỷ đơn đã thanh toán", 400);
  }
}

async function assertRemoteOrderAccess(
  orderId: string,
  access: RemoteOrderAccessInput,
  supabase: OrderSupabaseClient = createPublicTenantAdminClient("remote_order_access")
) {
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,platform_status,deleted_at")
    .eq("slug", access.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  assertPublicTenantActive(restaurant);
  await assertFeatureEntitlement(restaurant.id, "online_ordering");

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("restaurant_id", restaurant.id)
    .is("table_id", null)
    .eq("customer_session_id", access.customerSessionId)
    .maybeSingle();

  throwIfSupabaseError(orderError);
  if (!order) throw new AppError("Không tìm thấy đơn online của bạn", 404);
}

export async function createOrder(input: CreateOrderInput) {
  const supabase = createPublicTenantAdminClient("customer_order_create");
  const normalizedItems = normalizeOrderItems(input.items);
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,slug,allow_legacy_qr,platform_status,deleted_at")
    .eq("slug", input.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  assertPublicTenantActive(restaurant);
  await assertFeatureEntitlement(restaurant.id, "order_realtime");

  const table = await getPublicTable(restaurant.id, input.tableId, input.tableAccessToken, {
    allowLegacyQr: restaurant.allow_legacy_qr
  });
  if (!table) throw new AppError("Không tìm thấy bàn hoặc mã QR đã hết hiệu lực. Vui lòng quét lại mã tại bàn.", 403);
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey) {
    const error = new AppError("Mã chống gửi trùng là bắt buộc cho đơn tại bàn.", 422) as AppError & { code?: string };
    error.code = "INVALID_IDEMPOTENCY_KEY";
    throw error;
  }

  const requestedIds = [...new Set(normalizedItems.map((item) => item.menuItemId))];
  const { data: menuItems, error: itemError } = await supabase
    .from("menu_items")
    .select("id,price")
    .eq("restaurant_id", restaurant.id)
    .eq("is_available", true)
    .in("id", requestedIds);

  throwIfSupabaseError(itemError);
  if ((menuItems ?? []).length !== requestedIds.length) {
    throw new AppError("Một hoặc nhiều món hiện không khả dụng", 400);
  }

  const pricedItems = await priceOrderItems({
    supabase,
    restaurantId: restaurant.id,
    normalizedItems,
    menuItems: menuItems ?? [],
    enforceRequiredModifiers: true
  });
  const subtotal = pricedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  if (subtotal <= 0) throw new AppError("Tổng tiền đơn hàng phải lớn hơn 0", 400);

  return withPromotionUsageLock(restaurant.id, input.promotionCode, async () => {
    const promotionCustomerKeyHash = buildPromotionCustomerKeyHash({
      restaurantId: restaurant.id,
      channel: "QR_MENU",
      tableId: table.id,
      customerSessionId: input.customerSessionId
    });
    const { promotion, discountAmount } = await resolvePromotionForOrder({
      restaurantId: restaurant.id,
      code: input.promotionCode,
      subtotal,
      channel: "QR_MENU",
      customerKeyHash: promotionCustomerKeyHash,
      items: pricedItems.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice
      }))
    });
    const total = subtotal - discountAmount;
    const branchAssignment = await resolveOrderBranchAssignmentForRestaurant({
      supabase,
      restaurantId: restaurant.id,
      fulfillmentType: "DINE_IN",
      requestedBranchId: table.branch_id ?? null
    });

    const atomicResult = await createOnlineOrderAtomic(supabase, {
      restaurantId: restaurant.id,
      idempotencyKey,
      order: {
        table_id: table.id,
        bill_id: null,
        branch_id: branchAssignment.branchId,
        branch_assignment_source: branchAssignment.source,
        fulfillment_type: "DINE_IN",
        subtotal,
        discount_amount: discountAmount,
        promotion_id: promotion?.id ?? null,
        promotion_code: promotion?.code ?? null,
        promotion_customer_key_hash: promotion ? promotionCustomerKeyHash : null,
        total,
        payment_method: null,
        payment_status: "unpaid",
        customer_session_id: input.customerSessionId || null,
        customer_note: input.customerNote?.trim() || null,
        delivery_fee: 0,
        service_fee: 0
      },
      items: pricedItems.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        price: item.unitPrice,
        base_price: item.basePrice,
        modifier_total: item.modifierTotal,
        modifier_snapshot: item.modifierSnapshot.map((selection) => ({
          groupId: selection.groupId,
          groupName: selection.groupName,
          kind: selection.kind ?? null,
          optionId: selection.optionId,
          optionName: selection.optionName,
          pricingMode: selection.pricingMode,
          priceValue: selection.priceValue,
          priceDelta: selection.priceDelta,
          quantity: selection.quantity,
          lineTotal: selection.lineTotal
        })),
        note: mergeOrderItemNote(item.note, item.modifierNote)
      })),
      actorUserId: null
    });
    const atomicOrder = atomicResult.order;
    const orderId =
      atomicOrder && typeof atomicOrder === "object" && !Array.isArray(atomicOrder) && typeof atomicOrder.id === "string"
        ? atomicOrder.id
        : null;
    if (!orderId) {
      const error = new AppError("Phản hồi tạo đơn tại bàn không hợp lệ.", 502) as AppError & { code?: string };
      error.code = "INVALID_FINANCIAL_RPC_RESPONSE";
      throw error;
    }
    const isIdempotentReplay = atomicResult.idempotentReplay === true;
    if (isIdempotentReplay) {
      writeOperationalEvent({
        area: "ops",
        event: "customer_order_idempotency_replay",
        status: "warn",
        restaurantId: restaurant.id,
        metadata: { orderId, tableId: table.id, scope: "dine_in" }
      });
    }

    const order = await getOrderDto(orderId, supabase);
    if (!isIdempotentReplay) {
      await enqueueTelegramNotification({
        type: "order.created",
        eventId: `order.created:${order.id}`,
        restaurantId: restaurant.id,
        branchId: order.branchId ?? null,
        source: "customer_qr",
        actor: { type: "customer" },
        order: buildTelegramOrderSnapshot(order)
      });
      await broadcastVpsRealtime({
        event: "new_order",
        restaurantId: restaurant.id,
        tableId: table.id,
        orderId: order.id,
        payload: {
          orderId: order.id,
          branchId: order.branchId ?? null,
          tableId: table.id,
          tableName: order.table?.name ?? null,
          fulfillmentType: order.fulfillmentType,
          status: order.status,
          total: order.total
        }
      });
      invalidateRestaurantOrderCache(restaurant.id);
      invalidateRestaurantDashboardCache(restaurant.id);
    }
    return {
      order,
      payment: getPaymentInstructions(order)
    };
  });
}

export async function createRemoteOrder(input: CreateRemoteOrderInput) {
  const supabase = createPublicTenantAdminClient("remote_order_create");
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey) {
    const error = new AppError("Mã chống gửi trùng là bắt buộc cho đơn online.", 422) as AppError & { code?: string };
    error.code = "INVALID_IDEMPOTENCY_KEY";
    throw error;
  }
  const normalizedItems = normalizeOrderItems(input.items);
  const settings = await getPublicOrderingSettingsBySlug(input.restaurantSlug);

  if (!settings) throw new AppError("Không tìm thấy quán", 404);
  await assertFeatureEntitlement(settings.id, "online_ordering");
  if (!settings.online_ordering_enabled) throw new AppError("Quán chưa bật đặt món online.", 400);
  if (input.fulfillmentType === "PICKUP" && !settings.pickup_enabled) {
    throw new AppError("Quán chưa bật đơn khách đến lấy.", 400);
  }
  if (input.fulfillmentType === "DELIVERY" && !settings.delivery_enabled) {
    throw new AppError("Quán chưa bật đơn giao hàng.", 400);
  }
  if (input.fulfillmentType === "DELIVERY") {
    await assertFeatureEntitlement(settings.id, "delivery_basic");
  }

  const requiresPrepaidQr = settings.online_payment_mode === "QR_PREPAID";
  const requestedPaymentMethod = input.paymentMethod ?? (requiresPrepaidQr ? "QR" : "CASH");
  if (requiresPrepaidQr && requestedPaymentMethod !== "QR") {
    throw new AppError("Quán đang yêu cầu thanh toán VietQR trước cho đơn online.", 400);
  }
  if (!requiresPrepaidQr && requestedPaymentMethod !== "CASH") {
    throw new AppError("Quán hiện chỉ nhận thanh toán tiền mặt khi nhận món.", 400);
  }
  if (requiresPrepaidQr && (!settings.bank_code || !settings.bank_account)) {
    throw new AppError("Quán đang yêu cầu chuyển khoản trước nhưng chưa cấu hình ngân hàng VietQR.", 400);
  }

  const requestedIds = [...new Set(normalizedItems.map((item) => item.menuItemId))];
  const { data: menuItems, error: itemError } = await supabase
    .from("menu_items")
    .select("id,price")
    .eq("restaurant_id", settings.id)
    .eq("is_available", true)
    .in("id", requestedIds);

  throwIfSupabaseError(itemError);
  if ((menuItems ?? []).length !== requestedIds.length) {
    throw new AppError("Một hoặc nhiều món hiện không khả dụng", 400);
  }

  const pricedItems = await priceOrderItems({
    supabase,
    restaurantId: settings.id,
    normalizedItems,
    menuItems: menuItems ?? [],
    enforceRequiredModifiers: true
  });
  const itemSubtotal = pricedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  if (itemSubtotal <= 0) throw new AppError("Tổng tiền đơn hàng phải lớn hơn 0", 400);

  const deliveryQuote =
    input.fulfillmentType === "DELIVERY"
      ? await quoteDeliveryForRestaurant(settings, {
          subtotal: itemSubtotal,
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng
        })
      : null;

  if (deliveryQuote && !deliveryQuote.accepted) {
    throw new AppError(deliveryQuote.reason ?? "Địa chỉ này chưa nằm trong vùng nhận đơn.", 400);
  }

  const deliveryFee = deliveryQuote?.fee ?? 0;
  const serviceFee = deliveryQuote?.serviceFee ?? calculateServiceFee(settings, itemSubtotal);
  const subtotal = itemSubtotal + deliveryFee + serviceFee;

  return withPromotionUsageLock(settings.id, input.promotionCode, async () => {
    const promotionCustomerKeyHash = buildPromotionCustomerKeyHash({
      restaurantId: settings.id,
      channel: "WEBSITE",
      customerPhone: input.customerPhone,
      customerSessionId: input.customerSessionId
    });
    const { promotion, discountAmount } = await resolvePromotionForOrder({
      restaurantId: settings.id,
      code: input.promotionCode,
      subtotal: itemSubtotal,
      deliveryFee,
      channel: "WEBSITE",
      customerKeyHash: promotionCustomerKeyHash,
      items: pricedItems.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice
      }))
    });
    const total = subtotal - discountAmount;
    const initialPaymentMethod: PaymentMethod = requestedPaymentMethod;
    const initialPaymentStatus: PaymentStatus = requiresPrepaidQr ? "waiting_payment" : "unpaid";
    const destination = deliveryQuote?.destination ?? null;
    const canonicalDeliveryAddress = deliveryQuote?.addressQualitySnapshot?.normalizedAddress ?? null;
    const shouldStoreRoute = input.fulfillmentType === "DELIVERY" && settings.delivery_tracking_enabled;
    const branchAssignment = await resolveOrderBranchAssignmentForRestaurant({
      supabase,
      restaurantId: settings.id,
      fulfillmentType: input.fulfillmentType,
      deliveryNearestStoreId: deliveryQuote?.nearestStore?.id ?? null,
      requestedBranchId: input.fulfillmentType === "PICKUP" ? input.branchId ?? null : null,
      requireRequestedBranch: input.fulfillmentType === "PICKUP" && Boolean(input.branchId?.trim())
    });
    const deliveryQuoteSnapshot = deliveryQuote
      ? stableDeliveryQuoteSnapshot(buildDeliveryQuoteSnapshot(settings, deliveryQuote))
      : null;
    const atomicResult = await createOnlineOrderAtomic(supabase, {
      restaurantId: settings.id,
      idempotencyKey,
      order: {
        table_id: null,
        bill_id: null,
        branch_id: branchAssignment.branchId,
        branch_assignment_source: branchAssignment.source,
        fulfillment_type: input.fulfillmentType,
        subtotal,
        discount_amount: discountAmount,
        promotion_id: promotion?.id ?? null,
        promotion_code: promotion?.code ?? null,
        promotion_customer_key_hash: promotion ? promotionCustomerKeyHash : null,
        total,
        payment_method: initialPaymentMethod,
        payment_status: initialPaymentStatus,
        customer_session_id: input.customerSessionId || null,
        customer_note: input.customerNote?.trim() || null,
        customer_name: input.customerName.trim(),
        customer_phone: input.customerPhone.trim(),
        delivery_address: input.fulfillmentType === "DELIVERY" ? canonicalDeliveryAddress : null,
        delivery_lat: input.fulfillmentType === "DELIVERY" ? destination?.lat ?? null : null,
        delivery_lng: input.fulfillmentType === "DELIVERY" ? destination?.lng ?? null : null,
        delivery_distance_km: deliveryQuote?.distanceKm ?? null,
        delivery_fee: deliveryFee,
        service_fee: serviceFee,
        delivery_status: input.fulfillmentType === "DELIVERY" ? "requested" : "none",
        delivery_route_geometry: shouldStoreRoute ? toFinancialJsonValue(deliveryQuote?.routeGeometry) : null,
        delivery_route_duration_minutes: shouldStoreRoute
          ? deliveryQuote?.routeDurationMinutes ?? deliveryQuote?.etaMinutes ?? null
          : null,
        delivery_route_provider: deliveryQuote?.routeProvider ?? null,
        delivery_route_confidence: deliveryQuote?.confidence ?? null,
        delivery_quote_version: deliveryQuote?.quoteVersion ?? null,
        delivery_quote_snapshot: deliveryQuoteSnapshot,
        delivery_tracking_updated_at: null
      },
      items: pricedItems.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        price: item.unitPrice,
        base_price: item.basePrice,
        modifier_total: item.modifierTotal,
        modifier_snapshot: item.modifierSnapshot.map((selection) => ({
          groupId: selection.groupId,
          groupName: selection.groupName,
          kind: selection.kind ?? null,
          optionId: selection.optionId,
          optionName: selection.optionName,
          pricingMode: selection.pricingMode,
          priceValue: selection.priceValue,
          priceDelta: selection.priceDelta,
          quantity: selection.quantity,
          lineTotal: selection.lineTotal
        })),
        note: mergeOrderItemNote(item.note, item.modifierNote)
      })),
      actorUserId: null
    });
    const atomicOrder = atomicResult.order;
    const orderId =
      atomicOrder && typeof atomicOrder === "object" && !Array.isArray(atomicOrder) && typeof atomicOrder.id === "string"
        ? atomicOrder.id
        : null;
    if (!orderId) {
      const error = new AppError("Phản hồi tạo đơn online không hợp lệ.", 502) as AppError & { code?: string };
      error.code = "INVALID_FINANCIAL_RPC_RESPONSE";
      throw error;
    }
    const isIdempotentReplay = atomicResult.idempotentReplay === true;
    if (isIdempotentReplay) {
      writeOperationalEvent({
        area: "ops",
        event: "customer_order_idempotency_replay",
        status: "warn",
        restaurantId: settings.id,
        metadata: {
          orderId,
          scope: "remote"
        }
      });
    }

    const order = await getOrderDto(orderId, supabase);
    if (!isIdempotentReplay) {
      await enqueueTelegramNotification({
        type: "order.created",
        eventId: `order.created:${order.id}`,
        restaurantId: settings.id,
        branchId: order.branchId ?? null,
        source: "online_ordering",
        actor: { type: "customer" },
        order: buildTelegramOrderSnapshot(order)
      });
      await broadcastVpsRealtime({
        event: "new_order",
        orderId: order.id,
        restaurantId: settings.id,
        payload: {
          orderId: order.id,
          branchId: order.branchId ?? null,
          fulfillmentType: order.fulfillmentType,
          status: order.status,
          paymentStatus: order.paymentStatus,
          total: order.total
        }
      });
      invalidateRestaurantOrderCache(settings.id);
      invalidateRestaurantDashboardCache(settings.id);
    }
    return {
      order,
      payment: getPaymentInstructions(order),
      deliveryQuote
    };
  });
}

export async function getPublicOrder(orderId: string, access?: CustomerOrderAccessInput) {
  const supabase = createPublicTenantAdminClient("customer_order_read");
  if (access) {
    await assertCustomerOrderAccess(orderId, access, supabase);
  }

  const order = await getOrderDto(orderId, supabase);
  return {
    order,
    payment: getPaymentInstructions(order)
  };
}

export async function getRemotePublicOrder(orderId: string, access: RemoteOrderAccessInput) {
  const supabase = createPublicTenantAdminClient("remote_order_read");
  await assertRemoteOrderAccess(orderId, access, supabase);

  const order = await getOrderDto(orderId, supabase);
  return {
    order,
    payment: getPaymentInstructions(order)
  };
}

export async function listPublicOrderHistory(input: {
  restaurantSlug: string;
  tableId: string;
  tableAccessToken?: string;
  customerSessionId?: string;
  verifiedSession?: VerifiedCustomerSessionTokenClaims | null;
}) {
  const supabase = createPublicTenantAdminClient("customer_order_history");
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,allow_legacy_qr,platform_status,deleted_at")
    .eq("slug", input.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  assertPublicTenantActive(restaurant);

  const table = await getPublicTable(restaurant.id, input.tableId, input.tableAccessToken, {
    allowLegacyQr: restaurant.allow_legacy_qr
  });
  if (!table) throw new AppError("Không tìm thấy bàn hoặc mã QR đã hết hiệu lực. Vui lòng quét lại mã tại bàn.", 403);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const customerSessionId = input.customerSessionId;
  const verifiedOwnership = customerSessionId
    ? createVerifiedOrderOwnershipContext(customerSessionId, input.verifiedSession, {
        restaurantId: restaurant.id,
        scope: "DINE_IN",
        tableId: table.id,
        tokenVersion: customerSessionTokenVersion()
      })
    : null;

  const { data: activeBill, error: billError } = await supabase
    .from("table_bills")
    .select("id")
    .eq("restaurant_id", restaurant.id)
    .eq("table_id", table.id)
    .in("status", ["open", "waiting_payment", "waiting_confirm"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(billError);

  if (!activeBill) {
    return [];
  }

  const [sessionOrders, tableOpenOrders] = await Promise.all([
    customerSessionId
      ? runOrderSelectWithBranchFallback((select) =>
          supabase
            .from("orders")
            .select(select)
            .eq("restaurant_id", restaurant.id)
            .eq("table_id", table.id)
            .eq("bill_id", activeBill.id)
            .eq("customer_session_id", customerSessionId)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(30)
        )
      : Promise.resolve({ data: [], error: null }),
    runOrderSelectWithBranchFallback((select) =>
      supabase
        .from("orders")
        .select(select)
        .eq("restaurant_id", restaurant.id)
        .eq("table_id", table.id)
        .eq("bill_id", activeBill.id)
        .in("status", activePublicStatuses)
        .order("created_at", { ascending: false })
        .limit(30)
    )
  ]);

  throwIfSupabaseError(sessionOrders.error);
  throwIfSupabaseError(tableOpenOrders.error);

  const byId = new Map<string, OrderDto>();
  for (const row of [...(sessionOrders.data ?? []), ...(tableOpenOrders.data ?? [])]) {
    const raw = row as unknown as RawOrder;
    const order = mapOrder(raw);
    byId.set(order.id, sanitizeSharedTableHistoryOrder(order, raw.customer_session_id === customerSessionId ? verifiedOwnership : null));
  }

  const orders = (await attachLatestDeliveryLocations(restaurant.id, [...byId.values()], supabase))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const tableOpenIds = new Set(((tableOpenOrders.data ?? []) as unknown as Array<{ id: string }>).map((order) => order.id));
  const openOrders = orders.filter((order) => tableOpenIds.has(order.id));

  return {
    orders: orders.map((order) => ({
      order,
      payment: getPaymentInstructions(order)
    })),
    activeCount: openOrders.length,
    openTotal: openOrders.reduce((sum, order) => sum + order.total, 0)
  };
}

export async function listRemoteOrderHistory(input: {
  restaurantSlug: string;
  customerSessionId: string;
}) {
  const supabase = createPublicTenantAdminClient("remote_order_history");
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,platform_status,deleted_at")
    .eq("slug", input.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  assertPublicTenantActive(restaurant);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await runOrderSelectWithBranchFallback((select) =>
    supabase
      .from("orders")
      .select(select)
      .eq("restaurant_id", restaurant.id)
      .is("table_id", null)
      .eq("customer_session_id", input.customerSessionId)
      .in("fulfillment_type", ["PICKUP", "DELIVERY"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20)
  );

  throwIfSupabaseError(error);

  const orders = await attachLatestDeliveryLocations(
    restaurant.id,
    ((data ?? []) as unknown as RawOrder[]).map((row) => mapOrder(row)),
    supabase
  );
  const openOrders = orders.filter((order) => activePublicStatuses.includes(order.status));

  return {
    orders: orders.map((order) => ({
      order,
      payment: getPaymentInstructions(order)
    })),
    activeCount: openOrders.length,
    openTotal: openOrders.reduce((sum, order) => sum + order.total, 0)
  };
}

export async function listOrdersForRestaurant(
  restaurantId: string,
  options: {
    activeLimit?: number;
    includeHistory?: boolean;
    limit?: number;
  } = {}
) {
  const supabase = createAdminSupabaseClient();

  if (options.includeHistory) {
    const [activeResult, historyResult] = await Promise.all([
      runOrderSelectWithBranchFallback((select) =>
        supabase
          .from("orders")
          .select(select)
          .eq("restaurant_id", restaurantId)
          .not("status", "in", "(paid,cancelled)")
          .order("created_at", { ascending: false })
          .limit(options.activeLimit ?? defaultActiveOrdersLimit)
      ),
      runOrderSelectWithBranchFallback((select) =>
        supabase
          .from("orders")
          .select(select)
          .eq("restaurant_id", restaurantId)
          .in("status", ["paid", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(options.limit ?? defaultHistoryOrdersLimit)
      )
    ]);

    throwIfSupabaseError(activeResult.error);
    throwIfSupabaseError(historyResult.error);

    const rowsById = new Map<string, RawOrder>();
    for (const row of [...(activeResult.data ?? []), ...(historyResult.data ?? [])]) {
      const order = row as unknown as RawOrder;
      rowsById.set(order.id, order);
    }

    return attachLatestDeliveryLocations(
      restaurantId,
      [...rowsById.values()]
        .map((order) => mapOrder(order))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    );
  }

  const { data, error } = await runOrderSelectWithBranchFallback((select) => {
    return supabase
      .from("orders")
      .select(select)
      .eq("restaurant_id", restaurantId)
      .not("status", "in", "(paid,cancelled)")
      .order("created_at", { ascending: false })
      .limit(options.limit ?? defaultActiveOrdersLimit);
  });

  throwIfSupabaseError(error);
  return attachLatestDeliveryLocations(
    restaurantId,
    (data ?? []).map((order) => mapOrder(order as unknown as RawOrder))
  );
}

export async function listKitchenOrdersForRestaurant(restaurantId: string) {
  const cached = readKitchenOrdersCache(restaurantId);
  if (cached) return cached;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await runKitchenSelectWithBranchFallback((select) =>
    supabase
      .from("orders")
      .select(select)
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "ordering"])
      .order("created_at", { ascending: true })
      .limit(defaultKitchenOrdersLimit)
  );

  throwIfSupabaseError(error);
  const orders = (data ?? []).map((order) => mapKitchenOrder(order as unknown as Omit<RawOrder, "restaurant" | "bill">));
  writeKitchenOrdersCache(restaurantId, orders);
  return orders;
}

export async function acceptOrder(restaurantId: string, orderId: string, minutes = 15, actorUserId?: string | null) {
  const supabase = createAdminSupabaseClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status,fulfillment_type,delivery_status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
  const acceptTransition = resolveMerchantAcceptTransition({
    status: order.status,
    fulfillmentType: order.fulfillment_type,
    deliveryStatus: order.delivery_status
  });
  if (!acceptTransition.allowed) throw new AppError(acceptTransition.reason ?? "Không thể xác nhận đơn hàng", 400);

  const now = new Date();
  const serviceDueAt = new Date(now.getTime() + minutes * 60_000).toISOString();
  const nextDeliveryStatus = acceptTransition.next;
  const shouldUpdateDeliveryStatus =
    order.fulfillment_type === "DELIVERY" &&
    nextDeliveryStatus !== null &&
    nextDeliveryStatus !== undefined &&
    order.delivery_status !== nextDeliveryStatus;

  const updated = await acceptOrderWithInventoryDeduction(restaurantId, {
    orderId,
    actorUserId,
    ...(order.status === "pending" ? { serviceDueAt } : {}),
    deliveryStatus: shouldUpdateDeliveryStatus ? nextDeliveryStatus : null
  });
  if (shouldUpdateDeliveryStatus) {
    try {
      await recordDeliveryStatusTrackingEvent({
        restaurantId,
        orderId,
        deliveryStatus: nextDeliveryStatus as DeliveryActionStatus,
        actorUserId
      });
    } catch (error) {
      console.error("delivery_tracking_accept_event_failed", {
        restaurantId,
        orderId,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  const confirmedOrder = await getOrderDto(orderId, supabase);
  await enqueueTelegramNotification({
    type: "order.confirmed",
    eventId: `order.confirmed:${orderId}`,
    restaurantId,
    branchId: confirmedOrder.branchId ?? null,
    source: "dashboard",
    actor: { type: "merchant", userId: actorUserId ?? null },
    order: buildTelegramOrderSnapshot(confirmedOrder)
  });
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}

export async function updateOrderServiceTimer(restaurantId: string, orderId: string, minutes: number) {
  const supabase = createAdminSupabaseClient();
  const dueAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .update({ service_due_at: dueAt })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "ordering"])
    .select()
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đơn cần hẹn giờ", 404);
  invalidateRestaurantOrderCache(restaurantId);
  return data;
}

export async function markOrderCompleted(restaurantId: string, orderId: string, actorUserId?: string | null) {
  const supabase = createAdminSupabaseClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
  if (order.status === "completed") return order;
  if (order.status === "paid" && order.payment_status === "paid" && order.served_at) return order;
  if (order.status !== "ordering") {
    throw new AppError("Chỉ đơn đã được quán xác nhận mới có thể đánh dấu đã phục vụ", 400);
  }

  // Delivery orders remain operational until the courier confirms delivery.
  const nextStatus =
    order.fulfillment_type === "DELIVERY"
      ? "completed"
      : order.payment_status === "paid"
        ? "paid"
        : "completed";
  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: nextStatus, served_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "ordering")
    .select()
    .maybeSingle();

  throwIfSupabaseError(updateError);
  if (!updated) {
    const { data: latest, error: latestError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    throwIfSupabaseError(latestError);
    if (latest?.status === nextStatus) return latest;
    throw new AppError("Trạng thái đơn đã thay đổi. Vui lòng tải lại danh sách đơn.", 409);
  }
  const completedOrder = await getOrderDto(orderId, supabase);
  await enqueueTelegramNotification({
    type: "order.completed",
    eventId: `order.completed:${orderId}`,
    restaurantId,
    branchId: completedOrder.branchId ?? null,
    source: "dashboard",
    actor: { type: "merchant", userId: actorUserId ?? null },
    order: buildTelegramOrderSnapshot(completedOrder)
  });
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}

/* markOrderItemPrepared — đánh dấu 1 món trong đơn đã làm xong / hoàn tác.
 * Không đổi trạng thái cấp đơn (giữ backend 1:1) — chỉ set order_items.prepared_at.
 * prepared=false → hoàn tác (prepared_at=null). */
export async function markOrderItemPrepared(
  restaurantId: string,
  orderId: string,
  itemId: string,
  prepared: boolean
) {
  const supabase = createAdminSupabaseClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status,payment_status,bill:table_bills(status)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
  const bill = firstOrNull(order.bill as { status?: string | null } | Array<{ status?: string | null }> | null);
  if (order.status === "paid" || order.status === "cancelled" || order.payment_status === "refunded" || bill?.status === "cancelled") {
    throw new AppError("Đơn đã kết thúc, không thể cập nhật món", 400);
  }

  const { data: updatedItem, error: updateError } = await supabase
    .from("order_items")
    .update({ prepared_at: prepared ? new Date().toISOString() : null })
    .eq("id", itemId)
    .eq("order_id", orderId)
    .select("id,prepared_at")
    .maybeSingle();

  if (isMissingOrderItemModifierSchema(updateError)) {
    throw new AppError(
      "Tính năng đánh dấu món cần cập nhật cơ sở dữ liệu (cột prepared_at). Vui lòng chạy migration mới nhất.",
      409
    );
  }
  throwIfSupabaseError(updateError);
  if (!updatedItem) throw new AppError("Không tìm thấy món trong đơn", 404);

  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);

  return getOrderDto(orderId, supabase);
}

export async function updateOrderDeliveryStatus(
  restaurantId: string,
  orderId: string,
  deliveryStatus: Exclude<DeliveryStatus, "none" | "requested">,
  actorUserId?: string | null
) {
  const supabase = createAdminSupabaseClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn giao hàng", 404);
  if (order.fulfillment_type !== "DELIVERY") {
    throw new AppError("Chỉ đơn giao hàng mới có trạng thái vận chuyển", 400);
  }
  if (order.status === "cancelled" || order.payment_status === "refunded") {
    throw new AppError("Đơn đã kết thúc thanh toán, không thể cập nhật giao hàng", 400);
  }
  if (order.delivery_status === deliveryStatus) return order;
  if (order.status !== "ordering" && order.status !== "completed") {
    throw new AppError("Đơn giao cần được quán xác nhận và trừ kho trước khi cập nhật vận chuyển", 409);
  }
  const deliveryTransition = resolveDeliveryStatusTransition(order.delivery_status, deliveryStatus);
  if (!deliveryTransition.allowed) {
    throw new AppError(deliveryTransition.reason ?? "Chuyển trạng thái giao hàng không hợp lệ", 409);
  }

  const nextOrderStatus =
    deliveryStatus === "delivered"
      ? order.payment_status === "paid"
        ? "paid"
        : "completed"
      : order.status;
  let updateQuery = supabase
    .from("orders")
    .update({
      status: nextOrderStatus,
      delivery_status: deliveryStatus,
      delivery_tracking_updated_at: new Date().toISOString(),
      ...(deliveryStatus === "delivered" ? { served_at: new Date().toISOString() } : {})
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("status", order.status)
    .neq("status", "cancelled")
    .select();

  updateQuery = order.delivery_status === null ? updateQuery.is("delivery_status", null) : updateQuery.eq("delivery_status", order.delivery_status);
  const { data: updated, error: updateError } = await updateQuery.maybeSingle();

  throwIfSupabaseError(updateError);
  if (!updated) {
    const { data: latest, error: latestError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    throwIfSupabaseError(latestError);
    if (latest?.delivery_status === deliveryStatus) return latest;
    throw new AppError("Trạng thái đơn đã thay đổi. Không thể cập nhật giao hàng an toàn.", 409);
  }
  try {
    await recordDeliveryStatusTrackingEvent({ restaurantId, orderId, deliveryStatus, actorUserId });
  } catch (error) {
    console.error("delivery_tracking_status_event_failed", {
      restaurantId,
      orderId,
      deliveryStatus,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
  const deliveryOrder = await getOrderDto(orderId, supabase);
  await enqueueTelegramNotification({
    type: "order.delivery_status_changed",
    eventId: `order.delivery_status_changed:${orderId}:${deliveryStatus}`,
    restaurantId,
    branchId: deliveryOrder.branchId ?? null,
    source: "dashboard",
    actor: { type: "merchant", userId: actorUserId ?? null },
    order: buildTelegramOrderSnapshot(deliveryOrder),
    delivery: {
      previousStatus: order.delivery_status ?? null,
      status: deliveryStatus
    }
  });
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}

async function cancelOrderInternal(
  supabase: OrderSupabaseClient,
  restaurantId: string,
  orderId: string,
  actorUserId?: string | null
) {
  const result = await cancelOrderAtomic(supabase, { restaurantId, orderId, actorUserId });
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return result.order ?? result;
}

async function deleteTestOrderInternal(supabase: OrderSupabaseClient, restaurantId: string, orderId: string) {
  const order = await getMutableOrder(supabase, restaurantId, orderId);
  assertOrderNotPaid(order);
  if (order.status !== "pending" || order.payment_status !== "unpaid") {
    throw new AppError("Chỉ xoá cứng đơn test mới tạo, chưa nhận và chưa bắt đầu thanh toán.", 409);
  }

  const { data: atomicDelete, error: atomicDeleteError } = await (supabase as any).rpc("delete_test_order_atomic", {
    p_restaurant_id: restaurantId,
    p_order_id: orderId
  });

  if (!atomicDeleteError) {
    invalidateRestaurantOrderCache(restaurantId);
    invalidateRestaurantDashboardCache(restaurantId);
    return atomicDelete;
  }

  const functionMissing =
    atomicDeleteError.code === "42883" ||
    atomicDeleteError.code === "PGRST202" ||
    String(atomicDeleteError.message ?? "").includes("delete_test_order_atomic");

  if (functionMissing) {
    throw new AppError("Luồng xoá test nguyên tử chưa sẵn sàng. Không thực hiện xoá để tránh mất dấu vết.", 503);
  }

  throw new AppError(atomicDeleteError.message || "Không thể xoá test đơn hàng an toàn.", 409);
}

export async function cancelOrder(restaurantId: string, orderId: string, actorUserId?: string | null) {
  const supabase = createAdminSupabaseClient();
  return cancelOrderInternal(supabase, restaurantId, orderId, actorUserId);
}

export async function deleteTestOrder(restaurantId: string, orderId: string) {
  const supabase = createAdminSupabaseClient();
  return deleteTestOrderInternal(supabase, restaurantId, orderId);
}

export async function cleanupTestOrders(restaurantId: string, input: OrderCleanupInput) {
  const supabase = createAdminSupabaseClient();
  const mode = input.mode;
  const statuses = input.statuses?.length ? input.statuses : defaultCleanupStatuses;
  const cutoff = new Date(Date.now() - Math.max(0, input.olderThanMinutes ?? 0) * 60_000).toISOString();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);

  const { data, error } = await supabase
    .from("orders")
    .select("id,status")
    .eq("restaurant_id", restaurantId)
    .in("status", statuses)
    .not("payment_status", "in", "(paid,refunded)")
    .is("paid_at", null)
    .lte("created_at", cutoff)
    .not("delivery_status", "in", "(out_for_delivery,delivered)")
    .order("created_at", { ascending: false })
    .limit(limit);

  throwIfSupabaseError(error);
  const candidates = data ?? [];
  const results: Array<{ orderId: string; status: "cancelled" | "deleted" | "skipped"; reason?: string }> = [];

  for (const candidate of candidates) {
    try {
      if (mode === "delete_test") {
        await deleteTestOrderInternal(supabase, restaurantId, candidate.id);
        results.push({ orderId: candidate.id, status: "deleted" });
      } else {
        await cancelOrderInternal(supabase, restaurantId, candidate.id);
        results.push({ orderId: candidate.id, status: "cancelled" });
      }
    } catch (error) {
      results.push({
        orderId: candidate.id,
        status: "skipped",
        reason: error instanceof Error ? error.message : "Không xử lý được đơn"
      });
    }
  }

  return {
    mode,
    scanned: candidates.length,
    cancelled: results.filter((item) => item.status === "cancelled").length,
    deleted: results.filter((item) => item.status === "deleted").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    results
  };
}
