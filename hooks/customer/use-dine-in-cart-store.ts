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
  decrement: (menuItemId: string) => void;
  remove: (menuItemId: string) => void;
  setNote: (menuItemId: string, note: string) => void;
  clear: () => void;
};

export const useDineInCartStore = create<CartStore>((set) => ({
  items: {},
  add: (item) =>
    set((state) => ({
      items: addDineInCartItem(state.items, item)
    })),
  decrement: (menuItemId) =>
    set((state) => ({
      items: decrementDineInCartItem(state.items, menuItemId)
    })),
  remove: (menuItemId) =>
    set((state) => ({
      items: removeDineInCartItem(state.items, menuItemId)
    })),
  setNote: (menuItemId, note) =>
    set((state) => ({
      items: setDineInCartItemNote(state.items, menuItemId, note)
    })),
  clear: () => set({ items: {} })
}));
