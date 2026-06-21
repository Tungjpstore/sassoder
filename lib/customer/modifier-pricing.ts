import type {
  PublicMenuModifierGroup as PublicModifierGroup,
  PublicMenuModifierOption as PublicModifierOption
} from "@/types";

export type { PublicModifierGroup, PublicModifierOption };

export type CustomerModifierSelection = {
  groupId: string;
  optionId: string;
  quantity?: number;
};

export type ModifierPricingContext = {
  basePrice?: number;
};

export type ResolvedModifierSelection = {
  groupId: string;
  groupName: string;
  kind?: PublicModifierGroup["kind"];
  optionId: string;
  optionName: string;
  pricingMode: NonNullable<PublicModifierOption["pricingMode"]>;
  priceValue: number | null;
  priceDelta: number;
  quantity: number;
  lineTotal: number;
};

export type ResolvedModifierOptionPricing = {
  pricingMode: NonNullable<PublicModifierOption["pricingMode"]>;
  priceValue: number | null;
  priceDelta: number;
};

export type ModifierResolution =
  | {
      ok: true;
      selections: ResolvedModifierSelection[];
      totalDelta: number;
      signature: string;
    }
  | {
      ok: false;
      errors: string[];
    };

const MAX_MODIFIER_QUANTITY = 50;

function normalizeQuantity(value: unknown) {
  const quantity = Math.floor(Number(value ?? 1));
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.min(quantity, MAX_MODIFIER_QUANTITY);
}

function normalizeGroupLimit(value: number | null | undefined, fallback: number) {
  if (value === null) return null;
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(0, Math.floor(Number(value)));
}

function groupMinimum(group: PublicModifierGroup) {
  if (typeof group.minSelect === "number") return normalizeGroupLimit(group.minSelect, 0) ?? 0;
  return group.required ? 1 : 0;
}

function groupMaximum(group: PublicModifierGroup) {
  if (group.selectionType === "SINGLE") return 1;
  return normalizeGroupLimit(group.maxSelect, Number.POSITIVE_INFINITY);
}

function selectionKey(selection: Pick<CustomerModifierSelection, "groupId" | "optionId">) {
  return `${selection.groupId}:${selection.optionId}`;
}

export function normalizeModifierSelections(selections: readonly CustomerModifierSelection[] = []) {
  const byKey = new Map<string, CustomerModifierSelection>();

  for (const selection of selections) {
    if (!selection.groupId || !selection.optionId) continue;
    const quantity = normalizeQuantity(selection.quantity);
    if (quantity <= 0) continue;

    const key = selectionKey(selection);
    const existing = byKey.get(key);
    byKey.set(key, {
      groupId: selection.groupId,
      optionId: selection.optionId,
      quantity: Math.min((existing?.quantity ?? 0) + quantity, MAX_MODIFIER_QUANTITY)
    });
  }

  return [...byKey.values()].sort((left, right) => selectionKey(left).localeCompare(selectionKey(right)));
}

function effectiveOptionDelta(option: PublicModifierOption, context: ModifierPricingContext) {
  const pricingMode = option.pricingMode ?? "DELTA";
  if (pricingMode !== "ABSOLUTE") return Math.round(option.priceDelta);

  const absolutePrice = Number(option.priceValue ?? Number.NaN);
  const basePrice = Number(context.basePrice ?? Number.NaN);
  if (!Number.isFinite(absolutePrice) || absolutePrice <= 0 || !Number.isFinite(basePrice) || basePrice <= 0) {
    return Math.round(option.priceDelta);
  }

  return Math.round(absolutePrice) - Math.round(basePrice);
}

export function resolveModifierOptionPricing(
  option: PublicModifierOption,
  context: ModifierPricingContext = {}
): ResolvedModifierOptionPricing {
  const pricingMode = option.pricingMode ?? "DELTA";
  const priceDelta = effectiveOptionDelta(option, context);
  if (pricingMode !== "ABSOLUTE") {
    return {
      pricingMode,
      priceValue: null,
      priceDelta
    };
  }

  const absolutePrice = Number(option.priceValue ?? Number.NaN);
  const basePrice = Number(context.basePrice ?? Number.NaN);
  const fallbackPrice = Number.isFinite(basePrice) && basePrice > 0 ? Math.round(basePrice) + priceDelta : null;

  return {
    pricingMode,
    priceValue: Number.isFinite(absolutePrice) && absolutePrice > 0 ? Math.round(absolutePrice) : fallbackPrice,
    priceDelta
  };
}

export function defaultModifierSelectionsForGroups(groups: readonly PublicModifierGroup[] = []): CustomerModifierSelection[] {
  return groups.flatMap((group) => {
    const minSelect = groupMinimum(group);
    if (minSelect <= 0) return [];

    const availableOptions = group.options.filter((option) => option.isAvailable !== false);
    const defaultOptions = availableOptions.filter((option) => option.isDefault);
    const pickedOptions = (defaultOptions.length > 0 ? defaultOptions : availableOptions).slice(0, minSelect);

    return pickedOptions.map((option) => ({ groupId: group.id, optionId: option.id, quantity: 1 }));
  });
}

export function resolveModifierSelections(
  groups: readonly PublicModifierGroup[] = [],
  selections: readonly CustomerModifierSelection[] = [],
  context: ModifierPricingContext = {}
): ModifierResolution {
  const errors: string[] = [];
  const normalizedSelections = normalizeModifierSelections(selections);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const selectedCountByGroup = new Map<string, number>();
  const resolved: ResolvedModifierSelection[] = [];

  for (const selection of normalizedSelections) {
    const group = groupById.get(selection.groupId);
    const option = group?.options.find((candidate) => candidate.id === selection.optionId);

    if (!group || !option) {
      errors.push("Tùy chọn món không hợp lệ hoặc đã được quán thay đổi.");
      continue;
    }
    if (option.isAvailable === false) {
      errors.push(`${option.name} hiện tạm hết.`);
      continue;
    }

    const quantity = normalizeQuantity(selection.quantity);
    const optionPricing = resolveModifierOptionPricing(option, context);
    selectedCountByGroup.set(group.id, (selectedCountByGroup.get(group.id) ?? 0) + quantity);
    resolved.push({
      groupId: group.id,
      groupName: group.name,
      kind: group.kind,
      optionId: option.id,
      optionName: option.name,
      pricingMode: optionPricing.pricingMode,
      priceValue: optionPricing.priceValue,
      priceDelta: optionPricing.priceDelta,
      quantity,
      lineTotal: optionPricing.priceDelta * quantity
    });
  }

  for (const group of groups) {
    const selectedCount = selectedCountByGroup.get(group.id) ?? 0;
    const minSelect = groupMinimum(group);
    const maxSelect = groupMaximum(group);

    if (selectedCount < minSelect) {
      errors.push(`${group.name} cần chọn ít nhất ${minSelect} tùy chọn.`);
    }
    if (maxSelect !== null && selectedCount > maxSelect) {
      errors.push(`${group.name} chỉ được chọn tối đa ${maxSelect} tùy chọn.`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  return {
    ok: true,
    selections: resolved,
    totalDelta: resolved.reduce((sum, selection) => sum + selection.lineTotal, 0),
    signature: resolved.map((selection) => `${selection.groupId}:${selection.optionId}:${selection.quantity}`).join("|")
  };
}
