import {
  normalizeModifierSelections,
  type CustomerModifierSelection
} from "@/lib/customer/modifier-pricing";

export type DineInCartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string | null;
  note?: string;
  modifiers?: CustomerModifierSelection[];
  modifierSignature?: string;
  modifierSummary?: string;
};

export type DineInCartItems = Record<string, DineInCartItem>;

export type RemoteCartLine = {
  itemId: string;
  quantity: number;
  note?: string;
  modifiers?: CustomerModifierSelection[];
  modifierSignature?: string;
};

export type RemoteCart = Record<string, RemoteCartLine>;

export type RemoteCartSnapshot = {
  version: 1;
  lines: RemoteCartLine[];
};

type ReorderableOrderItem = {
  quantity: number;
  note?: string | null;
  modifiers?: readonly CustomerModifierSelection[] | null;
  modifierSummary?: string | null;
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

function reorderNote(note: string | null | undefined, hasModifiers: boolean) {
  const normalized = normalizeRemoteNote(note);
  if (!normalized || !hasModifiers) return normalized;

  const marker = "Ghi chú:";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex >= 0) return normalizeRemoteNote(normalized.slice(markerIndex + marker.length));
  return undefined;
}

function modifierSignature(modifiers?: readonly CustomerModifierSelection[]) {
  return normalizeModifierSelections(modifiers).map((selection) => `${selection.groupId}:${selection.optionId}:${selection.quantity ?? 1}`).join("|");
}

function remoteCartLineKey(itemId: string, modifiers?: readonly CustomerModifierSelection[]) {
  const signature = modifierSignature(modifiers);
  return signature ? `${itemId}::${signature}` : itemId;
}

function normalizeRemoteLine(itemId: string, quantity: unknown, note: unknown, modifiers: unknown): RemoteCartLine | null {
  const nextQuantity = normalizeRemoteQuantity(quantity);
  if (nextQuantity <= 0) return null;
  const normalizedModifiers = Array.isArray(modifiers)
    ? normalizeModifierSelections(modifiers as CustomerModifierSelection[])
    : [];
  const signature = modifierSignature(normalizedModifiers);
  const normalizedNote = normalizeRemoteNote(note);

  return {
    itemId,
    quantity: nextQuantity,
    ...(normalizedNote ? { note: normalizedNote } : {}),
    ...(normalizedModifiers.length > 0 ? { modifiers: normalizedModifiers, modifierSignature: signature } : {})
  };
}

function remoteCartFromLines(lines: unknown[]) {
  const cart: RemoteCart = {};
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) continue;
    const record = line as Partial<RemoteCartLine>;
    if (typeof record.itemId !== "string") continue;
    const normalized = normalizeRemoteLine(record.itemId, record.quantity, record.note, record.modifiers);
    if (!normalized) continue;
    const key = remoteCartLineKey(normalized.itemId, normalized.modifiers);
    const note = mergeRemoteNotes(cart[key]?.note, normalized.note);
    cart[key] = {
      ...normalized,
      quantity: Math.min((cart[key]?.quantity ?? 0) + normalized.quantity, REMOTE_CART_MAX_QUANTITY_PER_ITEM),
      ...(note ? { note } : {})
    };
  }
  return cart;
}

export function addDineInCartItem(items: DineInCartItems, item: Omit<DineInCartItem, "quantity">): DineInCartItems {
  const normalizedModifiers = normalizeModifierSelections(item.modifiers);
  const lineId = remoteCartLineKey(item.menuItemId, normalizedModifiers);
  const current = items[lineId];
  const note = mergeRemoteNotes(current?.note, item.note);
  const modifierSignatureValue = modifierSignature(normalizedModifiers);

  return {
    ...items,
    [lineId]: {
      ...item,
      ...(note ? { note } : {}),
      ...(normalizedModifiers.length > 0 ? { modifiers: normalizedModifiers, modifierSignature: modifierSignatureValue } : {}),
      quantity: (current?.quantity ?? 0) + 1,
      modifierSummary: item.modifierSummary ?? current?.modifierSummary
    }
  };
}

export function decrementDineInCartItem(items: DineInCartItems, lineId: string): DineInCartItems {
  const current = items[lineId];
  if (!current) return items;

  const next = { ...items };
  if (current.quantity <= 1) {
    delete next[lineId];
    return next;
  }

  next[lineId] = { ...current, quantity: current.quantity - 1 };
  return next;
}

export function removeDineInCartItem(items: DineInCartItems, lineId: string): DineInCartItems {
  if (!items[lineId]) return items;

  const next = { ...items };
  delete next[lineId];
  return next;
}

export function setDineInCartItemNote(items: DineInCartItems, lineId: string, note: string): DineInCartItems {
  const current = items[lineId];
  const normalizedNote = normalizeRemoteNote(note);
  if (!current || (current.note ?? "") === (normalizedNote ?? "")) return items;

  return {
    ...items,
    [lineId]: { ...current, ...(normalizedNote ? { note: normalizedNote } : { note: undefined }) }
  };
}

export function updateRemoteCartQuantity(cart: RemoteCart, lineId: string, delta: number): RemoteCart {
  const currentLine = cart[lineId];
  const nextQuantity = Math.min(REMOTE_CART_MAX_QUANTITY_PER_ITEM, Math.max(0, (currentLine?.quantity ?? 0) + delta));

  if (nextQuantity === 0) {
    if (!currentLine) return cart;
    const next = { ...cart };
    delete next[lineId];
    return next;
  }

  const itemId = currentLine?.itemId ?? lineId;
  return {
    ...cart,
    [lineId]: {
      itemId,
      quantity: nextQuantity,
      ...(currentLine?.note ? { note: currentLine.note } : {}),
      ...(currentLine?.modifiers?.length ? { modifiers: currentLine.modifiers, modifierSignature: currentLine.modifierSignature } : {})
    }
  };
}

export function addRemoteCartLine(
  cart: RemoteCart,
  input: {
    itemId: string;
    quantity?: number;
    note?: string;
    modifiers?: CustomerModifierSelection[];
  }
): RemoteCart {
  const normalized = normalizeRemoteLine(input.itemId, input.quantity ?? 1, input.note, input.modifiers);
  if (!normalized) return cart;
  const key = remoteCartLineKey(normalized.itemId, normalized.modifiers);
  const existing = cart[key];
  const note = mergeRemoteNotes(existing?.note, normalized.note);

  return {
    ...cart,
    [key]: {
      ...normalized,
      quantity: Math.min((existing?.quantity ?? 0) + normalized.quantity, REMOTE_CART_MAX_QUANTITY_PER_ITEM),
      ...(note ? { note } : {})
    }
  };
}

export function setRemoteCartItemNote(cart: RemoteCart, lineId: string, note: string): RemoteCart {
  const currentLine = cart[lineId];
  if (!currentLine) return cart;

  const normalizedNote = normalizeRemoteNote(note);
  if ((currentLine.note ?? "") === (normalizedNote ?? "")) return cart;

  return {
    ...cart,
    [lineId]: {
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

    const normalized = normalizeRemoteLine(itemId, line.quantity, line.note, line.modifiers);
    if (!normalized) continue;
    const key = remoteCartLineKey(normalized.itemId, normalized.modifiers);
    const note = mergeRemoteNotes(nextCart[key]?.note, normalized.note);

    nextCart[key] = {
      ...normalized,
      quantity: Math.min((nextCart[key]?.quantity ?? 0) + normalized.quantity, REMOTE_CART_MAX_QUANTITY_PER_ITEM),
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
    const modifiers = normalizeModifierSelections(item.modifiers ?? []);
    const key = remoteCartLineKey(itemId, modifiers);
    const note = mergeRemoteNotes(nextCart[key]?.note, reorderNote(item.note, modifiers.length > 0));

    nextCart[key] = {
      itemId,
      quantity: Math.min((nextCart[key]?.quantity ?? 0) + item.quantity, REMOTE_CART_MAX_QUANTITY_PER_ITEM),
      ...(note ? { note } : {}),
      ...(modifiers.length > 0 ? { modifiers, modifierSignature: modifierSignature(modifiers) } : {})
    };
  }

  return normalizeRemoteCart(nextCart);
}
