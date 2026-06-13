"use client";

/* Menu AI toolkit (v2):
 *  - AiImageStudio: tạo ảnh món bằng AI có ô prompt mô tả, nút Tạo / Tạo lại / Áp dụng.
 *    Nếu khách nhập prompt → ép AI tạo theo prompt; bỏ trống → tạo theo mặc định.
 *  - MenuAiImportModal: nhập menu nhanh bằng OCR ảnh, dán text thông minh, hoặc giọng nói.
 * Backend: POST /api/admin/ai/image (food_photo), POST /api/admin/ai/menu-ocr,
 * importMenuOcrItemsAction. Quota/gate do backend enforce; UI hiển thị + handle 402.
 */

import { useRef, useState } from "react";
import { Check, ImageIcon, Loader2, Mic, RefreshCw, ScanText, Sparkles, Upload, Wand2, X } from "lucide-react";
import { Button } from "../../button";
import { Modal } from "../../overlay";
import { Badge } from "../../primitives";
import { useToast } from "@/components/dashboard/toast-provider";
import { importMenuOcrItemsAction } from "@/app/dashboard/actions/menu";
import type { AdminMenuCategory } from "@/services/menu-service";
import { cn } from "@/lib/utils";

export type MenuAiAccess = {
  image: { enabled: boolean; used: number; limit: number | null };
  ocr: { enabled: boolean; used: number; limit: number | null };
  voiceEnabled: boolean;
};

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

function formatVnd(n: number) {
  return `${n.toLocaleString("vi-VN")}₫`;
}

function UsagePill({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const reached = typeof limit === "number" && used >= limit;
  const near = typeof limit === "number" && !reached && used >= limit * 0.8;
  return (
    <span
      className={cn(
        "d-num inline-flex items-center gap-1 rounded-[var(--d-r-pill)] px-2 py-0.5 text-[length:var(--d-fs-2xs)] font-bold",
        reached
          ? "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]"
          : near
          ? "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]"
          : "bg-[var(--d-surface-2)] text-[var(--d-text-muted)]"
      )}
    >
      {label} {used}{limit === null ? "" : `/${limit}`}
    </span>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được ảnh."));
    reader.readAsDataURL(file);
  });
}

/* ===================== AI Image Studio (trong drawer/modal sửa món) ===================== */

export function AiImageStudio({
  formId,
  defaultDishName,
  restaurantName,
  access,
  appliedUrl,
  onApply
}: {
  formId: string;
  defaultDishName: string;
  restaurantName: string;
  access: MenuAiAccess["image"];
  appliedUrl: string | null;
  onApply: (url: string) => void;
}) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function readContext() {
    const form = (typeof document !== "undefined" ? document.getElementById(formId) : null) as HTMLFormElement | null;
    const nameValue = (form?.elements.namedItem("name") as HTMLInputElement | null)?.value?.trim();
    const categorySelect = form?.elements.namedItem("categoryId") as HTMLSelectElement | null;
    const categoryName = categorySelect?.selectedOptions?.[0]?.textContent?.trim() || "Menu";
    const price = Number((form?.elements.namedItem("price") as HTMLInputElement | null)?.value || 0);
    return { dishName: nameValue || defaultDishName, categoryName, price };
  }

  async function generate() {
    if (loading) return;
    const { dishName, categoryName, price } = readContext();
    if (dishName.trim().length < 2) {
      setError("Nhập tên món trước để AI tạo đúng món (tránh tốn lượt cho ảnh ngẫu nhiên).");
      return;
    }
    const brief = prompt.trim();
    const dishContext = `Dish: "${dishName}", category: ${categoryName}${price > 0 ? `, menu price ${formatVnd(price)}` : ""}.`;
    const composed = brief
      ? `${brief}\n\n(Reference dish only if the description above does not name a subject: ${dishContext})`
      : dishContext;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "food_photo", restaurantName, businessType: categoryName, prompt: composed })
      });
      const json = (await res.json().catch(() => null)) as ApiEnvelope<{ imageUrl: string | null }> | null;
      if (!json || !json.ok) throw new Error((json && !json.ok && json.error) || "Chưa tạo được ảnh món.");
      if (!json.data.imageUrl) throw new Error("Ảnh chưa sẵn sàng, vui lòng thử lại.");
      setDraftUrl(json.data.imageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được ảnh món.");
    } finally {
      setLoading(false);
    }
  }

  if (!access.enabled) {
    return (
      <div className="rounded-[var(--d-r-md)] border border-dashed border-[var(--d-orange)]/40 bg-[var(--d-accent-soft)]/50 p-[var(--d-s-3)]">
        <p className="flex items-center gap-1.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-orange-600)]">
          <Sparkles size={14} /> Tạo ảnh món bằng AI · gói Premium
        </p>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Nâng cấp Premium để tạo ảnh món chuyên nghiệp ngay trong trình sửa món.
        </p>
        <a href="/dashboard/settings?section=billing" className="mt-2 inline-flex h-8 items-center gap-1 rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-3 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-on-jade)]">
          Nâng cấp gói
        </a>
      </div>
    );
  }

  const reached = typeof access.limit === "number" && access.used >= access.limit;

  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)]/30 p-[var(--d-s-3)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-primary)]">
          <Wand2 size={15} /> Tạo ảnh món bằng AI
        </p>
        <UsagePill label="Ảnh" used={access.used} limit={access.limit} />
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        maxLength={400}
        placeholder="Mô tả phong cách ảnh (tuỳ chọn): nền gỗ, ánh sáng ấm, có ống hút… Để trống sẽ tạo theo mặc định."
        className="mt-2 w-full resize-none rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
      />

      {draftUrl ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draftUrl} alt="Ảnh AI" className="aspect-square h-full w-full object-cover" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              {appliedUrl === draftUrl ? "Đã áp dụng ảnh này. Lưu món để cập nhật." : "Xem trước ảnh AI. Bấm Áp dụng để gắn vào món rồi lưu."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={generate} disabled={loading || reached}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Tạo lại
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  onApply(draftUrl);
                  toast.success("Đã áp dụng ảnh AI — nhớ bấm Lưu để cập nhật món.");
                }}
                disabled={appliedUrl === draftUrl}
              >
                <Check size={14} /> {appliedUrl === draftUrl ? "Đã áp dụng" : "Áp dụng"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button type="button" variant="primary" size="sm" className="mt-2" onClick={generate} disabled={loading || reached}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? "Đang tạo ảnh…" : "Tạo ảnh"}
        </Button>
      )}

      {reached ? (
        <p className="mt-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-danger-fg)]">
          Đã hết lượt tạo ảnh tháng này. Lượt sẽ làm mới đầu kỳ kế tiếp.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-danger-fg)]">{error}</p> : null}
    </div>
  );
}


/* ===================== Menu AI Import (OCR ảnh · text thông minh · giọng nói) ===================== */

type OcrDraftItem = { name: string; price: number; description: string | null; tags: string[] };
type OcrDraft = {
  categories: Array<{ name: string; items: OcrDraftItem[] }>;
  warnings: string[];
  confidence: number;
};

type DraftRow = { key: string; categoryName: string; name: string; price: number; selected: boolean };

function flattenDraft(draft: OcrDraft): DraftRow[] {
  const rows: DraftRow[] = [];
  draft.categories.forEach((cat, ci) => {
    cat.items.forEach((it, ii) => {
      rows.push({
        key: `${ci}-${ii}-${it.name}`,
        categoryName: cat.name,
        name: it.name,
        price: it.price,
        selected: it.price >= 1000
      });
    });
  });
  return rows;
}

export function MenuAiImportModal({
  open,
  ocr,
  voiceEnabled,
  onClose,
  onImported
}: {
  open: boolean;
  ocr: MenuAiAccess["ocr"];
  voiceEnabled: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"image" | "text">("image");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<unknown>(null);

  if (!open) return null;

  function reset() {
    setImageFile(null);
    setImagePreview(null);
    setRawText("");
    setRows(null);
    setWarnings([]);
    setError(null);
  }

  function close() {
    stopVoice();
    reset();
    onClose();
  }

  async function runOcr() {
    if (loading) return;
    if (mode === "image" && !imageFile) {
      setError("Chọn ảnh menu để AI đọc.");
      return;
    }
    if (mode === "text" && rawText.trim().length < 4) {
      setError("Nhập hoặc đọc nội dung menu trước khi để AI tách món.");
      return;
    }
    setLoading(true);
    setError(null);
    setRows(null);
    try {
      const imageBase64 = mode === "image" && imageFile ? await fileToBase64(imageFile) : undefined;
      const res = await fetch("/api/admin/ai/menu-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "image" ? { imageBase64 } : { rawText: rawText.trim() })
      });
      const json = (await res.json().catch(() => null)) as ApiEnvelope<{ data?: OcrDraft }> | null;
      if (!json || !json.ok) throw new Error((json && !json.ok && json.error) || "Chưa đọc được menu.");
      const draft = json.data.data;
      if (!draft || draft.categories.length === 0) throw new Error("AI chưa tách được món có giá. Thử ảnh rõ hơn hoặc dán menu dạng text.");
      setRows(flattenDraft(draft));
      setWarnings(draft.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được menu.");
    } finally {
      setLoading(false);
    }
  }

  function stopVoice() {
    const rec = recognitionRef.current as { stop?: () => void } | null;
    rec?.stop?.();
    recognitionRef.current = null;
    setListening(false);
  }

  function toggleVoice() {
    if (listening) {
      stopVoice();
      return;
    }
    const Ctor = (typeof window !== "undefined"
      ? (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
      : null) as (new () => {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    }) | null;
    if (!Ctor) {
      toast.error("Trình duyệt không hỗ trợ nhập bằng giọng nói. Hãy dùng Chrome trên máy tính/Android.");
      return;
    }
    setMode("text");
    const recognition = new Ctor();
    recognition.lang = "vi-VN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let chunk = "";
      for (let i = 0; i < event.results.length; i += 1) chunk += `${event.results[i][0].transcript} `;
      setRawText((prev) => `${prev}${prev ? "\n" : ""}${chunk.trim()}`.slice(0, 18000));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function importSelected() {
    if (!rows || importing) return;
    const chosen = rows.filter((r) => r.selected && r.price >= 1000);
    if (chosen.length === 0) {
      setError("Chọn ít nhất một món có giá hợp lệ (≥ 1.000₫) để nhập.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("itemsJson", JSON.stringify(chosen.map((r) => ({ categoryName: r.categoryName, name: r.name, price: r.price }))));
      const result = await importMenuOcrItemsAction(undefined, fd);
      if ("error" in result && result.error) throw new Error(result.error);
      const inserted = "inserted" in result ? result.inserted : chosen.length;
      const successMsg = "success" in result ? result.success : undefined;
      toast.success(successMsg ?? `Đã nhập ${inserted} món.`);
      onImported(inserted);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không nhập được món vào menu.");
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = rows?.filter((r) => r.selected && r.price >= 1000).length ?? 0;

  return (
    <Modal open onClose={close} title="Nhập menu bằng AI" subtitle="OCR ảnh · text thông minh · giọng nói" size="lg">
      <div className="flex flex-col gap-[var(--d-s-3)]">
        {!ocr.enabled ? (
          <div className="rounded-[var(--d-r-md)] border border-dashed border-[var(--d-orange)]/40 bg-[var(--d-accent-soft)]/50 p-[var(--d-s-3)]">
            <p className="flex items-center gap-1.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-orange-600)]">
              <Sparkles size={14} /> AI quét menu · gói Premium
            </p>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Nâng cấp Premium để AI đọc ảnh menu, nhận diện text và nhập món hàng loạt.
            </p>
            <a href="/dashboard/settings?section=billing" className="mt-2 inline-flex h-8 items-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-3 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-on-jade)]">
              Nâng cấp gói
            </a>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-[var(--d-r-pill)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-1">
                <button
                  type="button"
                  onClick={() => setMode("image")}
                  className={cn("inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--d-r-pill)] px-3 text-[length:var(--d-fs-xs)] font-semibold transition", mode === "image" ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "text-[var(--d-text-muted)]")}
                >
                  <ScanText size={14} /> Quét ảnh
                </button>
                <button
                  type="button"
                  onClick={() => setMode("text")}
                  className={cn("inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--d-r-pill)] px-3 text-[length:var(--d-fs-xs)] font-semibold transition", mode === "text" ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "text-[var(--d-text-muted)]")}
                >
                  <Sparkles size={14} /> Text / Giọng nói
                </button>
              </div>
              <UsagePill label="OCR" used={ocr.used} limit={ocr.limit} />
            </div>

            {mode === "image" ? (
              <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                <div className="grid aspect-square place-items-center overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)]">
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview} alt="Ảnh menu" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-[var(--d-text-faint)]">
                      <ImageIcon size={28} />
                      <span className="text-[length:var(--d-fs-2xs)] font-semibold">Ảnh menu</span>
                    </div>
                  )}
                </div>
                <div className="grid content-start gap-2">
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[var(--d-r-md)] border border-dashed border-[var(--d-jade)]/40 bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:bg-[var(--d-primary-soft)]">
                    <Upload size={14} className="text-[var(--d-primary)]" />
                    Chọn ảnh menu (PNG/JPG/WebP)
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setImageFile(f);
                        setImagePreview(f ? URL.createObjectURL(f) : null);
                        setRows(null);
                      }}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Chụp/Tải rõ bảng giá. AI sẽ tách tên món + giá theo danh mục.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Dán menu dạng text, hoặc đọc bằng giọng nói</span>
                  {voiceEnabled ? (
                    <button
                      type="button"
                      onClick={toggleVoice}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-[var(--d-r-pill)] px-3 text-[length:var(--d-fs-xs)] font-bold transition",
                        listening ? "bg-[var(--d-danger-fg)] text-white" : "border border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[var(--d-primary)]"
                      )}
                    >
                      <Mic size={14} /> {listening ? "Đang nghe… bấm dừng" : "Đọc bằng giọng nói"}
                    </button>
                  ) : null}
                </div>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={5}
                  maxLength={18000}
                  placeholder={"Ví dụ:\nCà phê sữa đá 25000\nBạc xỉu 30000\nTrà đào cam sả 45000"}
                  className="w-full resize-none rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
                />
              </div>
            )}

            <Button type="button" variant="primary" size="md" onClick={runOcr} disabled={loading}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <ScanText size={15} />}
              {loading ? "AI đang đọc menu…" : "Đọc menu bằng AI"}
            </Button>

            {warnings.length ? (
              <p className="rounded-[var(--d-r-md)] bg-[var(--d-accent-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-orange-600)]">{warnings.join(" · ")}</p>
            ) : null}

            {rows ? (
              <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)]">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--d-line)] px-3 py-2">
                  <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">AI đọc được {rows.length} món</p>
                  <span className="d-num text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-primary)]">{selectedCount} chọn nhập</span>
                </div>
                <ul className="max-h-64 divide-y divide-[var(--d-line)] overflow-y-auto">
                  {rows.map((r, i) => {
                    const invalid = r.price < 1000;
                    return (
                      <li key={r.key} className="flex items-center gap-2.5 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={r.selected && !invalid}
                          disabled={invalid}
                          onChange={(e) => setRows((prev) => prev?.map((row, idx) => (idx === i ? { ...row, selected: e.target.checked } : row)) ?? null)}
                          className="h-4 w-4 flex-none accent-[var(--d-jade)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[length:var(--d-fs-sm)] font-medium text-[var(--d-text)]">{r.name}</span>
                          <span className="block text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{r.categoryName}</span>
                        </span>
                        <span className={cn("d-num text-[length:var(--d-fs-sm)] font-bold", invalid ? "text-[var(--d-danger-fg)]" : "text-[var(--d-text)]")}>
                          {invalid ? "thiếu giá" : formatVnd(r.price)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {error ? <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-danger-fg)]">{error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
              <Button type="button" variant="secondary" size="md" onClick={close}>
                <X size={14} /> Đóng
              </Button>
              {rows ? (
                <Button type="button" variant="primary" size="md" onClick={importSelected} disabled={importing || selectedCount === 0}>
                  {importing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Nhập {selectedCount} món
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
