"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";

type ProvinceOption = {
  code: string;
  name: string;
  wardCount: number;
};

type WardOption = {
  code: string;
  name: string;
  provinceCode: string;
};

type VietnamAdminSelectorProps = {
  className?: string;
  compact?: boolean;
  onAddressHintChange: (value: string) => void;
};

export function VietnamAdminSelector({
  className,
  compact = false,
  onAddressHintChange
}: VietnamAdminSelectorProps) {
  const [source, setSource] = useState<string | null>(null);
  const [provinces, setProvinces] = useState<ProvinceOption[]>([]);
  const [wards, setWards] = useState<WardOption[]>([]);
  const [provinceCode, setProvinceCode] = useState("");
  const [wardCode, setWardCode] = useState("");
  const [wardQuery, setWardQuery] = useState("");
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingWards, setLoadingWards] = useState(false);

  const selectedProvince = useMemo(
    () => provinces.find((province) => province.code === provinceCode) ?? null,
    [provinceCode, provinces]
  );
  const selectedWard = useMemo(() => wards.find((ward) => ward.code === wardCode) ?? null, [wardCode, wards]);

  useEffect(() => {
    let disposed = false;

    async function loadProvinces() {
      setLoadingProvinces(true);
      try {
        const response = await fetch("/api/location/vietnam-admin", { cache: "no-store" });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không tải được địa giới.");
        if (disposed) return;
        setProvinces(json.data.provinces as ProvinceOption[]);
        setSource(json.data.source as string);
      } catch {
        if (!disposed) setProvinces([]);
      } finally {
        if (!disposed) setLoadingProvinces(false);
      }
    }

    void loadProvinces();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!provinceCode) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingWards(true);
      try {
        const params = new URLSearchParams({
          provinceCode,
          limit: "160"
        });
        if (wardQuery.trim()) params.set("q", wardQuery.trim());
        const response = await fetch(`/api/location/vietnam-admin?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không tải được xã/phường.");
        setWards(json.data.wards as WardOption[]);
        setWardCode((current) => (current && (json.data.wards as WardOption[]).some((ward) => ward.code === current) ? current : ""));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setWards([]);
      } finally {
        if (!controller.signal.aborted) setLoadingWards(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [provinceCode, wardQuery]);

  useEffect(() => {
    onAddressHintChange([selectedWard?.name, selectedProvince?.name].filter(Boolean).join(", "));
  }, [onAddressHintChange, selectedProvince?.name, selectedWard?.name]);

  return (
    <div className={cn("rounded-2xl border border-[var(--border)] bg-white/68 p-3", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
        {loadingProvinces ? <Loader2 size={15} className="animate-spin text-[var(--accent)]" /> : <MapPinned size={15} className="text-[var(--accent)]" />}
        Địa giới Việt Nam
      </div>
      <div className={cn("mt-3 grid gap-2", compact ? "md:grid-cols-2" : "")}>
        <label className="grid gap-1.5 text-xs font-bold text-[var(--muted-foreground)]">
          Tỉnh/thành
          <select
            value={provinceCode}
            onChange={(event) => {
              setProvinceCode(event.target.value);
              setWards([]);
              setWardCode("");
              setWardQuery("");
            }}
            className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          >
            <option value="">{loadingProvinces ? "Đang tải..." : "Chọn tỉnh/thành"}</option>
            {provinces.map((province) => (
              <option key={province.code} value={province.code}>
                {province.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-xs font-bold text-[var(--muted-foreground)]">
          Xã/phường
          <input
            value={wardQuery}
            onChange={(event) => setWardQuery(event.target.value)}
            disabled={!provinceCode}
            placeholder="Lọc xã/phường"
            className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--foreground)] outline-none focus:border-[var(--primary)] disabled:opacity-55"
          />
        </label>

        <label className={cn("grid gap-1.5 text-xs font-bold text-[var(--muted-foreground)]", compact ? "md:col-span-2" : "")}>
          Khu vực cụ thể
          <select
            value={wardCode}
            onChange={(event) => setWardCode(event.target.value)}
            disabled={!provinceCode || loadingWards || wards.length === 0}
            className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--foreground)] outline-none focus:border-[var(--primary)] disabled:opacity-55"
          >
            <option value="">{loadingWards ? "Đang tải xã/phường..." : wards.length > 0 ? "Chọn xã/phường" : "Chưa có xã/phường"}</option>
            {wards.map((ward) => (
              <option key={ward.code} value={ward.code}>
                {ward.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!compact && source ? <p className="mt-2 text-[11px] font-semibold text-[var(--muted-foreground)]">{source}</p> : null}
    </div>
  );
}
