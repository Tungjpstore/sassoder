"use client";

import { useMemo, useState } from "react";
import type { RemoteCartLine } from "@/lib/customer/cart-state";

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
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = activeCategory === "all" || item.categoryId === activeCategory;
      const matchesSearch = !normalizedSearch || `${item.name} ${item.categoryName}`.toLowerCase().includes(normalizedSearch);
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

export function useRemoteCart<TItem extends { id: string }>(items: TItem[]) {
  const [cart, setCart] = useState<Record<string, RemoteCartLine>>({});

  const cartLines = useMemo(() => {
    return Object.values(cart)
      .map((line) => {
        const item = items.find((menuItem) => menuItem.id === line.itemId);
        return item ? { ...line, item } : null;
      })
      .filter(Boolean) as Array<RemoteCartLine & { item: TItem }>;
  }, [items, cart]);

  return {
    cart,
    cartLines,
    setCart
  };
}
