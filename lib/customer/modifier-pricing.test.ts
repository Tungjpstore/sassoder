import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultModifierSelectionsForGroups,
  normalizeModifierSelections,
  resolveModifierOptionPricing,
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

test("supports size as absolute item price against the menu base price", () => {
  const sizeGroups: PublicModifierGroup[] = [
    {
      id: "size",
      name: "Size",
      kind: "SIZE",
      selectionType: "SINGLE",
      required: true,
      minSelect: 1,
      maxSelect: null,
      options: [
        { id: "m", name: "M", priceDelta: 0, pricingMode: "ABSOLUTE", priceValue: 25000 },
        { id: "l", name: "L", priceDelta: 0, pricingMode: "ABSOLUTE", priceValue: 35000 }
      ]
    }
  ];

  const result = resolveModifierSelections(sizeGroups, [{ groupId: "size", optionId: "l" }], { basePrice: 25000 });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totalDelta, 10000);
  assert.equal(result.selections[0]?.pricingMode, "ABSOLUTE");
  assert.equal(result.selections[0]?.priceValue, 35000);
});

test("resolves modifier option pricing metadata for customer price labels", () => {
  assert.deepEqual(
    resolveModifierOptionPricing({ id: "l", name: "L", priceDelta: 0, pricingMode: "ABSOLUTE", priceValue: 35000 }, { basePrice: 25000 }),
    {
      pricingMode: "ABSOLUTE",
      priceValue: 35000,
      priceDelta: 10000
    }
  );

  assert.deepEqual(resolveModifierOptionPricing({ id: "pearl", name: "Trân châu", priceDelta: 10000 }, { basePrice: 25000 }), {
    pricingMode: "DELTA",
    priceValue: null,
    priceDelta: 10000
  });
});

test("prefills required defaults and treats single selection type as max one", () => {
  const drinkGroups: PublicModifierGroup[] = [
    {
      id: "sugar",
      name: "Đường",
      kind: "SUGAR",
      selectionType: "SINGLE",
      required: true,
      minSelect: 1,
      maxSelect: null,
      options: [
        { id: "normal", name: "100%", priceDelta: 0 },
        { id: "less", name: "50%", priceDelta: 0, isDefault: true }
      ]
    }
  ];

  assert.deepEqual(defaultModifierSelectionsForGroups(drinkGroups), [
    { groupId: "sugar", optionId: "less", quantity: 1 }
  ]);

  const tooMany = resolveModifierSelections(drinkGroups, [
    { groupId: "sugar", optionId: "normal" },
    { groupId: "sugar", optionId: "less" }
  ]);

  assert.equal(tooMany.ok, false);
  assert.match(tooMany.ok ? "" : tooMany.errors.join(" "), /Đường chỉ được chọn tối đa 1/);
});

test("counts quantity selections against group limits and line totals", () => {
  const toppingGroups: PublicModifierGroup[] = [
    {
      id: "topping",
      name: "Topping",
      kind: "TOPPING",
      selectionType: "QUANTITY",
      allowQuantity: true,
      required: false,
      minSelect: 0,
      maxSelect: 5,
      options: [
        { id: "pearl", name: "Trân châu", priceDelta: 10000 },
        { id: "cheese", name: "Kem cheese", priceDelta: 15000 }
      ]
    }
  ];

  const valid = resolveModifierSelections(toppingGroups, [
    { groupId: "topping", optionId: "pearl", quantity: 2 },
    { groupId: "topping", optionId: "cheese", quantity: 1 }
  ]);
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  assert.equal(valid.totalDelta, 35000);
  assert.equal(valid.signature, "topping:cheese:1|topping:pearl:2");

  const tooMany = resolveModifierSelections(toppingGroups, [
    { groupId: "topping", optionId: "pearl", quantity: 6 }
  ]);
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.ok ? "" : tooMany.errors.join(" "), /Topping chỉ được chọn tối đa 5/);
});
