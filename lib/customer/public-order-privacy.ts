import type { OrderDto } from "@/types/domain";
import {
  isVerifiedCustomerSessionTokenClaims,
  type CustomerSessionScope,
  type VerifiedCustomerSessionTokenClaims
} from "./customer-session-token";

const verifiedOrderOwnershipBrand: unique symbol = Symbol("verified-order-ownership");

export type VerifiedOrderOwnershipContext = Readonly<{
  orderOwnerSessionId: string;
  viewerSessionId: string;
  restaurantId: string;
  scope: CustomerSessionScope;
  tableId?: string;
  tokenVersion: number;
  expiresAt: number;
  [verifiedOrderOwnershipBrand]: true;
}>;

export type VerifiedOrderOwnershipBinding = {
  restaurantId: string;
  scope: CustomerSessionScope;
  tableId?: string;
  tokenVersion: number;
};

export function createVerifiedOrderOwnershipContext(
  orderOwnerSessionId: string | null | undefined,
  verifiedSession: VerifiedCustomerSessionTokenClaims | null | undefined,
  expected: VerifiedOrderOwnershipBinding
): VerifiedOrderOwnershipContext | null {
  if (
    typeof orderOwnerSessionId !== "string" ||
    orderOwnerSessionId.length === 0 ||
    orderOwnerSessionId.trim() !== orderOwnerSessionId ||
    !isVerifiedCustomerSessionTokenClaims(verifiedSession) ||
    !isCanonicalIdentifier(expected?.restaurantId) ||
    (expected?.scope !== "REMOTE" && expected?.scope !== "DINE_IN") ||
    !Number.isInteger(expected?.tokenVersion) ||
    expected.tokenVersion < 1 ||
    verifiedSession.sid !== orderOwnerSessionId ||
    verifiedSession.rid !== expected.restaurantId ||
    verifiedSession.scope !== expected.scope ||
    verifiedSession.tokenVersion !== expected.tokenVersion ||
    (expected.scope === "DINE_IN" &&
      (!isCanonicalIdentifier(expected.tableId) || verifiedSession.tableId !== expected.tableId)) ||
    (expected.scope === "REMOTE" && (expected.tableId !== undefined || verifiedSession.tableId !== undefined))
  ) {
    return null;
  }

  const context = {
    orderOwnerSessionId,
    viewerSessionId: verifiedSession.sid,
    restaurantId: verifiedSession.rid,
    scope: verifiedSession.scope,
    ...(verifiedSession.tableId === undefined ? {} : { tableId: verifiedSession.tableId }),
    tokenVersion: verifiedSession.tokenVersion,
    expiresAt: verifiedSession.exp
  } as Omit<VerifiedOrderOwnershipContext, typeof verifiedOrderOwnershipBrand> & {
    [verifiedOrderOwnershipBrand]?: true;
  };
  Object.defineProperty(context, verifiedOrderOwnershipBrand, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return Object.freeze(context) as VerifiedOrderOwnershipContext;
}

function isCanonicalIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

/**
 * Shared-table history: other diners may see open bill lines, but not private guest fields.
 */
export function sanitizeSharedTableHistoryOrder(
  order: OrderDto,
  ownership: VerifiedOrderOwnershipContext | null | undefined,
  now?: number
): OrderDto;
/** @deprecated Raw session IDs are fail-closed; migrate callers to VerifiedOrderOwnershipContext. */
export function sanitizeSharedTableHistoryOrder(
  order: OrderDto,
  ownerSessionId: string | null | undefined,
  viewerSessionId: string | null | undefined
): OrderDto;
export function sanitizeSharedTableHistoryOrder(
  order: OrderDto,
  ownershipOrLegacySession: VerifiedOrderOwnershipContext | string | null | undefined,
  nowOrLegacyViewer: number | string | null | undefined = Math.floor(Date.now() / 1000)
): OrderDto {
  const ownership = typeof ownershipOrLegacySession === "object" ? ownershipOrLegacySession : null;
  const now = typeof nowOrLegacyViewer === "number"
    ? nowOrLegacyViewer
    : Math.floor(Date.now() / 1000);
  if (isCurrentVerifiedOwnership(ownership, now)) {
    return order;
  }

  return {
    ...order,
    customerName: null,
    customerPhone: null,
    customerNote: null,
    deliveryAddress: null,
    deliveryLat: null,
    deliveryLng: null,
    deliveryDistanceKm: null,
    deliveryFee: undefined,
    serviceFee: undefined,
    deliveryStatus: undefined,
    deliveryRouteGeometry: null,
    deliveryRouteDurationMinutes: null,
    deliveryQuoteSnapshot: null,
    deliveryTrackingUpdatedAt: null,
    deliveryCourierId: null,
    deliveryAssignedAt: null,
    deliveryCourier: null,
    deliveryCourierLocation: null,
    deliveryTrackingSnapshot: null
  };
}

function isCurrentVerifiedOwnership(
  ownership: VerifiedOrderOwnershipContext | null | undefined,
  now: number
) {
  return Boolean(
    ownership &&
    typeof ownership === "object" &&
    ownership[verifiedOrderOwnershipBrand] === true &&
    ownership.orderOwnerSessionId === ownership.viewerSessionId &&
    Number.isInteger(now) &&
    ownership.expiresAt > now
  );
}
