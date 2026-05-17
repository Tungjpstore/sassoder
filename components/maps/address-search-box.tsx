"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AddressAutocompletePrediction } from "@/services/maps/types";

export function AddressSearchBox({
  value,
  onChange,
  onSearch,
  searching,
  placeholder,
  results,
  onChoose,
  multiline = false,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  searching?: boolean;
  placeholder: string;
  results: AddressAutocompletePrediction[];
  onChoose: (prediction: AddressAutocompletePrediction) => void;
  multiline?: boolean;
  className?: string;
}) {
  const inputClassName =
    "w-full rounded-xl border border-[rgba(169,197,161,0.45)] bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--primary)]";

  return (
    <div className={cn("grid gap-2", className)}>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn(inputClassName, "min-h-20")} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={inputClassName} />
      )}
      <Button type="button" onClick={onSearch} disabled={searching} className="h-11 rounded-xl">
        {searching ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
        {searching ? "Đang tìm..." : "Tìm trên bản đồ"}
      </Button>
      {results.length > 0 ? (
        <div className="grid gap-2">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => onChoose(result)}
              className="rounded-xl border border-[rgba(169,197,161,0.34)] bg-white px-3 py-2 text-left transition hover:border-[var(--primary)]/45"
            >
              <span className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-[var(--foreground)]">{result.shortLabel}</span>
                  <span className="mt-0.5 block text-xs font-semibold leading-5 text-[var(--muted-foreground)]">{result.address}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
