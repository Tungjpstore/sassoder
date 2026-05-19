import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeModifierSelections,
  resolveModifierSelections,
  type PublicModifierGroup
} from "./modifier-pricing";

const groups: PublicModifierGroup[] = [
  {
    id: "size",
    name: "Size",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { id: "m", name: "M", priceDelta: 0 },
      { id: "l", name: "L", priceDelta: 7000 }
    ]
  },
  {
    id: "topping",
    name: "Topping",
    required: false,
    minSelect: 0,
    maxSelect: 3,
    options: [
      { id: "pearl", name: "Trân châu", priceDelta: 5000 },
      { id: "cheese", name: "Kem cheese", priceDelta: 9000 },
      { id: "pudding", name: "Pudding", priceDelta: 6000, isAvailable: false }
    ]
  }
];

test("normalizes duplicate modifier selections into a stable cart signature order", () => {
  const selections = normalizeModifierSelections([
    { groupId: "topping", optionId: "pearl", quantity: 1 },
    { groupId: "size", optionId: "l", quantity: 1 },
    { groupId: "topping", optionId: "pearl", quantity: 2 }
  ]);

  assert.deepEqual(selections, [
    { groupId: "size", optionId: "l", quantity: 1 },
    { groupId: "topping", optionId: "pearl", quantity: 3 }
  ]);
});

test("resolves modifier price deltas and signature for a valid Vietnamese drink order", () => {
  const result = resolveModifierSelections(groups, [
    { groupId: "size", optionId: "l" },
    { groupId: "topping", optionId: "pearl", quantity: 2 }
  ]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totalDelta, 17000);
  assert.equal(result.signature, "size:l:1|topping:pearl:2");
  assert.deepEqual(
    result.selections.map((selection) => selection.optionName),
    ["L", "Trân châu"]
  );
});

test("rejects missing required groups, over-selection and sold-out modifier options", () => {
  const missingSize = resolveModifierSelections(groups, [{ groupId: "topping", optionId: "pearl" }]);
  const tooManyToppings = resolveModifierSelections(groups, [
    { groupId: "size", optionId: "m" },
    { groupId: "topping", optionId: "pearl", quantity: 4 }
  ]);
  const soldOut = resolveModifierSelections(groups, [
    { groupId: "size", optionId: "m" },
    { groupId: "topping", optionId: "pudding" }
  ]);

  assert.equal(missingSize.ok, false);
  assert.match(missingSize.ok ? "" : missingSize.errors.join(" "), /Size cần chọn/);
  assert.equal(tooManyToppings.ok, false);
  assert.match(tooManyToppings.ok ? "" : tooManyToppings.errors.join(" "), /Topping chỉ được chọn tối đa 3/);
  assert.equal(soldOut.ok, false);
  assert.match(soldOut.ok ? "" : soldOut.errors.join(" "), /Pudding hiện tạm hết/);
});
