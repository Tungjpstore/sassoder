import assert from "node:assert/strict";
import test from "node:test";
import {
  addDineInCartItem,
  addRemoteCartLine,
  buildRemoteCartFromOrderItems,
  decrementDineInCartItem,
  normalizeRemoteCart,
  removeDineInCartItem,
  restoreRemoteCartSnapshot,
  serializeRemoteCartSnapshot,
  setDineInCartItemNote,
  setRemoteCartItemNote,
  updateRemoteCartQuantity,
  type DineInCartItems,
  type RemoteCart
} from "./cart-state";

test("dine-in cart increments quantity and preserves an existing item note", () => {
  const initial: DineInCartItems = {
    coffee: {
      menuItemId: "coffee",
      name: "Bạc xỉu",
      price: 35000,
      quantity: 1,
      note: "ít đá"
    }
  };

  const next = addDineInCartItem(initial, {
    menuItemId: "coffee",
    name: "Bạc xỉu",
    price: 35000,
    image: null
  });

  assert.equal(next.coffee.quantity, 2);
  assert.equal(next.coffee.note, "ít đá");
  assert.equal(initial.coffee.quantity, 1);
});

test("dine-in cart keeps modifier variants as separate cart lines", () => {
  const cart = addDineInCartItem(
    addDineInCartItem({}, {
      menuItemId: "milk-tea",
      name: "Trà sữa",
      price: 39000,
      modifiers: [{ groupId: "size", optionId: "m" }],
      modifierSummary: "Size M"
    }),
    {
      menuItemId: "milk-tea",
      name: "Trà sữa",
      price: 49000,
      modifiers: [{ groupId: "size", optionId: "l" }],
      modifierSummary: "Size L"
    }
  );

  assert.equal(Object.keys(cart).length, 2);
  assert.equal(cart["milk-tea::size:m:1"].quantity, 1);
  assert.equal(cart["milk-tea::size:l:1"].price, 49000);
  assert.equal(cart["milk-tea::size:l:1"].modifierSummary, "Size L");
});

test("dine-in cart removes items when quantity reaches zero", () => {
  const initial: DineInCartItems = {
    tea: {
      menuItemId: "tea",
      name: "Trà đào",
      price: 45000,
      quantity: 1
    }
  };

  assert.deepEqual(decrementDineInCartItem(initial, "tea"), {});
  assert.equal(removeDineInCartItem(initial, "missing"), initial);
});

test("dine-in cart updates notes without mutating existing state", () => {
  const initial: DineInCartItems = {
    banhmi: {
      menuItemId: "banhmi",
      name: "Bánh mì",
      price: 25000,
      quantity: 2
    }
  };

  const next = setDineInCartItemNote(initial, "banhmi", "không ớt");

  assert.equal(next.banhmi.note, "không ớt");
  assert.equal(initial.banhmi.note, undefined);
});

test("remote cart quantity updates are immutable and remove zero quantities", () => {
  const initial: RemoteCart = {
    pho: { itemId: "pho", quantity: 1, note: "ít hành" }
  };

  const incremented = updateRemoteCartQuantity(initial, "pho", 2);
  const removed = updateRemoteCartQuantity(incremented, "pho", -3);

  assert.equal(incremented.pho.quantity, 3);
  assert.equal(incremented.pho.note, "ít hành");
  assert.deepEqual(removed, {});
  assert.equal(initial.pho.quantity, 1);
});

test("remote cart quantity is capped for a single menu item", () => {
  const next = updateRemoteCartQuantity({}, "milk-tea", 80);

  assert.equal(next["milk-tea"].quantity, 50);
});

test("remote cart keeps customized modifier variants as separate lines", () => {
  const cart = addRemoteCartLine(
    addRemoteCartLine({}, {
      itemId: "milk-tea",
      modifiers: [{ groupId: "size", optionId: "m" }]
    }),
    {
      itemId: "milk-tea",
      modifiers: [{ groupId: "size", optionId: "l" }],
      note: "ít đá"
    }
  );

  assert.equal(Object.keys(cart).length, 2);
  assert.equal(cart["milk-tea::size:m:1"].quantity, 1);
  assert.equal(cart["milk-tea::size:l:1"].note, "ít đá");
});

test("remote cart snapshots restore only available menu items", () => {
  const snapshot = JSON.stringify({
    version: 1,
    lines: [
      { itemId: "coffee", quantity: 2, note: "ít đá" },
      { itemId: "coffee", quantity: 3, note: "không đường" },
      { itemId: "sold-out", quantity: 1 },
      { itemId: "tea", quantity: 99 }
    ]
  });

  assert.deepEqual(restoreRemoteCartSnapshot(snapshot, ["coffee", "tea"]), {
    coffee: { itemId: "coffee", quantity: 5, note: "ít đá; không đường" },
    tea: { itemId: "tea", quantity: 50 }
  });
});

test("remote cart snapshots restore customized variants without merging into the base item", () => {
  const snapshot = JSON.stringify({
    version: 1,
    lines: [
      { itemId: "tea", quantity: 1, modifiers: [{ groupId: "size", optionId: "m" }] },
      { itemId: "tea", quantity: 2, modifiers: [{ groupId: "size", optionId: "l" }] }
    ]
  });

  assert.deepEqual(restoreRemoteCartSnapshot(snapshot, ["tea"]), {
    "tea::size:m:1": {
      itemId: "tea",
      quantity: 1,
      modifiers: [{ groupId: "size", optionId: "m", quantity: 1 }],
      modifierSignature: "size:m:1"
    },
    "tea::size:l:1": {
      itemId: "tea",
      quantity: 2,
      modifiers: [{ groupId: "size", optionId: "l", quantity: 1 }],
      modifierSignature: "size:l:1"
    }
  });
});

test("remote cart item notes are normalized and cleared immutably", () => {
  const initial: RemoteCart = {
    pho: { itemId: "pho", quantity: 1 }
  };

  const noted = setRemoteCartItemNote(initial, "pho", "  không hành  ");
  const cleared = setRemoteCartItemNote(noted, "pho", "");

  assert.equal(noted.pho.note, "không hành");
  assert.equal(cleared.pho.note, undefined);
  assert.equal(initial.pho.note, undefined);
  assert.equal(setRemoteCartItemNote(initial, "missing", "note"), initial);
});

test("remote cart normalization drops broken persisted rows", () => {
  const cart = {
    coffee: { itemId: "coffee", quantity: 1 },
    bad: { itemId: "bad", quantity: -2 },
    missing: null
  } as unknown as RemoteCart;

  assert.deepEqual(normalizeRemoteCart(cart, ["coffee", "bad"]), {
    coffee: { itemId: "coffee", quantity: 1 }
  });
});

test("remote cart snapshots serialize normalized lines", () => {
  const snapshot = serializeRemoteCartSnapshot({
    coffee: { itemId: "coffee", quantity: 2, note: "ít đá" },
    tea: { itemId: "tea", quantity: 0 }
  });

  assert.deepEqual(snapshot, {
    version: 1,
    lines: [{ itemId: "coffee", quantity: 2, note: "ít đá" }]
  });
});

test("remote reorder cart merges duplicate order items and skips invalid rows", () => {
  const cart = buildRemoteCartFromOrderItems([
    { quantity: 1, menuItem: { id: "combo" } },
    { quantity: 2, note: "ít đá", menuItem: { id: "combo" } },
    { quantity: 3, menuItem: null },
    { quantity: 0, menuItem: { id: "tea" } }
  ]);

  assert.deepEqual(cart, {
    combo: { itemId: "combo", quantity: 3, note: "ít đá" }
  });
});

test("remote reorder cart restores modifier variants as separate lines", () => {
  const cart = buildRemoteCartFromOrderItems([
    {
      quantity: 1,
      note: "Size: L | Ghi chú: ít đá",
      modifiers: [{ groupId: "size", optionId: "l", quantity: 1 }],
      menuItem: { id: "milk-tea" }
    },
    {
      quantity: 2,
      note: "Size: M",
      modifiers: [{ groupId: "size", optionId: "m", quantity: 1 }],
      menuItem: { id: "milk-tea" }
    }
  ]);

  assert.deepEqual(cart, {
    "milk-tea::size:l:1": {
      itemId: "milk-tea",
      quantity: 1,
      note: "ít đá",
      modifiers: [{ groupId: "size", optionId: "l", quantity: 1 }],
      modifierSignature: "size:l:1"
    },
    "milk-tea::size:m:1": {
      itemId: "milk-tea",
      quantity: 2,
      modifiers: [{ groupId: "size", optionId: "m", quantity: 1 }],
      modifierSignature: "size:m:1"
    }
  });
});
