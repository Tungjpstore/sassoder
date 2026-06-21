import type { PublicMenuModifierGroup } from "@/types";

export function buildModifierGroupCloneRow({
  restaurantId,
  targetItemId,
  group,
  groupIndex
}: {
  restaurantId: string;
  targetItemId: string;
  group: PublicMenuModifierGroup;
  groupIndex: number;
}) {
  return {
    restaurant_id: restaurantId,
    menu_item_id: targetItemId,
    name: group.name,
    kind: group.kind ?? "CUSTOM",
    selection_type: group.selectionType ?? (group.maxSelect === 1 ? "SINGLE" : "MULTIPLE"),
    allow_quantity: group.allowQuantity ?? false,
    is_required: group.required,
    min_select: group.minSelect,
    max_select: group.maxSelect,
    sort_order: (groupIndex + 1) * 10,
    is_active: true
  };
}

export function buildModifierOptionCloneRows({
  restaurantId,
  targetGroupId,
  options
}: {
  restaurantId: string;
  targetGroupId: string;
  options: PublicMenuModifierGroup["options"];
}) {
  return options.map((option, optionIndex) => ({
    restaurant_id: restaurantId,
    group_id: targetGroupId,
    name: option.name,
    price_delta: option.priceDelta,
    pricing_mode: option.pricingMode ?? "DELTA",
    price_value: option.priceValue ?? null,
    is_default: Boolean(option.isDefault),
    is_available: option.isAvailable ?? true,
    sort_order: (optionIndex + 1) * 10
  }));
}
