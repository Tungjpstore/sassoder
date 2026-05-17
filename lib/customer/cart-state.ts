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
  note?: string;
};

export type RemoteCart = Record<string, RemoteCartLine>;

export type RemoteCartSnapshot = {
  version: 1;
  lines: RemoteCartLine[];
};

type ReorderableOrderItem = {
  quantity: number;
  note?: string | null;
  menuItem: { id?: string | null } | null;
};

const REMOTE_CART_MAX_QUANTITY_PER_ITEM = 50;
const REMOTE_CART_MAX_NOTE_LENGTH = 200;

function normalizeRemoteQuantity(value: unknown) {
  const quantity = Math.floor(Number(value));
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.min(quantity, REMOTE_CART_MAX_QUANTITY_PER_ITEM);
}

function normalizeRemoteNote(value: unknown) {
  if (typeof value !== "string") return undefined;
  const note = value.trim().slice(0, REMOTE_CART_MAX_NOTE_LENGTH);
  return note || undefined;
}

function mergeRemoteNotes(first?: string, second?: string) {
  const notes = [first, second].map((note) => normalizeRemoteNote(note)).filter(Boolean) as string[];
  return notes.length ? [...new Set(notes)].join("; ").slice(0, REMOTE_CART_MAX_NOTE_LENGTH) : undefined;
}

function remoteCartFromLines(lines: unknown[]) {
  const cart: RemoteCart = {};
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) continue;
    const record = line as Partial<RemoteCartLine>;
    if (typeof record.itemId !== "string") continue;
    const quantity = normalizeRemoteQuantity(record.quantity);
    if (quantity <= 0) continue;
    const note = mergeRemoteNotes(cart[record.itemId]?.note, record.note);
    cart[record.itemId] = {
      itemId: record.itemId,
      quantity: Math.min((cart[record.itemId]?.quantity ?? 0) + quantity, REMOTE_CART_MAX_QUANTITY_PER_ITEM),
      ...(note ? { note } : {})
    };
  }
  return cart;
}

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
  const nextQuantity = Math.min(REMOTE_CART_MAX_QUANTITY_PER_ITEM, Math.max(0, (currentLine?.quantity ?? 0) + delta));

  if (nextQuantity === 0) {
    if (!currentLine) return cart;
    const next = { ...cart };
    delete next[itemId];
    return next;
  }

  return {
    ...cart,
    [itemId]: { itemId, quantity: nextQuantity, ...(currentLine?.note ? { note: currentLine.note } : {}) }
  };
}

export function setRemoteCartItemNote(cart: RemoteCart, itemId: string, note: string): RemoteCart {
  const currentLine = cart[itemId];
  if (!currentLine) return cart;

  const normalizedNote = normalizeRemoteNote(note);
  if ((currentLine.note ?? "") === (normalizedNote ?? "")) return cart;

  return {
    ...cart,
    [itemId]: {
      ...currentLine,
      ...(normalizedNote ? { note: normalizedNote } : { note: undefined })
    }
  };
}

export function normalizeRemoteCart(cart: RemoteCart, availableItemIds?: Iterable<string>): RemoteCart {
  const allowed = availableItemIds ? new Set(availableItemIds) : null;
  const nextCart: RemoteCart = {};

  for (const [fallbackItemId, line] of Object.entries(cart)) {
    if (!line || typeof line !== "object" || Array.isArray(line)) continue;
    const itemId = typeof line.itemId === "string" && line.itemId.trim() ? line.itemId : fallbackItemId;
    if (!itemId || (allowed && !allowed.has(itemId))) continue;

    const quantity = normalizeRemoteQuantity(line.quantity);
    if (quantity <= 0) continue;
    const note = mergeRemoteNotes(nextCart[itemId]?.note, line.note);

    nextCart[itemId] = {
      itemId,
      quantity: Math.min((nextCart[itemId]?.quantity ?? 0) + quantity, REMOTE_CART_MAX_QUANTITY_PER_ITEM),
      ...(note ? { note } : {})
    };
  }

  return nextCart;
}

export function serializeRemoteCartSnapshot(cart: RemoteCart): RemoteCartSnapshot {
  return {
    version: 1,
    lines: Object.values(normalizeRemoteCart(cart))
  };
}

export function restoreRemoteCartSnapshot(value: string | null, availableItemIds?: Iterable<string>): RemoteCart {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    if (Array.isArray(parsed)) {
      return normalizeRemoteCart(remoteCartFromLines(parsed), availableItemIds);
    }

    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.lines)) {
      return normalizeRemoteCart(remoteCartFromLines(record.lines), availableItemIds);
    }

    return normalizeRemoteCart(record as RemoteCart, availableItemIds);
  } catch {
    return {};
  }
}

export function buildRemoteCartFromOrderItems(items?: readonly ReorderableOrderItem[] | null): RemoteCart {
  const nextCart: RemoteCart = {};

  for (const item of items ?? []) {
    const itemId = item.menuItem?.id;
    if (!itemId || item.quantity <= 0) continue;

    nextCart[itemId] = {
      itemId,
      quantity: (nextCart[itemId]?.quantity ?? 0) + item.quantity,
      note: mergeRemoteNotes(nextCart[itemId]?.note, item.note ?? undefined)
    };
  }

  return normalizeRemoteCart(nextCart);
}
