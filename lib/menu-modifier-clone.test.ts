import assert from "node:assert/strict";
import test from "node:test";
import { buildModifierGroupCloneRow, buildModifierOptionCloneRows } from "./menu-modifier-clone";
import type { PublicMenuModifierGroup } from "@/types";

const sizeGroup: PublicMenuModifierGroup = {
  id: "source-size",
  name: "Size",
  kind: "SIZE",
  selectionType: "SINGLE",
  allowQuantity: false,
  required: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: "m", name: "M", priceDelta: 0, pricingMode: "ABSOLUTE", priceValue: 25000, isDefault: true },
    { id: "l", name: "L", priceDelta: 0, pricingMode: "ABSOLUTE", priceValue: 35000 }
  ]
};

test("buildModifierGroupCloneRow targets the new item while preserving selling rules", () => {
  assert.deepEqual(
    buildModifierGroupCloneRow({
      restaurantId: "restaurant-1",
      targetItemId: "target-drink",
      group: sizeGroup,
      groupIndex: 1
    }),
    {
      restaurant_id: "restaurant-1",
      menu_item_id: "target-drink",
      name: "Size",
      kind: "SIZE",
      selection_type: "SINGLE",
      allow_quantity: false,
      is_required: true,
      min_select: 1,
      max_select: 1,
      sort_order: 20,
      is_active: true
    }
  );
});

test("buildModifierOptionCloneRows preserves absolute size prices and defaults", () => {
  assert.deepEqual(buildModifierOptionCloneRows({ restaurantId: "restaurant-1", targetGroupId: "new-size", options: sizeGroup.options }), [
    {
      restaurant_id: "restaurant-1",
      group_id: "new-size",
      name: "M",
      price_delta: 0,
      pricing_mode: "ABSOLUTE",
      price_value: 25000,
      is_default: true,
      is_available: true,
      sort_order: 10
    },
    {
      restaurant_id: "restaurant-1",
      group_id: "new-size",
      name: "L",
      price_delta: 0,
      pricing_mode: "ABSOLUTE",
      price_value: 35000,
      is_default: false,
      is_available: true,
      sort_order: 20
    }
  ]);
});

test("buildModifierOptionCloneRows keeps quantity topping metadata practical for copied drink menus", () => {
  const toppingGroup: PublicMenuModifierGroup = {
    id: "source-topping",
    name: "Topping",
    kind: "TOPPING",
    selectionType: "QUANTITY",
    allowQuantity: true,
    required: false,
    minSelect: 0,
    maxSelect: 5,
    options: [
      { id: "pearl", name: "Trân châu đen", priceDelta: 10000 },
      { id: "cheese", name: "Kem cheese", priceDelta: 15000, isAvailable: false }
    ]
  };

  const groupRow = buildModifierGroupCloneRow({
    restaurantId: "restaurant-1",
    targetItemId: "target-drink",
    group: toppingGroup,
    groupIndex: 0
  });
  const optionRows = buildModifierOptionCloneRows({ restaurantId: "restaurant-1", targetGroupId: "new-topping", options: toppingGroup.options });

  assert.equal(groupRow.selection_type, "QUANTITY");
  assert.equal(groupRow.allow_quantity, true);
  assert.equal(optionRows[0]?.pricing_mode, "DELTA");
  assert.equal(optionRows[1]?.is_available, false);
});
