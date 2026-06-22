"use client";

import { useState } from "react";
import { ArrowRight, Brain, Check, FileImage, Lightbulb, Mic, Package, Send, Sparkles, TrendingUp, Wand2, Warehouse } from "lucide-react";
import { Toolbar } from "../workspace-ui";
import { Button } from "../button";
import { Badge, MetricCard, EmptyState } from "../primitives";
import { Modal } from "../overlay";
import { useToast } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { fmtVnd } from "./data";
import { cn } from "@/lib/utils";

/* AiDemo — bám sát services/ai-*.ts:
 *  - ai_owner_assistant: chat trợ lý chủ quán (Owner Agent)
 *  - ai_branding_studio: tạo slogan, mô tả, banner
 *  - ai_menu_ocr / ai_image_generation: cho menu
 *  - ai_voice_input / ai_voice_notifications: giọng nói
 *  - ai_customer_assistant: trả lời khách trên menu QR
 *  - morning brief: tóm tắt ca → đẩy Telegram chủ quán
 *  - recommendations: aiRecommendationDeck (active)
 */

type Tool = {
  key: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  quotaUsed: number;
  quotaCap: number;
  premium?: boolean;
};

const TOOLS: Tool[] = [
  { key: "ai_owner_assistant", icon: <Brain size={20} />, title: "Trợ lý chủ quán", desc: "Hỏi đáp realtime về đơn, kho, doanh thu. Có quyền hành động khi bạn duyệt.", quotaUsed: 184, quotaCap: 300 },
  { key: "ai_customer_assistant", icon: <Sparkles size={20} />, title: "Hỗ trợ khách gọi món", desc: "Bot QR gợi ý món, upsell tự nhiên cho khách.", quotaUsed: 472, quotaCap: 1000 },
  { key: "ai_branding_studio", icon: <Wand2 size={20} />, title: "Studio nhận diện", desc: "AI viết slogan, mô tả quán, mô tả món theo phong cách Việt.", quotaUsed: 12, quotaCap: 40 },
  { key: "ai_menu_ocr", icon: <FileImage size={20} />, title: "OCR menu", desc: "Quét menu giấy → tự nhập vào hệ thống.", quotaUsed: 0, quotaCap: 0, premium: true },
  { key: "ai_image_generation", icon: <FileImage size={20} />, title: "Tạo ảnh món", desc: "Banner, ảnh menu chuyên nghiệp cho từng món.", quotaUsed: 0, quotaCap: 0, premium: true },
  { key: "inventory_ai_ocr", icon: <Warehouse size={20} />, title: "OCR hoá đơn nhập", desc: "Đọc hoá đơn ảnh, tạo phiếu nhập kho tự động.", quotaUsed: 0, quotaCap: 0, premium: true },
  { key: "inventory_ai_intelligence", icon: <Package size={20} />, title: "AI tối ưu tồn kho", desc: "Dự đoán hết hàng, gợi ý PO theo lịch sử bán.", quotaUsed: 0, quotaCap: 0, premium: true },
  { key: "ai_voice_input", icon: <Mic size={20} />, title: "Nhập liệu bằng giọng", desc: "Đọc nhanh nguyên liệu nhập, gọi món tay không.", quotaUsed: 23, quotaCap: 300 }
];

type Recommendation = { id: string; priority: "high" | "med" | "low"; title: string; detail: string; impact: string; action: string };

const RECS: Recommendation[] = [
  { id: "r1", priority: "high", title: "Đẩy combo Bạc xỉu giờ trưa", detail: "Bạc xỉu đang chiếm 28% đơn 11h-13h, dư biên LN. Tạo combo +bánh để tăng giỏ.", impact: "+850k/ngày", action: "Tạo khuyến mãi" },
  { id: "r2", priority: "high", title: "Chuẩn bị thêm sữa tươi cho ca tối", detail: "Tốc độ tiêu thụ tăng 18% so với 7 ngày trước. Tồn hiện tại đủ cho ~3 giờ.", impact: "Tránh tắt món", action: "Tạo PO sữa tươi" },
  { id: "r3", priority: "med", title: "Bàn 07 thường quá giờ", detail: "Trung bình 92 phút/lượt, cao hơn quán 35%. Có thể do server đang phục vụ 2 bàn.", impact: "+1 lượt/khung", action: "Phân lại nhân sự" },
  { id: "r4", priority: "low", title: "Khách Anh Bình quay lại", detail: "Đặt bàn 19:00, thường gọi cà phê sữa đá ít đường + bánh mì.", impact: "Trải nghiệm", action: "Note cho server" }
];

const PRIORITY: Record<Recommendation["priority"], { tone: "danger" | "orange" | "info"; label: string }> = {
  high: { tone: "danger", label: "Quan trọng" },
  med: { tone: "orange", label: "Nên xem" },
  low: { tone: "info", label: "Tham khảo" }
};


export function AiDemo() {
  const [prompt, setPrompt] = useState("Tóm tắt ca hôm nay và việc cần làm ngay");
  const [messages, setMessages] = useState<{ role: "ai" | "user"; text: string }[]>([
    { role: "ai", text: "Doanh thu hôm nay đang tăng 12%. Có 2 việc cần làm ngay: xác nhận VietQR Bàn 07 và nhập thêm sữa tươi trước ca tối." }
  ]);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const toast = useToast();

  const ask = () => {
    const q = prompt.trim();
    if (!q) return;
    setMessages((p) => [
      ...p,
      { role: "user" as const, text: q },
      { role: "ai" as const, text: "Đã phân tích theo dữ liệu đơn, kho, thanh toán và bàn hiện tại. Gợi ý: xử lý bill chờ thu trước, sau đó tạo PO sữa tươi 20 lít." }
    ]);
    setPrompt("");
  };

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="LogiBot AI" title="Trợ lý AI" />

      <section className="grid gap-[var(--d-s-4)] lg:grid-cols-[1.25fr_0.75fr]">
        <OwnerAgentCard prompt={prompt} setPrompt={setPrompt} messages={messages} onAsk={ask} />
        <MorningBrief onSend={() => toast.success("Đã gửi Morning Brief sang Telegram chủ quán")} />
      </section>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Brain size={18} />} label="Owner Agent" value="184/300" tone="jade" />
        <MetricCard icon={<Sparkles size={18} />} label="Khuyến nghị active" value={String(RECS.length)} tone="orange" />
        <MetricCard icon={<Mic size={18} />} label="Voice input" value="23/300" tone="info" />
        <MetricCard icon={<TrendingUp size={18} />} label="Tác động ước tính" value={fmtVnd(850000)} tone="neutral" />
      </section>

      <Recommendations onApply={(r) => toast.success(`Đã tạo tác vụ: ${r.action}`)} />
      <ToolsGrid onOpen={setSelectedTool} />
      <ToolModal tool={selectedTool} onClose={() => setSelectedTool(null)} />
    </div>
  );
}

function OwnerAgentCard({ prompt, setPrompt, messages, onAsk }: { prompt: string; setPrompt: (v: string) => void; messages: { role: "ai" | "user"; text: string }[]; onAsk: () => void }) {
  return (
    <section className="flex flex-col rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]"><Brain size={20} /></span>
          <div>
            <p className="d-eyebrow">Owner Agent</p>
            <h3 className="text-[length:var(--d-fs-h3)] font-semibold">Trợ lý chủ quán</h3>
          </div>
        </div>
        <Badge tone="ok">Đang lắng nghe</Badge>
      </header>
      <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto p-[var(--d-s-4)]">
        {messages.map((m, i) => (
          <div key={i} className={cn("max-w-[85%] rounded-[var(--d-r-md)] px-3 py-2 text-[length:var(--d-fs-sm)]", m.role === "user" ? "self-end bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "self-start bg-[var(--d-surface-2)] text-[var(--d-text)]")}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--d-line)] p-[var(--d-s-3)]">
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }} placeholder="Hỏi bất kỳ điều gì về quán..." className="h-10 flex-1 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20" />
        <Button variant="primary" size="md" onClick={onAsk}><Send size={15} /> Gửi</Button>
      </div>
    </section>
  );
}

function MorningBrief({ onSend }: { onSend: () => void }) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-5)] shadow-[var(--d-sh-sm)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="d-eyebrow text-[var(--d-orange-600)]">Morning Brief</p>
          <h3 className="text-[length:var(--d-fs-h3)] font-semibold">Tóm tắt ca · 7:00</h3>
        </div>
        <Badge tone="info">Telegram</Badge>
      </div>
      <ul className="flex flex-col gap-1.5 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
        <li><span className="font-semibold text-[var(--d-text)]">Doanh thu hôm qua:</span> 8.6tr (+12%)</li>
        <li><span className="font-semibold text-[var(--d-text)]">Đơn:</span> 47 đã xong, 3 đang chờ thu</li>
        <li><span className="font-semibold text-[var(--d-text)]">Cảnh báo:</span> Sữa tươi còn 2 lít, đá viên hết</li>
        <li><span className="font-semibold text-[var(--d-text)]">Đặt bàn tối:</span> 2 bàn 19:00 + 19:30</li>
      </ul>
      <Button variant="primary" size="md" onClick={onSend} className="mt-1"><Send size={15} /> Gửi sang Telegram</Button>
    </section>
  );
}

function Recommendations({ onApply }: { onApply: (r: Recommendation) => void }) {
  const [items, setItems] = useState(RECS);
  const dismiss = (id: string) => setItems((p) => p.filter((r) => r.id !== id));

  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
      <header className="flex items-center justify-between border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">
        <div>
          <p className="d-eyebrow">AI Recommendation Deck</p>
          <h3 className="text-[length:var(--d-fs-h3)] font-semibold">Khuyến nghị vận hành</h3>
        </div>
        <span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Cập nhật 2 phút trước</span>
      </header>
      {items.length === 0 ? (
        <div className="p-[var(--d-s-5)]"><EmptyState icon={<Lightbulb size={20} />} title="Đã xử lý hết khuyến nghị" description="AI sẽ tạo gợi ý mới khi có dữ liệu mới." /></div>
      ) : (
        <div className="divide-y divide-[var(--d-line)]">
          {items.map((r) => {
            const p = PRIORITY[r.priority];
            return (
              <article key={r.id} className="flex flex-col gap-2 px-[var(--d-s-5)] py-[var(--d-s-4)] sm:flex-row sm:items-center sm:gap-4">
                <span className="flex-none"><Badge tone={p.tone}>{p.label}</Badge></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{r.title}</p>
                  <p className="mt-0.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{r.detail}</p>
                </div>
                <span className="d-num shrink-0 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-ok-fg)]">{r.impact}</span>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => dismiss(r.id)}>Bỏ qua</Button>
                  <Button variant="primary" size="sm" onClick={() => { onApply(r); dismiss(r.id); }}>{r.action} <ArrowRight size={13} /></Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ToolsGrid({ onOpen }: { onOpen: (t: Tool) => void }) {
  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
      <header className="border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">
        <p className="d-eyebrow">Bộ công cụ AI</p>
        <h3 className="text-[length:var(--d-fs-h3)] font-semibold">Khoảng dùng theo gói</h3>
      </header>
      <div className="grid gap-[var(--d-s-3)] p-[var(--d-s-4)] sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => {
          const pct = t.quotaCap > 0 ? Math.round((t.quotaUsed / t.quotaCap) * 100) : 0;
          return (
            <article key={t.key} className="flex flex-col gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)] transition hover:border-[var(--d-line-strong)] hover:bg-[var(--d-surface)]">
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]">{t.icon}</span>
                {t.premium ? <Badge tone="orange">Premium</Badge> : null}
              </div>
              <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{t.title}</p>
              <p className="line-clamp-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{t.desc}</p>
              {t.quotaCap > 0 ? (
                <div>
                  <div className="flex justify-between text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]"><span>Đã dùng</span><span className="d-num">{t.quotaUsed}/{t.quotaCap}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--d-surface-3)]"><span className="block h-full rounded-full bg-[var(--d-jade)]" style={{ width: `${pct}%` }} /></div>
                </div>
              ) : (
                <p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">Cần nâng cấp gói Premium</p>
              )}
              <Button variant={t.premium ? "secondary" : "primary"} size="sm" onClick={() => onOpen(t)} className="mt-1">{t.premium ? "Xem chi tiết" : "Mở công cụ"} <ArrowRight size={13} /></Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ToolModal({ tool, onClose }: { tool: Tool | null; onClose: () => void }) {
  if (!tool) return null;
  return (
    <Modal open={Boolean(tool)} onClose={onClose} size="md" title={tool.title} subtitle="LogiBot AI" headerMeta={tool.premium ? <Badge tone="orange">Cần Premium</Badge> : <Badge tone="ok">Đang dùng</Badge>} footer={<div className="flex justify-end gap-2"><Button variant="secondary" size="md" onClick={onClose}>Đóng</Button><Button variant="primary" size="md" onClick={onClose}><Check size={15} /> Mở công cụ</Button></div>}>
      <div className="flex flex-col gap-[var(--d-s-4)]">
        <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{tool.desc}</p>
        {tool.quotaCap > 0 ? (
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
            <div className="flex justify-between text-[length:var(--d-fs-xs)]"><span className="text-[var(--d-text-muted)]">Lượt dùng tháng này</span><span className="d-num font-bold">{tool.quotaUsed} / {tool.quotaCap}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--d-surface-3)]"><span className="block h-full rounded-full bg-[var(--d-jade)]" style={{ width: `${(tool.quotaUsed / tool.quotaCap) * 100}%` }} /></div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
