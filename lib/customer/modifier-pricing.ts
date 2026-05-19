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

export type ResolvedModifierSelection = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
  quantity: number;
  lineTotal: number;
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

export function resolveModifierSelections(
  groups: readonly PublicModifierGroup[] = [],
  selections: readonly CustomerModifierSelection[] = []
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
    selectedCountByGroup.set(group.id, (selectedCountByGroup.get(group.id) ?? 0) + quantity);
    resolved.push({
      groupId: group.id,
      groupName: group.name,
      optionId: option.id,
      optionName: option.name,
      priceDelta: Math.round(option.priceDelta),
      quantity,
      lineTotal: Math.round(option.priceDelta) * quantity
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
