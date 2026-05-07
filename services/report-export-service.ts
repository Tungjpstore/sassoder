import { formatVnd } from "@/lib/money";
import type { AdminReport } from "@/services/dashboard-report-service";

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function csvRow(values: Array<string | number | null | undefined>) {
  return values.map(csvCell).join(",");
}

function csvSection(title: string, rows: Array<Array<string | number | null | undefined>>) {
  return [csvRow([title]), ...rows.map(csvRow), ""].join("\n");
}

export function buildAdminReportCsv(report: AdminReport) {
  const sections = [
    csvSection("Tổng quan", [
      ["Chỉ số", "Giá trị"],
      ["Doanh thu tháng", report.monthRevenue],
      ["Số đơn tháng", report.monthOrders],
      ["Giá trị đơn trung bình", report.averageTicket],
      ["Đơn đã thanh toán", report.paidOrders],
      ["Công nợ/chưa thanh toán", report.unpaidAmount]
    ]),
    csvSection("Doanh thu theo ngày", [
      ["Ngày", "Doanh thu", "Số đơn"],
      ...report.dailyRevenue.map((row) => [row.label, row.revenue, row.orderCount])
    ]),
    csvSection("Top món bán chạy", [
      ["Món", "Danh mục", "Số lượng", "Doanh thu"],
      ...report.topItems.map((item) => [item.name, item.categoryName, item.quantity, item.revenue])
    ]),
    csvSection("Thanh toán", [
      ["Phương thức", "Số giao dịch", "Giá trị"],
      ...report.paymentRows.map((row) => [row.label, row.count, row.value])
    ]),
    csvSection("Giờ cao điểm", [
      ["Khung giờ", "Số đơn"],
      ...report.peakHours.map((row) => [row.label, row.count])
    ]),
    csvSection("Doanh thu theo danh mục", [
      ["Danh mục", "Doanh thu", "Số đơn", "Số món", "Giá trị đơn TB"],
      ...report.categoryRows.map((row) => [row.name, row.revenue, row.orderCount, row.quantity, row.averageTicket])
    ]),
    csvSection("Giao dịch gần đây", [
      ["Mã đơn", "Bàn/Kênh", "Phương thức", "Trạng thái", "Số tiền", "Thời gian"],
      ...report.paymentTransactions.map((row) => [
        row.id,
        row.tableName,
        row.method ?? "Chưa chọn",
        row.status,
        formatVnd(row.amount),
        row.createdAt
      ])
    ])
  ];

  return `\uFEFF${sections.join("\n")}`;
}
