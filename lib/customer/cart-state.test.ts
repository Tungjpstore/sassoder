import assert from "node:assert/strict";
import test from "node:test";
import {
  addDineInCartItem,
  buildRemoteCartFromOrderItems,
  decrementDineInCartItem,
  removeDineInCartItem,
  setDineInCartItemNote,
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
    pho: { itemId: "pho", quantity: 1 }
  };

  const incremented = updateRemoteCartQuantity(initial, "pho", 2);
  const removed = updateRemoteCartQuantity(incremented, "pho", -3);

  assert.equal(incremented.pho.quantity, 3);
  assert.deepEqual(removed, {});
  assert.equal(initial.pho.quantity, 1);
});

test("remote reorder cart merges duplicate order items and skips invalid rows", () => {
  const cart = buildRemoteCartFromOrderItems([
    { quantity: 1, menuItem: { id: "combo" } },
    { quantity: 2, menuItem: { id: "combo" } },
    { quantity: 3, menuItem: null },
    { quantity: 0, menuItem: { id: "tea" } }
  ]);

  assert.deepEqual(cart, {
    combo: { itemId: "combo", quantity: 3 }
  });
});
