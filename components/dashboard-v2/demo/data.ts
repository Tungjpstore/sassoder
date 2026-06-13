/* ============================================================
 * data.ts — single source of truth cho mọi demo workspace.
 * Mục tiêu: 1 đơn xuất hiện ở overview → orders → kitchen → payments
 * cùng id, cùng số tiền, cùng bàn, cùng món. Không lạc nhịp.
 * ============================================================ */

export type DemoChannel = "qr" | "takeaway" | "delivery";
export type DemoStatus = "new" | "cooking" | "ready" | "payment" | "done";
export type DemoStation = "drink" | "hot" | "mixed";

export type DemoItem = {
  name: string;
  qty: number;
  price: number;
  station: "drink" | "hot";
  note?: string;
  done?: boolean;
};

export type DemoOrder = {
  id: string;
  code: string;
  table: string;
  tableId?: string;
  channel: DemoChannel;
  customer?: { name: string; phone?: string; address?: string };
  delivery?: { distanceKm: number; etaMin: number; driverName?: string; driverPhone?: string; progress: number };
  items: DemoItem[];
  startedAt: number; // ms epoch
  status: DemoStatus;
  paymentMethod: "vietqr" | "cash" | "card";
  paymentStatus: "unpaid" | "pending" | "paid";
  vip?: boolean;
};

export type DemoTable = {
  id: string;
  name: string;
  seats: number;
  zone: "in" | "garden" | "vip";
  x: number;
  y: number;
  server?: string;
  reservedFor?: string;
};

const NOW = Date.now();
const minAgo = (m: number) => NOW - m * 60_000;

/* ── Tables: dùng chung cho tables-demo, overview, reservations ── */
export const DEMO_TABLES: DemoTable[] = [
  { id: "t01", name: "01", seats: 2, zone: "in", x: 14, y: 26 },
  { id: "t02", name: "02", seats: 4, zone: "in", x: 34, y: 26, server: "Tú" },
  { id: "t04", name: "04", seats: 4, zone: "in", x: 54, y: 26, server: "Hà" },
  { id: "t07", name: "07", seats: 6, zone: "in", x: 74, y: 26, server: "Tú" },
  { id: "t09", name: "09", seats: 2, zone: "garden", x: 22, y: 74, server: "Lan" },
  { id: "t12", name: "12", seats: 4, zone: "garden", x: 46, y: 74, reservedFor: "Anh Bình · 19:00" },
  { id: "t15", name: "15", seats: 8, zone: "garden", x: 70, y: 74, reservedFor: "Chị Lan · 19:30" },
  { id: "t16", name: "16", seats: 4, zone: "garden", x: 88, y: 74 }
];

/* ── Order pool: mỗi đơn có context đầy đủ ── */
export const DEMO_ORDERS: DemoOrder[] = [
  {
    id: "ord-001",
    code: "#A02-241",
    table: "Bàn 02",
    tableId: "t02",
    channel: "qr",
    items: [
      { name: "Cà phê sữa đá", qty: 1, price: 25_000, station: "drink", note: "Ít đường" },
      { name: "Bạc xỉu", qty: 1, price: 30_000, station: "drink" }
    ],
    startedAt: minAgo(0.5),
    status: "new",
    paymentMethod: "vietqr",
    paymentStatus: "unpaid"
  },
  {
    id: "ord-002",
    code: "#A09-242",
    table: "Bàn 09",
    tableId: "t09",
    channel: "qr",
    items: [
      { name: "Trà đào cam sả", qty: 1, price: 35_000, station: "drink" },
      { name: "Bánh mì thịt", qty: 1, price: 30_000, station: "hot" },
      { name: "Latte", qty: 1, price: 40_000, station: "drink" }
    ],
    startedAt: minAgo(1),
    status: "new",
    paymentMethod: "vietqr",
    paymentStatus: "unpaid"
  },
  {
    id: "ord-003",
    code: "#T91-243",
    table: "Mang đi #91",
    channel: "takeaway",
    customer: { name: "Anh Khoa", phone: "0901 222 333" },
    items: [{ name: "Americano đá", qty: 1, price: 35_000, station: "drink" }],
    startedAt: minAgo(2),
    status: "new",
    paymentMethod: "vietqr",
    paymentStatus: "paid"
  },
  {
    id: "ord-004",
    code: "#A04-244",
    table: "Bàn 04",
    tableId: "t04",
    channel: "qr",
    items: [
      { name: "Cà phê sữa", qty: 1, price: 25_000, station: "drink", done: true },
      { name: "Bạc xỉu", qty: 1, price: 30_000, station: "drink" }
    ],
    startedAt: minAgo(3),
    status: "cooking",
    paymentMethod: "vietqr",
    paymentStatus: "unpaid"
  },
  {
    id: "ord-005",
    code: "#A12-245",
    table: "Bàn 12",
    tableId: "t12",
    channel: "qr",
    vip: true,
    items: [
      { name: "Trà đào cam sả", qty: 1, price: 35_000, station: "drink", done: true },
      { name: "Bánh mì thịt", qty: 1, price: 30_000, station: "hot" },
      { name: "Latte", qty: 1, price: 40_000, station: "drink" },
      { name: "Bánh quy bơ", qty: 2, price: 31_500, station: "hot" }
    ],
    startedAt: minAgo(8),
    status: "cooking",
    paymentMethod: "vietqr",
    paymentStatus: "unpaid"
  },
  {
    id: "ord-006",
    code: "#G20-246",
    table: "Giao #20",
    channel: "delivery",
    customer: { name: "Chị Lan", phone: "0905 123 456", address: "23 Nguyễn Văn Linh, Hải Châu" },
    delivery: { distanceKm: 2.4, etaMin: 12, driverName: "Tài xế Hùng", driverPhone: "0912 888 777", progress: 0.55 },
    items: [
      { name: "Combo cơm gà", qty: 1, price: 75_000, station: "hot" },
      { name: "Canh chua", qty: 1, price: 35_000, station: "hot" },
      { name: "Trà đào", qty: 1, price: 35_000, station: "drink" }
    ],
    startedAt: minAgo(5),
    status: "cooking",
    paymentMethod: "vietqr",
    paymentStatus: "paid"
  },
  {
    id: "ord-007",
    code: "#T88-247",
    table: "Mang đi #88",
    channel: "takeaway",
    customer: { name: "Khách mang đi", phone: "0988 222 111" },
    items: [{ name: "Americano đá", qty: 1, price: 35_000, station: "drink", done: true }],
    startedAt: minAgo(0),
    status: "ready",
    paymentMethod: "vietqr",
    paymentStatus: "pending"
  },
  {
    id: "ord-008",
    code: "#A07-248",
    table: "Bàn 07",
    tableId: "t07",
    channel: "qr",
    items: [
      { name: "Phở bò tái", qty: 1, price: 55_000, station: "hot", done: true },
      { name: "Trà chanh", qty: 1, price: 25_000, station: "drink", done: true },
      { name: "Caramen", qty: 1, price: 20_000, station: "hot", done: true }
    ],
    startedAt: minAgo(12),
    status: "payment",
    paymentMethod: "vietqr",
    paymentStatus: "pending"
  }
];

/* ── Helpers ── */
export const fmtVnd = (n: number) => `${n.toLocaleString("vi-VN")}₫`;
export const orderTotal = (o: DemoOrder) => o.items.reduce((s, i) => s + i.price * i.qty, 0);
export const orderQty = (o: DemoOrder) => o.items.reduce((s, i) => s + i.qty, 0);
export const elapsedMin = (o: DemoOrder) => Math.max(0, Math.floor((Date.now() - o.startedAt) / 60_000));
export const tableOpenOrder = (orders: DemoOrder[], tableId: string) =>
  orders.find((o) => o.tableId === tableId && o.status !== "done");

/* Derive table status từ order pool — đảm bảo tables-demo nhất quán với orders */
export function deriveTableStatus(t: DemoTable, orders: DemoOrder[]): "available" | "serving" | "overdue" | "reserved" {
  const open = tableOpenOrder(orders, t.id);
  if (open) return elapsedMin(open) >= 30 ? "overdue" : "serving";
  if (t.reservedFor) return "reserved";
  return "available";
}

/* Status meta dùng chung — màu, label, CTA */
export const STATUS_META: Record<DemoStatus, { label: string; accent: string; chipBg: string; chipText: string; cta: string; next: DemoStatus }> = {
  new: { label: "Đơn mới", accent: "var(--d-orange)", chipBg: "var(--d-accent-soft)", chipText: "var(--d-orange-600)", cta: "Nhận & vào bếp", next: "cooking" },
  cooking: { label: "Đang làm", accent: "var(--d-info-fg)", chipBg: "var(--d-info-bg)", chipText: "var(--d-info-fg)", cta: "Báo đã ra món", next: "ready" },
  ready: { label: "Sẵn sàng", accent: "var(--d-ok-fg)", chipBg: "var(--d-ok-bg)", chipText: "var(--d-ok-fg)", cta: "Giao cho khách", next: "payment" },
  payment: { label: "Chờ thu", accent: "var(--d-jade)", chipBg: "var(--d-primary-soft)", chipText: "var(--d-primary)", cta: "Thu tiền", next: "done" },
  done: { label: "Hoàn tất", accent: "var(--d-text-faint)", chipBg: "var(--d-surface-2)", chipText: "var(--d-text-muted)", cta: "Đã xong", next: "done" }
};

export const CHANNEL_META: Record<DemoChannel, { label: string }> = {
  qr: { label: "QR tại bàn" },
  takeaway: { label: "Mang đi" },
  delivery: { label: "Giao hàng" }
};
