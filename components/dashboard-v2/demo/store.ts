"use client";

/* ============================================================
 * store.ts — store đơn giản chia sẻ state đơn hàng giữa các
 * workspace demo. Dùng external store + useSyncExternalStore
 * để mọi component thấy cùng dữ liệu khi navigate qua lại.
 * ============================================================ */

import { useSyncExternalStore } from "react";
import { DEMO_ORDERS, type DemoOrder, type DemoStatus, STATUS_META } from "./data";

type Listener = () => void;

let orders: DemoOrder[] = DEMO_ORDERS.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export const ordersStore = {
  getSnapshot(): DemoOrder[] {
    return orders;
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  advance(id: string) {
    orders = orders
      .map((o) => {
        if (o.id !== id) return o;
        const next = STATUS_META[o.status].next;
        if (next === "done") return null;
        return { ...o, status: next, startedAt: Date.now() };
      })
      .filter(Boolean) as DemoOrder[];
    emit();
  },
  toggleItem(orderId: string, itemIdx: number) {
    orders = orders.map((o) =>
      o.id === orderId
        ? { ...o, items: o.items.map((it, i) => (i === itemIdx ? { ...it, done: !it.done } : it)) }
        : o
    );
    emit();
  },
  markPaid(id: string) {
    orders = orders
      .map((o) => (o.id === id ? { ...o, paymentStatus: "paid" as const, status: "done" as DemoStatus } : o))
      .filter((o) => o.status !== "done") as DemoOrder[];
    emit();
  },
  reset() {
    orders = DEMO_ORDERS.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
    emit();
  }
};

export function useOrders() {
  return useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, ordersStore.getSnapshot);
}
