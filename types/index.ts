import type { OrderStatus, PaymentMethod } from "@/types/domain";

export type PublicPromotion = {
  id: string;
  name: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minOrderAmount: number;
  startsAt: string | null;
  endsAt: string | null;
};

export type PublicMenuItem = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  image: string | null;
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
