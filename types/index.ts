import type { OrderStatus, PaymentMethod } from "@/types/domain";

export type PublicPromotion = {
  id: string;
  name: string;
  code: string;
  discountScope: "ORDER" | "DELIVERY_FEE";
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minOrderAmount: number;
  totalUsageLimit: number | null;
  perCustomerUsageLimit: number | null;
  rewardType?: "DISCOUNT" | "FREE_ITEM";
  freeItemMenuItemId?: string | null;
  freeItemQuantity?: number | null;
  remainingTotalUsage: number | null;
  startsAt: string | null;
  endsAt: string | null;
};

export type PublicStoreBranch = {
  id: string;
  name: string;
  address: string | null;
  isPrimary: boolean;
  pickupEtaMinutes: number;
  deliveryEtaMinutes: number;
};

export type PublicMenuOptionKind = "SIZE" | "TOPPING" | "ICE" | "SUGAR" | "ADDON" | "COMBO" | "CHOICE" | "NOTE_PRESET" | "CUSTOM";
export type PublicMenuOptionSelectionType = "SINGLE" | "MULTIPLE" | "QUANTITY";
export type PublicMenuOptionPricingMode = "DELTA" | "ABSOLUTE";

export type PublicMenuModifierOption = {
  id: string;
  name: string;
  priceDelta: number;
  pricingMode?: PublicMenuOptionPricingMode;
  priceValue?: number | null;
  isDefault?: boolean;
  isAvailable?: boolean;
};

export type PublicMenuModifierGroup = {
  id: string;
  name: string;
  kind?: PublicMenuOptionKind;
  selectionType?: PublicMenuOptionSelectionType;
  allowQuantity?: boolean;
  required: boolean;
  minSelect: number;
  maxSelect: number | null;
  options: PublicMenuModifierOption[];
};

export type PublicMenuItem = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  image: string | null;
  modifierGroups?: PublicMenuModifierGroup[];
};

export type PublicMenuCategory = {
  id: string;
  name: string;
  items: PublicMenuItem[];
};

export type PublicOrderStatus = {
  id: string;
  status: OrderStatus;
  subtotal?: number;
  discountAmount?: number;
  promotionCode?: string | null;
  total: number;
  paymentMethod: PaymentMethod | null;
};
