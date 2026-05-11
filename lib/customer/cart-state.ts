export type DineInCartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string | null;
  note?: string;
};

export type DineInCartItems = Record<string, DineInCartItem>;

export type RemoteCartLine = {
  itemId: string;
  quantity: number;
};

export type RemoteCart = Record<string, RemoteCartLine>;

type ReorderableOrderItem = {
  quantity: number;
  menuItem: { id?: string | null } | null;
};

export function addDineInCartItem(items: DineInCartItems, item: Omit<DineInCartItem, "quantity">): DineInCartItems {
  const current = items[item.menuItemId];

  return {
    ...items,
    [item.menuItemId]: {
      ...item,
      quantity: (current?.quantity ?? 0) + 1,
      note: current?.note
    }
  };
}

export function decrementDineInCartItem(items: DineInCartItems, menuItemId: string): DineInCartItems {
  const current = items[menuItemId];
  if (!current) return items;

  const next = { ...items };
  if (current.quantity <= 1) {
    delete next[menuItemId];
    return next;
  }

  next[menuItemId] = { ...current, quantity: current.quantity - 1 };
  return next;
}

export function removeDineInCartItem(items: DineInCartItems, menuItemId: string): DineInCartItems {
  if (!items[menuItemId]) return items;

  const next = { ...items };
  delete next[menuItemId];
  return next;
}

export function setDineInCartItemNote(items: DineInCartItems, menuItemId: string, note: string): DineInCartItems {
  const current = items[menuItemId];
  if (!current || current.note === note) return items;

  return {
    ...items,
    [menuItemId]: { ...current, note }
  };
}

export function updateRemoteCartQuantity(cart: RemoteCart, itemId: string, delta: number): RemoteCart {
  const currentLine = cart[itemId];
  const nextQuantity = Math.max(0, (currentLine?.quantity ?? 0) + delta);

  if (nextQuantity === 0) {
    if (!currentLine) return cart;
    const next = { ...cart };
    delete next[itemId];
    return next;
  }

  return {
    ...cart,
    [itemId]: { itemId, quantity: nextQuantity }
  };
}

export function buildRemoteCartFromOrderItems(items?: readonly ReorderableOrderItem[] | null): RemoteCart {
  const nextCart: RemoteCart = {};

  for (const item of items ?? []) {
    const itemId = item.menuItem?.id;
    if (!itemId || item.quantity <= 0) continue;

    nextCart[itemId] = {
      itemId,
      quantity: (nextCart[itemId]?.quantity ?? 0) + item.quantity
    };
  }

  return nextCart;
}
