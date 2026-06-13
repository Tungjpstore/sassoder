"use client";

import * as React from "react";
import { Check, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton, SectionLabel } from "../ui/primitives";

export type FloorTable = {
  id: string;
  name: string;
  capacity: number;
  area: string | null;
  floorLabel: string | null;
  seatingZone: "indoor" | "outdoor" | "mixed" | null;
  tableKind: "standard" | "vip" | "bar" | "community";
  available: boolean;
  fitsParty: boolean;
  reason: "available" | "too_small" | "busy";
};

const kindLabel: Record<FloorTable["tableKind"], string> = {
  standard: "Tiêu chuẩn",
  vip: "VIP",
  bar: "Quầy bar",
  community: "Bàn chung"
};

function zoneOf(table: FloorTable) {
  if (table.area) return table.area;
  if (table.seatingZone === "outdoor") return "Ngoài trời";
  if (table.seatingZone === "mixed") return "Khu hỗn hợp";
  return "Trong nhà";
}

/* FloorMap — sơ đồ bàn cho khách, đồng bộ phong cách sơ đồ dashboard.
 * Nhóm theo khu vực, màu trạng thái, tap bàn trống để chọn. */
export function ReservationFloorMap({
  tables,
  loading,
  selectedTableId,
  onSelect,
  autoSelected,
  onAuto
}: {
  tables: FloorTable[];
  loading: boolean;
  selectedTableId: string | null;
  onSelect: (tableId: string) => void;
  autoSelected: boolean;
  onAuto: () => void;
}) {
  const groups = React.useMemo(() => {
    const map = new Map<string, FloorTable[]>();
    for (const t of tables) {
      const key = zoneOf(t);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [tables]);

  const availableCount = tables.filter((t) => t.available).length;

  return (
    <div className="grid gap-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[length:var(--fs-xs)] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--jade)]" /> Còn trống</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--surface-3)]" /> Đã có khách</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--warn-bg)] ring-1 ring-[var(--warn-fg)]/30" /> Không đủ chỗ</span>
      </div>

      {/* Auto-assign option */}
      <button
        type="button"
        onClick={onAuto}
        className={cn(
          "flex items-center justify-between gap-3 rounded-[var(--r-lg)] border px-4 py-3 text-left transition",
          autoSelected ? "border-[var(--jade)] bg-[var(--primary-soft)]" : "border-[var(--line)] bg-[var(--surface)]"
        )}
      >
        <span className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[var(--r-md)] bg-[var(--accent-soft)] text-[var(--orange-600)]"><Sparkles size={17} /></span>
          <span>
            <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--text)]">Để quán tự xếp bàn</span>
            <span className="block text-[length:var(--fs-xs)] text-[var(--text-muted)]">Hệ thống chọn bàn phù hợp nhất</span>
          </span>
        </span>
        <span className={cn("grid h-6 w-6 place-items-center rounded-full border", autoSelected ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line-strong)] text-transparent")}>
          <Check size={14} />
        </span>
      </button>

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] rounded-[var(--r-md)]" />
            ))}
          </div>
        </div>
      ) : tables.length === 0 ? (
        <p className="rounded-[var(--r-md)] bg-[var(--surface-2)] p-4 text-center text-[length:var(--fs-sm)] text-[var(--text-muted)]">
          Khung giờ này chưa có bàn nào để chọn. Bạn thử giờ khác hoặc để quán tự xếp.
        </p>
      ) : (
        <div className="grid gap-4 shop-stagger">
          {groups.map(([zone, zoneTables]) => (
            <section key={zone}>
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>{zone}</SectionLabel>
                <span className="text-[length:var(--fs-2xs)] text-[var(--text-faint)]">
                  {zoneTables.filter((t) => t.available).length}/{zoneTables.length} trống
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
                {zoneTables.map((t) => {
                  const selected = selectedTableId === t.id && !autoSelected;
                  const disabled = !t.available;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(t.id)}
                      aria-pressed={selected}
                      className={cn(
                        "relative flex flex-col gap-1 rounded-[var(--r-md)] border-2 px-3 py-2.5 text-left transition active:scale-[0.98]",
                        selected
                          ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)] shadow-[var(--sh-md)]"
                          : t.available
                            ? "border-[var(--jade)]/35 bg-[var(--surface)] text-[var(--text)] hover:border-[var(--jade)]"
                            : t.reason === "too_small"
                              ? "border-[var(--warn-fg)]/25 bg-[var(--warn-bg)] text-[var(--warn-fg)] opacity-80"
                              : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-faint)]"
                      )}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className={cn("shop-num text-[length:var(--fs-body)] font-bold leading-none", selected ? "text-[var(--on-jade)]" : "text-[var(--text)]")}>{t.name}</span>
                        {selected ? <Check size={15} /> : null}
                      </span>
                      <span className={cn("inline-flex items-center gap-1 text-[length:var(--fs-2xs)] font-semibold", selected ? "text-[var(--on-jade)]/90" : "text-[var(--text-muted)]")}>
                        <Users size={11} /> {t.capacity} chỗ
                        {t.tableKind !== "standard" ? ` · ${kindLabel[t.tableKind]}` : ""}
                      </span>
                      <span className={cn("text-[length:var(--fs-2xs)] font-semibold", selected ? "text-[var(--on-jade)]/80" : t.available ? "text-[var(--ok-fg)]" : t.reason === "too_small" ? "text-[var(--warn-fg)]" : "text-[var(--text-faint)]")}>
                        {t.available ? "Còn trống" : t.reason === "too_small" ? "Không đủ chỗ" : "Đã có khách"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {!loading && tables.length > 0 ? (
        <p className="text-center text-[length:var(--fs-xs)] text-[var(--text-muted)]">{availableCount} bàn còn trống cho khung giờ này</p>
      ) : null}
    </div>
  );
}
