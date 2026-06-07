"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { FileText, Image as ImageIcon, Loader2, X } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type LogibotAttachmentDraft = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "text" | "file";
  textPreview?: string;
  dataUrl?: string;
};

export type LogibotAttachmentContext = {
  name: string;
  type: string;
  size: number;
  kind: LogibotAttachmentDraft["kind"];
  textPreview?: string;
  imageBase64?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const maxAttachments = 4;
const maxFileSize = 5 * 1024 * 1024;
const readableTextTypes = new Set(["text/plain", "text/csv", "application/json", "text/markdown"]);
const logibotComposerIcons = {
  command: "/brand/logivn/logibot-icons/command.png",
  file: "/brand/logivn/logibot-icons/file.png",
  send: "/brand/logivn/logibot-icons/send.png",
  voice: "/brand/logivn/logibot-icons/voice.png"
} as const;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(Math.round((size / 1024 / 1024) * 10) / 10).toLocaleString("vi-VN")}MB`;
  if (size >= 1024) return `${Math.round(size / 1024).toLocaleString("vi-VN")}KB`;
  return `${size.toLocaleString("vi-VN")}B`;
}

function isTextReadable(file: File) {
  return readableTextTypes.has(file.type) || /\.(txt|csv|json|md)$/i.test(file.name);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Không đọc được file này."));
    reader.readAsDataURL(file);
  });
}

function speechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function ComposerIcon({ name, active = false }: { name: keyof typeof logibotComposerIcons; active?: boolean }) {
  return (
    <span
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-lg border bg-[#F8F7F4]",
        active ? "border-[#F59E0B]/35 shadow-[0_0_0_3px_rgba(245,158,11,0.12)]" : "border-[#111827]/[0.06]"
      )}
      aria-hidden="true"
    >
      <Image src={logibotComposerIcons[name]} alt="" width={24} height={24} sizes="24px" className="h-full w-full object-cover" />
    </span>
  );
}

function ComposerToolButton({
  label,
  icon,
  active = false,
  disabled = false,
  onClick
}: {
  label: string;
  icon: keyof typeof logibotComposerIcons;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all duration-200 active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto",
        active
          ? "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#7A4A05] shadow-[0_0_12px_rgba(245,158,11,0.15)]"
          : "border-[#0F5132]/10 bg-white/45 backdrop-blur-md text-[#374151] hover:border-[#0F5132]/20 hover:bg-white hover:text-[#0F5132] hover:shadow-sm"
      )}
      aria-pressed={active || undefined}
      aria-label={label}
      title={label}
    >
      <ComposerIcon name={icon} active={active} />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export async function createLogibotAttachmentDrafts(files: File[], currentCount = 0) {
  const availableSlots = Math.max(0, maxAttachments - currentCount);
  const acceptedFiles = files.slice(0, availableSlots);
  const rejectedCount = files.length - acceptedFiles.length;
  const drafts: LogibotAttachmentDraft[] = [];
  const errors: string[] = [];

  for (const file of acceptedFiles) {
    if (file.size > maxFileSize) {
      errors.push(`${file.name} lớn hơn 5MB.`);
      continue;
    }

    try {
      if (file.type.startsWith("image/")) {
        drafts.push({
          id: makeId(),
          name: file.name,
          type: file.type || "image",
          size: file.size,
          kind: "image",
          dataUrl: await readFileAsDataUrl(file)
        });
        continue;
      }

      if (isTextReadable(file)) {
        const text = await file.text();
        drafts.push({
          id: makeId(),
          name: file.name,
          type: file.type || "text/plain",
          size: file.size,
          kind: "text",
          textPreview: text.slice(0, 5000)
        });
        continue;
      }

      drafts.push({
        id: makeId(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        kind: "file"
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Không đọc được ${file.name}.`);
    }
  }

  if (rejectedCount > 0) errors.push(`Chỉ đính kèm tối đa ${maxAttachments} file mỗi lần.`);
  return { drafts, error: errors[0] ?? null };
}

export function compactLogibotAttachments(attachments: LogibotAttachmentDraft[]): LogibotAttachmentContext[] {
  return attachments.map((attachment) => ({
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    kind: attachment.kind,
    textPreview: attachment.textPreview?.slice(0, 3000),
    imageBase64: attachment.dataUrl
  }));
}

export function logibotAttachmentLabel(attachments: LogibotAttachmentDraft[]) {
  if (!attachments.length) return "";
  const names = attachments.map((item) => item.name).slice(0, 2).join(", ");
  return attachments.length > 2 ? `${names} +${attachments.length - 2}` : names;
}

export function inferLogibotAttachmentOcrTarget(message: string, attachments: LogibotAttachmentDraft[]) {
  if (!attachments.length) return null;
  const folded = `${message} ${attachments.map((item) => item.name).join(" ")}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const hasReadablePayload = attachments.some((item) => item.kind === "image" || item.textPreview);
  if (!hasReadablePayload) return null;
  if (/(hoa don|nhap kho|phieu nhap|ton kho|nguyen lieu|inventory|receipt|invoice)/.test(folded)) return "inventory" as const;
  if (/(menu|thuc don|mon|bang gia|ocr)/.test(folded)) return "menu" as const;
  return null;
}

export function firstReadableAttachmentPayload(attachments: LogibotAttachmentDraft[]) {
  const image = attachments.find((item) => item.dataUrl);
  if (image?.dataUrl) return { imageBase64: image.dataUrl };
  const text = attachments.find((item) => item.textPreview);
  if (text?.textPreview) return { rawText: text.textPreview };
  return null;
}

function useLogibotSpeechInput({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stop() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }

  function start() {
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setError("Trình duyệt này chưa hỗ trợ nhập giọng nói.");
      return;
    }

    if (isListening) {
      stop();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) onChange(`${value ? `${value.trim()} ` : ""}${transcript}`.trim());
    };
    recognition.onerror = (event) => {
      setError(event.error === "not-allowed" ? "Cần cấp quyền microphone để dùng voice." : "Voice chưa nghe rõ, thử lại một lần nữa.");
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setError(null);
    setIsListening(true);
    recognition.start();
  }

  return { isListening, error, start, stop, clearError: () => setError(null) };
}

export function LogibotComposer({
  value,
  isSending,
  placeholder = "Hỏi LogiBot về quán của bạn…",
  onChange,
  onSubmit,
  onCommand,
  className,
  disclaimer
}: {
  value: string;
  isSending: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: (message: string, attachments: LogibotAttachmentDraft[]) => Promise<void> | void;
  onCommand?: () => void;
  className?: string;
  disclaimer?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);
  const [attachments, setAttachments] = useState<LogibotAttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const voice = useLogibotSpeechInput({ value, onChange });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [value]);

  async function addFiles(files: File[]) {
    if (!files.length) return;
    const result = await createLogibotAttachmentDrafts(files, attachments.length);
    setAttachments((current) => [...current, ...result.drafts]);
    setAttachmentError(result.error);
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    await addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLFormElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  }

  async function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragActive(false);
    await addFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = value.trim();
    if ((!message && !attachments.length) || isSending) return;

    isSubmittingRef.current = true;

    // Clear state in parent synchronously
    onChange("");

    // Fail-proof instant clear on the DOM textarea element
    if (textareaRef.current) {
      textareaRef.current.value = "";
    }

    void onSubmit(message || "Đọc file đính kèm và cho biết bước xử lý tiếp theo.", attachments);
    setAttachments([]);
    setAttachmentError(null);
    voice.clearError();

    // Reset reference after composition commit events settle
    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 150);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className={className}>
      <form
        onSubmit={submit}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded-[28px] bg-[#FFFEFA]/70 backdrop-blur-xl border border-black/[0.08] p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.06)] transition-all duration-200",
          dragActive 
            ? "border-[#0F5132]/30 ring-4 ring-[#0F5132]/10 bg-[#FFFEFA]/90" 
            : "focus-within:border-[#0F5132]/30 focus-within:ring-4 focus-within:ring-[#0F5132]/10"
        )}
      >
        {attachments.length ? (
          <div className="mb-2 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {attachments.map((attachment) => {
              const Icon = attachment.kind === "image" ? ImageIcon : FileText;
              return (
                <span key={attachment.id} className="inline-flex min-h-9 max-w-[240px] shrink-0 items-center gap-2 rounded-full border border-[#0F5132]/10 bg-[#0F5132]/5 px-3 text-xs font-bold text-[#0F5132] shadow-sm">
                  <Icon size={13} className="shrink-0 text-[#0F5132]" />
                  <span className="min-w-0 truncate">{attachment.name}</span>
                  <span className="shrink-0 text-[#0F5132]/60 font-semibold">{formatBytes(attachment.size)}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0F5132]/10 text-[#0F5132] transition hover:bg-[#0F5132]/20 hover:scale-105"
                    aria-label={`Bỏ ${attachment.name}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="flex min-h-12 items-start gap-2 rounded-[20px] bg-[#F8F7F4]/40 border border-black/[0.04] px-3.5 py-1.5 focus-within:bg-[#F8F7F4]/60 transition-colors duration-200">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,.txt,.csv,.json,.md,.pdf,.doc,.docx,.xlsx"
            onChange={handleFiles}
            className="hidden"
            aria-label="Chọn file cho LogiBot"
          />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              if (isSubmittingRef.current) return;
              onChange(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            name="logibot-message"
            autoComplete="off"
            aria-label="Hỏi LogiBot về quán của bạn"
            placeholder={placeholder}
            className="logibot-composer-input max-h-28 min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent py-2 text-[15px] font-medium leading-6 text-[#111827] shadow-none outline-none placeholder:text-[#9CA3AF]"
          />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          <ComposerToolButton label="File" icon="file" onClick={() => inputRef.current?.click()} />
          {onCommand ? <ComposerToolButton label="Lệnh" icon="command" onClick={onCommand} /> : null}
          <ComposerToolButton label={voice.isListening ? "Dừng" : "Giọng"} icon="voice" active={voice.isListening} onClick={voice.isListening ? voice.stop : voice.start} />
          <button
            type="submit"
            disabled={isSending || (!value.trim() && !attachments.length)}
            className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0F5132] to-[#147A4D] hover:from-[#0B3D27] hover:to-[#0F5132] px-4 text-xs font-bold text-white shadow-[0_10px_24px_rgba(15,81,50,0.15)] hover:shadow-[0_12px_30px_rgba(15,81,50,0.22)] transition-all duration-200 active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-45 sm:ml-auto sm:w-auto"
            aria-label="Gửi"
            title="Gửi"
          >
            {isSending ? <Loader2 size={16} className="animate-spin" /> : <ComposerIcon name="send" />}
            <span>Gửi</span>
          </button>
        </div>
      </form>
      {voice.isListening || voice.error || attachmentError || disclaimer ? (
        <div className="mt-2 flex flex-col items-center justify-center gap-1.5 text-center text-[11px] font-semibold leading-5 text-[#6B7280]">
          {voice.isListening ? (
            <div className="flex items-center gap-2">
              <span className="text-[#EF4444]">Đang nghe tiếng Việt…</span>
              <div className="flex items-center justify-center gap-0.5 h-3">
                {[...Array(6)].map((_, i) => (
                  <motion.span
                    key={i}
                    animate={{
                      scaleY: [0.3, 1.3, 0.3],
                    }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.1,
                      ease: "easeInOut",
                    }}
                    className={cn(
                      "w-[2px] rounded-full origin-center h-3.5",
                      i % 2 === 0 ? "bg-[#EF4444]" : "bg-[#F59E0B]"
                    )}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p>{voice.error || attachmentError || disclaimer}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
