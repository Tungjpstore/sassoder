"use client";

import { create } from "zustand";
import {
  addDineInCartItem,
  decrementDineInCartItem,
  removeDineInCartItem,
  setDineInCartItemNote,
  type DineInCartItem
} from "@/lib/customer/cart-state";

type CartStore = {
  items: Record<string, DineInCartItem>;
  add: (item: Omit<DineInCartItem, "quantity">) => void;
  decrement: (lineId: string) => void;
  remove: (lineId: string) => void;
  setNote: (lineId: string, note: string) => void;
  clear: () => void;
};

export const useDineInCartStore = create<CartStore>((set) => ({
  items: {},
  add: (item) =>
    set((state) => ({
      items: addDineInCartItem(state.items, item)
    })),
  decrement: (lineId) =>
    set((state) => ({
      items: decrementDineInCartItem(state.items, lineId)
    })),
  remove: (lineId) =>
    set((state) => ({
      items: removeDineInCartItem(state.items, lineId)
    })),
  setNote: (lineId, note) =>
    set((state) => ({
      items: setDineInCartItemNote(state.items, lineId, note)
    })),
  clear: () => set({ items: {} })
}));
