"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVnd } from "@/lib/money";
import {
  resolveModifierOptionPricing,
  resolveModifierSelections,
  type CustomerModifierSelection,
  type PublicModifierGroup
} from "@/lib/customer/modifier-pricing";
import type { PublicMenuItem } from "@/types";
import { BottomSheet } from "../ui/sheet";
import { ShopButton } from "../ui/button";
import { QtyStepper, SectionLabel } from "../ui/primitives";

export type CustomizingItem = {
  item: PublicMenuItem;
  selections: CustomerModifierSelection[];
  quantity: number;
  note: string;
};

function minSelect(group: PublicModifierGroup) {
  return typeof group.minSelect === "number" ? group.minSelect : group.required ? 1 : 0;
}
function maxSelect(group: PublicModifierGroup) {
  if (group.selectionType === "SINGLE") return 1;
  return group.maxSelect ?? Number.POSITIVE_INFINITY;
}

function shouldUseOptionQuantity(group: PublicModifierGroup) {
  return group.selectionType === "QUANTITY" || group.allowQuantity === true;
}

function optionPriceText(itemPrice: number, option: PublicModifierGroup["options"][number]) {
  const pricing = resolveModifierOptionPricing(option, { basePrice: itemPrice });
  if (pricing.pricingMode === "ABSOLUTE") {
    return pricing.priceValue ? `Giá ${formatVnd(pricing.priceValue)}` : "Theo giá món";
  }
  return pricing.priceDelta > 0 ? `+${formatVnd(pricing.priceDelta)}` : "Không thêm phí";
}

/* ModifierSheet — tùy chọn món (size, topping, ghi chú) trước khi thêm vào giỏ. */
export function ModifierSheet({
  state,
  onChange,
  onClose,
  onConfirm
}: {
  state: CustomizingItem | null;
  onChange: (next: CustomizingItem | null) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const open = Boolean(state);
  const item = state?.item;
  const groups = React.useMemo(() => item?.modifierGroups ?? [], [item]);
  const resolution = React.useMemo(
    () => (state ? resolveModifierSelections(groups, state.selections, { basePrice: state.item.price }) : null),
    [groups, state]
  );
  const unitPrice = (item?.price ?? 0) + (resolution?.ok ? resolution.totalDelta : 0);
  const totalPrice = unitPrice * (state?.quantity ?? 1);

  function toggleOption(group: PublicModifierGroup, optionId: string) {
    if (!state) return;
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (!option || option.isAvailable === false) return;

    const outside = state.selections.filter((s) => s.groupId !== group.id);
    const groupSelections = state.selections.filter((s) => s.groupId === group.id);
    const selected = groupSelections.some((s) => s.optionId === optionId);
    const limit = maxSelect(group);

    if (selected) {
      onChange({ ...state, selections: [...outside, ...groupSelections.filter((s) => s.optionId !== optionId)] });
      return;
    }
    if (limit <= 1) {
      onChange({ ...state, selections: [...outside, { groupId: group.id, optionId, quantity: 1 }] });
      return;
    }
    if (groupSelections.length >= limit) return;
    onChange({ ...state, selections: [...state.selections, { groupId: group.id, optionId, quantity: 1 }] });
  }

  function changeOptionQuantity(group: PublicModifierGroup, optionId: string, nextQuantity: number) {
    if (!state) return;
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (!option || option.isAvailable === false) return;

    const quantity = Math.max(0, Math.min(50, Math.floor(nextQuantity)));
    const outside = state.selections.filter((s) => !(s.groupId === group.id && s.optionId === optionId));
    const groupQuantity = state.selections
      .filter((s) => s.groupId === group.id && s.optionId !== optionId)
      .reduce((sum, selection) => sum + (selection.quantity ?? 1), 0);
    const limit = maxSelect(group);
    const cappedQuantity = Number.isFinite(limit) ? Math.min(quantity, Math.max(0, limit - groupQuantity)) : quantity;

    if (cappedQuantity <= 0) {
      onChange({ ...state, selections: outside });
      return;
    }
    onChange({ ...state, selections: [...outside, { groupId: group.id, optionId, quantity: cappedQuantity }] });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      size="tall"
      title={item?.name}
      description={item ? `${formatVnd(unitPrice)} / phần` : undefined}
      footer={
        state ? (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <QtyStepper
                value={state.quantity}
                min={1}
                max={50}
                onChange={(q) => onChange({ ...state, quantity: q })}
                ariaLabel="Số phần"
              />
              <span className="shop-num text-[length:var(--fs-h2)] font-bold text-[var(--text)]">{formatVnd(totalPrice)}</span>
            </div>
            <ShopButton size="lg" fullWidth onClick={onConfirm} disabled={!resolution?.ok}>
              Thêm vào giỏ
            </ShopButton>
          </div>
        ) : null
      }
    >
      {state ? (
        <div className="grid gap-5">
          {groups.map((group) => {
            const groupSelections = state.selections.filter((s) => s.groupId === group.id);
            const min = minSelect(group);
            const max = maxSelect(group);
            const usesQuantity = shouldUseOptionQuantity(group);
            return (
              <section key={group.id} className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">{group.name}</h3>
                    <SectionLabel className="mt-0.5 normal-case tracking-normal">
                      {min > 0 ? `Bắt buộc chọn ${min}` : "Không bắt buộc"}
                      {Number.isFinite(max) ? ` · tối đa ${max}` : ""}
                    </SectionLabel>
                  </div>
                  {min > 0 ? (
                    <span className="rounded-[var(--r-pill)] bg-[var(--primary-soft)] px-2.5 py-1 text-[length:var(--fs-2xs)] font-bold text-[var(--jade)]">
                      Bắt buộc
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  {group.options.map((option) => {
                    const selectedSelection = groupSelections.find((s) => s.optionId === option.id);
                    const selected = Boolean(selectedSelection);
                    const optionQuantity = selectedSelection?.quantity ?? 0;
                    const disabled = option.isAvailable === false;
                    const priceText = optionPriceText(state.item.price, option);
                    if (usesQuantity) {
                      return (
                        <div
                          key={option.id}
                          className={cn(
                            "flex min-h-[var(--tap-min)] items-center justify-between gap-3 rounded-[var(--r-md)] border px-3 py-2.5 text-left transition",
                            selected ? "border-[var(--jade)] bg-[var(--primary-soft)]" : "border-[var(--line)] bg-[var(--surface)]",
                            disabled && "opacity-55"
                          )}
                        >
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => changeOptionQuantity(group, option.id, optionQuantity > 0 ? 0 : 1)}
                            className="min-w-0 flex-1 text-left disabled:pointer-events-none"
                          >
                            <span className="block truncate text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{option.name}</span>
                            <span className="mt-0.5 block text-[length:var(--fs-xs)] text-[var(--text-muted)]">
                              {disabled ? "Tạm hết" : priceText}
                            </span>
                          </button>
                          <QtyStepper
                            size="sm"
                            value={optionQuantity}
                            min={0}
                            max={Number.isFinite(max) ? max : 50}
                            onChange={(next) => changeOptionQuantity(group, option.id, next)}
                            ariaLabel={`Số lượng ${option.name}`}
                          />
                        </div>
                      );
                    }
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleOption(group, option.id)}
                        className={cn(
                          "flex min-h-[var(--tap-min)] items-center justify-between gap-3 rounded-[var(--r-md)] border px-3 py-2.5 text-left transition",
                          selected
                            ? "border-[var(--jade)] bg-[var(--primary-soft)]"
                            : "border-[var(--line)] bg-[var(--surface)]",
                          disabled && "opacity-55"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{option.name}</span>
                          <span className="mt-0.5 block text-[length:var(--fs-xs)] text-[var(--text-muted)]">
                            {disabled ? "Tạm hết" : priceText}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                            selected ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line-strong)] text-transparent"
                          )}
                        >
                          <Check size={14} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <label className="grid gap-1.5">
            <SectionLabel>Ghi chú riêng cho món</SectionLabel>
            <input
              value={state.note}
              onChange={(e) => onChange({ ...state, note: e.target.value })}
              maxLength={200}
              placeholder="Ví dụ: ít đá, bỏ hành..."
              className="h-11 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]"
            />
          </label>

          {resolution && !resolution.ok ? (
            <p className="rounded-[var(--r-md)] bg-[var(--warn-bg)] px-4 py-3 text-[length:var(--fs-xs)] font-semibold text-[var(--warn-fg)]">
              {resolution.errors[0]}
            </p>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}
