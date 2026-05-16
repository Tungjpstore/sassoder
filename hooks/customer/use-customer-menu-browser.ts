"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeRemoteCart,
  restoreRemoteCartSnapshot,
  serializeRemoteCartSnapshot,
  type RemoteCartLine
} from "@/lib/customer/cart-state";

function normalizeMenuSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function useDineInMenuBrowser<TItem extends { name: string }, TCategory extends { id: string; items: TItem[] }>(
  categories: TCategory[]
) {
  const [categoryId, setCategoryId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const visibleCategories = useMemo(() => {
    const query = normalizeMenuSearch(searchQuery.trim());
    const scoped = categoryId === "all" ? categories : categories.filter((category) => category.id === categoryId);
    return scoped
      .map((category) => ({
        ...category,
        items: query ? category.items.filter((item) => normalizeMenuSearch(item.name).includes(query)) : category.items
      }))
      .filter((category) => category.items.length > 0 || !query);
  }, [categories, categoryId, searchQuery]);

  return {
    categoryId,
    searchQuery,
    setCategoryId,
    setSearchQuery,
    visibleCategories
  };
}

export function useRemoteMenuBrowser<TItem extends { name: string; categoryId: string; categoryName: string }>(items: TItem[]) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const visibleItems = useMemo(() => {
    const normalizedSearch = normalizeMenuSearch(searchQuery.trim());
    return items.filter((item) => {
      const matchesCategory = activeCategory === "all" || item.categoryId === activeCategory;
      const matchesSearch = !normalizedSearch || normalizeMenuSearch(`${item.name} ${item.categoryName}`).includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, items, searchQuery]);

  return {
    activeCategory,
    searchQuery,
    setActiveCategory,
    setSearchQuery,
    visibleItems
  };
}

export function useRemoteCart<TItem extends { id: string }>(items: TItem[], options: { storageKey?: string } = {}) {
  const [cart, setCart] = useState<Record<string, RemoteCartLine>>({});
  const hydratedStorageKeyRef = useRef<string | null>(null);
  const restoredSnapshotPendingRef = useRef(false);
  const validItemIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const normalizedCart = useMemo(() => normalizeRemoteCart(cart, validItemIds), [cart, validItemIds]);

  useEffect(() => {
    if (!options.storageKey || hydratedStorageKeyRef.current === options.storageKey) return;

    hydratedStorageKeyRef.current = options.storageKey;
    restoredSnapshotPendingRef.current = true;
    setCart(restoreRemoteCartSnapshot(window.localStorage.getItem(options.storageKey), validItemIds));
  }, [options.storageKey, validItemIds]);

  useEffect(() => {
    if (!options.storageKey || hydratedStorageKeyRef.current !== options.storageKey) return;

    if (restoredSnapshotPendingRef.current) {
      restoredSnapshotPendingRef.current = false;
      return;
    }

    const snapshot = serializeRemoteCartSnapshot(normalizedCart);
    if (snapshot.lines.length === 0) {
      window.localStorage.removeItem(options.storageKey);
      return;
    }

    window.localStorage.setItem(options.storageKey, JSON.stringify(snapshot));
  }, [normalizedCart, options.storageKey]);

  const cartLines = useMemo(() => {
    return Object.values(normalizedCart)
      .map((line) => {
        const item = items.find((menuItem) => menuItem.id === line.itemId);
        return item ? { ...line, item } : null;
      })
      .filter(Boolean) as Array<RemoteCartLine & { item: TItem }>;
  }, [items, normalizedCart]);

  return {
    cart: normalizedCart,
    cartLines,
    setCart
  };
}
