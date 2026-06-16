"use client";

/* SmartIntakePanel — nhập kho nhanh hàng loạt cho Dashboard v2.
 * 3 chế độ: dán văn bản/CSV/JSON, quét hoá đơn bằng AI, nhập bằng giọng nói.
 * Bảng nháp chỉnh sửa trực tiếp trước khi ghi. Commit qua importInventoryIntakeAction
 * (tạo/cập nhật nguyên liệu + ghi phiếu nhập kho theo ledger).
 */

import { useRef, useState, useTransition } from "react";
import {
  ClipboardPaste,
  FileSpreadsheet,
  Loader2,
  Mic,
  MicOff,
  PackageCheck,
  Plus,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
  Wand2
} from "lucide-react";
import { Drawer } from "../../overlay";
import { Badge } from "../../primitives";
import { Button } from "../../button";
import { useToast } from "@/components/dashboard/toast-provider";
import { importInventoryIntakeAction } from "@/app/dashboard/actions";
import { formatVnd } from "@/lib/money";
import {
  parseInventoryDraft,
  parseIntakeNumber,
  normalizeIntakeUnit,
  type IntakeDraftRow
} from "@/lib/inventory-intake-parser";

type IntakeMode = "text" | "ocr" | "voice";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };
type InventoryOcrResponse = {
  text?: string;
  data?: { rows?: Array<IntakeDraftRow & { categoryName?: string | null }> };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Không đọc được file ảnh nhập kho."));
    reader.readAsDataURL(file);
  });
}

const SAMPLE = `Cà chua, kg, 20, min 5, giá 18000, nhóm Rau củ
Sữa tươi, lít, 12, min 4, giá 25000
Bột mì, kg, 30, giá 16000`;

export function SmartIntakePanel({
  open,
  onClose,
  canProcurement,
  canAiOcr,
  onCommitted
}: {
  open: boolean;
  onClose: () => void;
  canProcurement: boolean;
  canAiOcr: boolean;
  onCommitted: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<IntakeMode>("text");
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<IntakeDraftRow[]>([]);
  const [message, setMessage] = useState("Chưa có dòng nháp nào.");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [committing, startCommit] = useTransition();

  const totalValue = rows.reduce((sum, r) => sum + r.quantity * r.referenceUnitCost, 0);

  function runParse(value = rawText) {
    const parsed = parseInventoryDraft(value);
    setRows(parsed);
    setMessage(
      parsed.length > 0
        ? `Đã nhận diện ${parsed.length} dòng. Kiểm tra rồi ghi nhập kho.`
        : "Chưa nhận diện được dòng hợp lệ. Mỗi nguyên liệu một dòng: tên, đơn vị, số lượng, giá."
    );
  }

  async function runOcr({ imageFile, text }: { imageFile?: File; text?: string }) {
    if (!canAiOcr) {
      toast.error("AI đọc hoá đơn kho thuộc gói Premium.");
      return;
    }
    const trimmed = text?.trim();
    if (!imageFile && !trimmed) {
      toast.error("Hãy tải ảnh hoá đơn hoặc dán nội dung trước khi gọi AI.");
      return;
    }
    setOcrLoading(true);
    setMessage(imageFile ? "AI đang đọc ảnh hoá đơn…" : "AI đang phân tích nội dung…");
    try {
      const imageBase64 = imageFile ? await fileToBase64(imageFile) : undefined;
      const res = await fetch("/api/admin/ai/inventory-ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, rawText: trimmed || undefined })
      });
      const result = (await res.json().catch(() => null)) as ApiResponse<InventoryOcrResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "AI chưa đọc được dữ liệu nhập kho.");
      const parsed = (result.data.data?.rows ?? []).map((r) => ({
        name: r.name,
        unit: normalizeIntakeUnit(r.unit || "unit"),
        quantity: parseIntakeNumber(r.quantity),
        minimumQuantity: parseIntakeNumber(r.minimumQuantity),
        referenceUnitCost: Math.round(parseIntakeNumber(r.referenceUnitCost)),
        categoryName: r.categoryName || undefined
      }));
      setRows(parsed);
      setMessage(result.data.text || `AI đã nhận diện ${parsed.length} dòng nhập kho.`);
      if (parsed.length === 0) toast.error("AI chưa tách được dòng nào, thử ảnh rõ hơn.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không đọc được nhập kho bằng AI.";
      setMessage(msg);
      toast.error(msg);
    } finally {
      setOcrLoading(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      setMode("ocr");
      await runOcr({ imageFile: file });
      return;
    }
    const text = await file.text();
    setRawText(text);
    runParse(text);
  }

  function startVoice() {
    const ctor =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
    if (!ctor) {
      toast.error("Trình duyệt không hỗ trợ nhập bằng giọng nói.");
      return;
    }
    const recognition = new ctor();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((r) => r[0]?.transcript ?? "").join(" ").trim();
      const next = `${rawText}\n${transcript}`.trim();
      setRawText(next);
      runParse(next);
    };
    recognition.onerror = () => {
      setListening(false);
      toast.error("Không nghe rõ. Thử nói: tên, đơn vị, số lượng, giá.");
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  function updateRow(index: number, patch: Partial<IntakeDraftRow>) {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }
  function addRow() {
    setRows((current) => [...current, { name: "", unit: "unit", quantity: 0, minimumQuantity: 0, referenceUnitCost: 0 }]);
  }

  function commit() {
    if (!canProcurement) {
      toast.error("Nhập kho hàng loạt thuộc gói Premium.");
      return;
    }
    const valid = rows.filter((r) => r.name.trim() && r.unit.trim() && r.quantity >= 0);
    if (valid.length === 0) {
      toast.error("Chưa có dòng hợp lệ để ghi nhập kho.");
      return;
    }
    startCommit(async () => {
      try {
        const fd = new FormData();
        fd.set("rowsJson", JSON.stringify(valid));
        const state = await importInventoryIntakeAction(undefined, fd);
        if (state?.error) {
          toast.error(state.error);
          return;
        }
        toast.success(state?.success ?? `Đã ghi ${valid.length} dòng nhập kho.`);
        setRows([]);
        setRawText("");
        setMessage("Chưa có dòng nháp nào.");
        onCommitted();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không ghi được nhập kho hàng loạt.");
      }
    });
  }

  const modeTabs: Array<{ key: IntakeMode; label: string; icon: typeof ClipboardPaste; gated?: boolean }> = [
    { key: "text", label: "Dán / CSV / JSON", icon: ClipboardPaste },
    { key: "ocr", label: "Quét hoá đơn AI", icon: ScanLine, gated: !canAiOcr },
    { key: "voice", label: "Giọng nói", icon: Mic }
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Nhập kho nhanh hàng loạt"
      subtitle="Nhập liệu thông minh"
      headerMeta={
        <>
          <Badge tone="jade">{rows.length} dòng</Badge>
          {rows.length > 0 ? <Badge tone="info">≈ {formatVnd(totalValue)}</Badge> : null}
          {!canProcurement ? <Badge tone="orange">Cần Premium</Badge> : null}
        </>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{message}</span>
          <Button variant="ghost" size="lg" onClick={() => { setRows([]); setRawText(""); setMessage("Chưa có dòng nháp nào."); }} disabled={committing || rows.length === 0}>
            Xoá nháp
          </Button>
          <Button variant="primary" size="lg" onClick={commit} disabled={committing || rows.length === 0}>
            {committing ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />}
            Ghi nhập kho ({rows.length})
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--d-s-4)]">
        {/* Chọn chế độ */}
        <div className="flex flex-wrap gap-2">
          {modeTabs.map((t) => {
            const Icon = t.icon;
            const active = mode === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setMode(t.key)}
                className={`inline-flex items-center gap-2 rounded-[var(--d-r-md)] border px-3 py-2 text-[length:var(--d-fs-sm)] font-semibold transition ${
                  active
                    ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]"
                    : "border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-line-strong)]"
                }`}
              >
                <Icon size={15} />
                {t.label}
                {t.gated ? <span className="rounded-full bg-[var(--d-accent-soft)] px-1.5 py-0.5 text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-orange-600)]">Premium</span> : null}
              </button>
            );
          })}
        </div>

        {/* Vùng nhập theo chế độ */}
        {mode === "text" ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              onBlur={() => runParse()}
              rows={5}
              placeholder={`Mỗi nguyên liệu một dòng. Hỗ trợ CSV/JSON.\nVí dụ:\n${SAMPLE}`}
              className="w-full rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="md" onClick={() => runParse()}>
                <Wand2 size={14} /> Phân tích
              </Button>
              <Button variant="ghost" size="md" onClick={() => { setRawText(SAMPLE); runParse(SAMPLE); }}>
                <FileSpreadsheet size={14} /> Dùng mẫu
              </Button>
              <Button variant="ghost" size="md" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Tải file (CSV/ảnh)
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "ocr" ? (
          <div className="flex flex-col gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-jade)]/25 bg-[var(--d-primary-soft)]/30 p-[var(--d-s-4)]">
            <p className="d-eyebrow text-[var(--d-primary)]">Quét hoá đơn bằng AI</p>
            {!canAiOcr ? (
              <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                Tính năng AI đọc hoá đơn thuộc gói <strong>Premium</strong> (giới hạn 300 lượt/tháng). Nâng cấp để bật quét tự động.
              </p>
            ) : (
              <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                Tải ảnh hoá đơn / phiếu giao hàng, AI sẽ tách tên, đơn vị, số lượng, giá. Có thể chỉnh lại trước khi ghi.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="md" onClick={() => fileRef.current?.click()} disabled={!canAiOcr || ocrLoading}>
                {ocrLoading ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} Tải ảnh & quét
              </Button>
              <Button variant="secondary" size="md" onClick={() => runOcr({ text: rawText })} disabled={!canAiOcr || ocrLoading || !rawText.trim()}>
                <Sparkles size={14} /> Đọc nội dung đã dán
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "voice" ? (
          <div className="flex flex-col gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
            <p className="d-eyebrow">Nhập bằng giọng nói</p>
            <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
              Nói rõ từng dòng: “Cà chua, ký, hai mươi, giá mười tám nghìn”. Nội dung sẽ thêm vào ô văn bản và tự phân tích.
            </p>
            <Button variant={listening ? "danger" : "primary"} size="md" onClick={startVoice} disabled={listening}>
              {listening ? <MicOff size={14} /> : <Mic size={14} />} {listening ? "Đang nghe…" : "Bắt đầu nói"}
            </Button>
          </div>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/*,.csv,.txt,.json"
          className="hidden"
          onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
        />

        {/* Bảng nháp */}
        <div className="flex items-center justify-between">
          <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Bảng nháp ({rows.length})</p>
          <Button variant="ghost" size="sm" onClick={addRow}>
            <Plus size={13} /> Thêm dòng
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[var(--d-r-md)] border border-dashed border-[var(--d-line)] px-3 py-6 text-center text-[length:var(--d-fs-sm)] text-[var(--d-text-faint)]">
            Chưa có dòng nào. Dán nội dung, quét hoá đơn hoặc nói để tạo nháp.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_1fr_auto] items-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-1.5">
                <input
                  value={row.name}
                  onChange={(e) => updateRow(index, { name: e.target.value })}
                  placeholder="Tên"
                  className="h-9 rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2 text-[length:var(--d-fs-xs)] font-semibold outline-none focus:border-[var(--d-jade)]"
                />
                <input
                  value={row.unit}
                  onChange={(e) => updateRow(index, { unit: e.target.value })}
                  placeholder="ĐV"
                  className="h-9 rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2 text-[length:var(--d-fs-xs)] outline-none focus:border-[var(--d-jade)]"
                />
                <input
                  type="number" min={0} step="0.01"
                  value={row.quantity}
                  onChange={(e) => updateRow(index, { quantity: Math.max(0, Number(e.target.value) || 0) })}
                  placeholder="SL"
                  className="d-num h-9 rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2 text-[length:var(--d-fs-xs)] font-bold outline-none focus:border-[var(--d-jade)]"
                />
                <input
                  type="number" min={0} step="0.01"
                  value={row.minimumQuantity}
                  onChange={(e) => updateRow(index, { minimumQuantity: Math.max(0, Number(e.target.value) || 0) })}
                  placeholder="Min"
                  className="d-num h-9 rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2 text-[length:var(--d-fs-xs)] outline-none focus:border-[var(--d-jade)]"
                />
                <input
                  type="number" min={0} step={1000}
                  value={row.referenceUnitCost}
                  onChange={(e) => updateRow(index, { referenceUnitCost: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                  placeholder="Giá vốn"
                  className="d-num h-9 rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2 text-[length:var(--d-fs-xs)] font-bold outline-none focus:border-[var(--d-jade)]"
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label="Xoá dòng"
                  className="grid h-9 w-9 place-items-center rounded-[var(--d-r-sm)] text-[var(--d-text-faint)] transition hover:bg-[var(--d-danger-bg)] hover:text-[var(--d-danger-fg)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
