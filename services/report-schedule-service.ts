import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatVnd } from "@/lib/money";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { getAdminReport, type AdminReport } from "@/services/dashboard-report-service";
import { buildAdminReportCsv } from "@/services/report-export-service";

export type ReportFrequency = "weekly" | "monthly" | "yearly";
export type ReportScheduleSettings = {
  id: string;
  restaurantId: string;
  enabled: boolean;
  frequency: ReportFrequency;
  recipients: string[];
  sendHour: number;
  sendDayOfWeek: number;
  sendDayOfMonth: number;
  sendMonth: number;
  timezone: string;
  includeCsv: boolean;
  includeJson: boolean;
  lastSentAt: string | null;
  nextRunAt: string | null;
};

type ReportScheduleRow = {
  id: string;
  restaurant_id: string;
  enabled: boolean;
  frequency: ReportFrequency;
  recipients: string[];
  send_hour: number;
  send_day_of_week: number;
  send_day_of_month: number;
  send_month: number;
  timezone: string;
  include_csv: boolean;
  include_json: boolean;
  last_sent_at: string | null;
  next_run_at: string | null;
  restaurant?: { name: string; slug: string; contact_email: string | null } | null;
};

type UpdateReportScheduleInput = {
  enabled: boolean;
  frequency: ReportFrequency;
  recipients: string[];
  sendHour: number;
  sendDayOfWeek: number;
  sendDayOfMonth: number;
  sendMonth: number;
  includeCsv: boolean;
  includeJson: boolean;
};

const reportTimezone = "Asia/Ho_Chi_Minh";
const vietnamUtcOffsetHours = 7;

function mapSchedule(row: ReportScheduleRow): ReportScheduleSettings {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    enabled: row.enabled,
    frequency: row.frequency,
    recipients: row.recipients ?? [],
    sendHour: row.send_hour,
    sendDayOfWeek: row.send_day_of_week,
    sendDayOfMonth: row.send_day_of_month,
    sendMonth: row.send_month,
    timezone: row.timezone,
    includeCsv: row.include_csv,
    includeJson: row.include_json,
    lastSentAt: row.last_sent_at,
    nextRunAt: row.next_run_at
  };
}

function normalizeRecipients(recipients: string[]) {
  return [...new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function toVietnamLocalParts(date: Date) {
  const shifted = new Date(date.getTime() + vietnamUtcOffsetHours * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours()
  };
}

function vietnamLocalToUtc(year: number, monthIndex: number, day: number, hour: number) {
  return new Date(Date.UTC(year, monthIndex, day, hour - vietnamUtcOffsetHours, 0, 0, 0));
}

function nextWeeklyRun(now: Date, input: Pick<UpdateReportScheduleInput, "sendDayOfWeek" | "sendHour">) {
  const local = toVietnamLocalParts(now);
  const todayUtc = new Date(Date.UTC(local.year, local.monthIndex, local.day));
  const jsDay = todayUtc.getUTCDay();
  const todayIsoDay = jsDay === 0 ? 7 : jsDay;
  let addDays = input.sendDayOfWeek - todayIsoDay;
  if (addDays < 0 || (addDays === 0 && local.hour >= input.sendHour)) addDays += 7;
  const target = new Date(todayUtc.getTime() + addDays * 24 * 60 * 60 * 1000);
  return vietnamLocalToUtc(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), input.sendHour);
}

function nextMonthlyRun(now: Date, input: Pick<UpdateReportScheduleInput, "sendDayOfMonth" | "sendHour">) {
  const local = toVietnamLocalParts(now);
  let year = local.year;
  let monthIndex = local.monthIndex;
  let day = Math.min(input.sendDayOfMonth, daysInMonth(year, monthIndex));
  let candidate = vietnamLocalToUtc(year, monthIndex, day, input.sendHour);

  if (candidate <= now) {
    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
    day = Math.min(input.sendDayOfMonth, daysInMonth(year, monthIndex));
    candidate = vietnamLocalToUtc(year, monthIndex, day, input.sendHour);
  }

  return candidate;
}

function nextYearlyRun(now: Date, input: Pick<UpdateReportScheduleInput, "sendMonth" | "sendDayOfMonth" | "sendHour">) {
  const local = toVietnamLocalParts(now);
  let year = local.year;
  const monthIndex = input.sendMonth - 1;
  let day = Math.min(input.sendDayOfMonth, daysInMonth(year, monthIndex));
  let candidate = vietnamLocalToUtc(year, monthIndex, day, input.sendHour);

  if (candidate <= now) {
    year += 1;
    day = Math.min(input.sendDayOfMonth, daysInMonth(year, monthIndex));
    candidate = vietnamLocalToUtc(year, monthIndex, day, input.sendHour);
  }

  return candidate;
}

export function calculateNextReportRunAt(input: UpdateReportScheduleInput, now = new Date()) {
  if (!input.enabled || input.recipients.length === 0) return null;
  if (input.frequency === "weekly") return nextWeeklyRun(now, input).toISOString();
  if (input.frequency === "monthly") return nextMonthlyRun(now, input).toISOString();
  return nextYearlyRun(now, input).toISOString();
}

function startOfWeekMonday(date: Date) {
  const day = date.getUTCDay();
  const isoDay = day === 0 ? 7 : day;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - isoDay + 1);
  return start;
}

function reportPeriodRange(frequency: ReportFrequency, anchor = new Date()) {
  const local = toVietnamLocalParts(anchor);
  const localToday = new Date(Date.UTC(local.year, local.monthIndex, local.day));

  if (frequency === "weekly") {
    const thisWeekStart = startOfWeekMonday(localToday);
    const end = new Date(thisWeekStart);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return { start, end };
  }

  if (frequency === "monthly") {
    const start = new Date(Date.UTC(local.year, local.monthIndex - 1, 1));
    const end = new Date(Date.UTC(local.year, local.monthIndex, 0));
    return { start, end };
  }

  return {
    start: new Date(Date.UTC(local.year - 1, 0, 1)),
    end: new Date(Date.UTC(local.year - 1, 11, 31))
  };
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function frequencyLabel(frequency: ReportFrequency) {
  if (frequency === "weekly") return "tuần";
  if (frequency === "monthly") return "tháng";
  return "năm";
}

function buildReportEmailHtml({
  restaurantName,
  frequency,
  periodStart,
  periodEnd,
  report
}: {
  restaurantName: string;
  frequency: ReportFrequency;
  periodStart: Date;
  periodEnd: Date;
  report: AdminReport;
}) {
  const topItems = report.topItems.slice(0, 5);
  const categoryRows = report.categoryRows.slice(0, 5);

  return `<!doctype html>
<html lang="vi">
  <body style="margin:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;color:#0F172A;">
    <div style="max-width:720px;margin:0 auto;padding:28px;">
      <div style="border:1px solid #E2E8F0;border-radius:20px;background:#FFFFFF;overflow:hidden;">
        <div style="padding:24px 28px;background:#0F4D3A;color:#FFFFFF;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.78;">LogiVN Report</div>
          <h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;">Báo cáo ${frequencyLabel(frequency)} - ${restaurantName}</h1>
          <p style="margin:10px 0 0;opacity:.82;">Kỳ ${dateOnly(periodStart)} đến ${dateOnly(periodEnd)}</p>
        </div>
        <div style="padding:24px 28px;">
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
            ${[
              ["Doanh thu", formatVnd(report.monthRevenue)],
              ["Số đơn", report.monthOrders.toLocaleString("vi-VN")],
              ["Giá trị đơn TB", formatVnd(report.averageTicket)],
              ["Chưa thanh toán", formatVnd(report.unpaidAmount)]
            ]
              .map(
                ([label, value]) =>
                  `<div style="border:1px solid #E2E8F0;border-radius:14px;padding:14px;background:#F8FAFC;"><div style="font-size:12px;color:#64748B;font-weight:700;">${label}</div><div style="font-size:22px;font-weight:800;margin-top:6px;">${value}</div></div>`
              )
              .join("")}
          </div>
          <h2 style="font-size:18px;margin:26px 0 12px;">Top món bán chạy</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${topItems
              .map(
                (item) =>
                  `<tr><td style="border-top:1px solid #E2E8F0;padding:10px 0;font-weight:700;">${item.name}</td><td style="border-top:1px solid #E2E8F0;padding:10px 0;text-align:right;">${item.quantity} lượt · ${formatVnd(item.revenue)}</td></tr>`
              )
              .join("") || `<tr><td style="padding:12px 0;color:#64748B;">Chưa có dữ liệu món bán.</td></tr>`}
          </table>
          <h2 style="font-size:18px;margin:26px 0 12px;">Danh mục hiệu quả</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${categoryRows
              .map(
                (row) =>
                  `<tr><td style="border-top:1px solid #E2E8F0;padding:10px 0;font-weight:700;">${row.name}</td><td style="border-top:1px solid #E2E8F0;padding:10px 0;text-align:right;">${row.quantity} món · ${formatVnd(row.revenue)}</td></tr>`
              )
              .join("") || `<tr><td style="padding:12px 0;color:#64748B;">Chưa có dữ liệu danh mục.</td></tr>`}
          </table>
          <p style="margin-top:24px;color:#64748B;font-size:13px;">Báo cáo này được gửi tự động theo cấu hình trong dashboard LogiVN. File CSV/JSON được đính kèm nếu quán đã bật.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function sendEmail({
  to,
  subject,
  html,
  attachments
}: {
  to: string[];
  subject: string;
  html: string;
  attachments: Array<{ filename: string; content: string }>;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM ?? process.env.RESEND_FROM ?? "LogiVN <reports@logivn.com>";

  if (!apiKey) {
    throw new AppError("Thiếu RESEND_API_KEY để gửi email báo cáo", 500);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      attachments
    })
  });
  const json = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!response.ok) {
    throw new AppError(json?.message ?? "Resend từ chối gửi email báo cáo", 502);
  }

  return { providerMessageId: json?.id ?? null, raw: json };
}

export async function getReportScheduleForRestaurant(restaurantId: string, fallbackEmail: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("report_schedules")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  throwIfSupabaseError(error);

  if (data) return mapSchedule(data as ReportScheduleRow);

  const recipients = normalizeRecipients([fallbackEmail]);
  const { data: inserted, error: insertError } = await supabase
    .from("report_schedules")
    .insert({
      restaurant_id: restaurantId,
      enabled: false,
      frequency: "weekly",
      recipients,
      send_hour: 8,
      send_day_of_week: 1,
      send_day_of_month: 1,
      send_month: 1,
      timezone: reportTimezone,
      include_csv: true,
      include_json: false,
      next_run_at: null
    })
    .select("*")
    .single();
  throwIfSupabaseError(insertError);
  return mapSchedule(inserted as ReportScheduleRow);
}

export async function updateReportSchedule(restaurantId: string, input: UpdateReportScheduleInput) {
  const supabase = createAdminSupabaseClient() as any;
  const recipients = normalizeRecipients(input.recipients);
  const nextRunAt = calculateNextReportRunAt({ ...input, recipients });

  const { data, error } = await supabase
    .from("report_schedules")
    .upsert(
      {
        restaurant_id: restaurantId,
        enabled: input.enabled && recipients.length > 0,
        frequency: input.frequency,
        recipients,
        send_hour: input.sendHour,
        send_day_of_week: input.sendDayOfWeek,
        send_day_of_month: input.sendDayOfMonth,
        send_month: input.sendMonth,
        timezone: reportTimezone,
        include_csv: input.includeCsv,
        include_json: input.includeJson,
        next_run_at: nextRunAt
      },
      { onConflict: "restaurant_id" }
    )
    .select("*")
    .single();

  throwIfSupabaseError(error);
  return mapSchedule(data as ReportScheduleRow);
}

export async function listRecentReportLogs(restaurantId: string, limit = 8) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("report_send_logs")
    .select("id,period_type,period_start,period_end,recipient_emails,status,subject,error_message,sent_at,created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwIfSupabaseError(error);
  return (data ?? []) as Array<{
    id: string;
    period_type: ReportFrequency;
    period_start: string;
    period_end: string;
    recipient_emails: string[];
    status: "queued" | "sent" | "failed" | "skipped";
    subject: string | null;
    error_message: string | null;
    sent_at: string | null;
    created_at: string;
  }>;
}

async function writeReportLog(input: {
  restaurantId: string;
  scheduleId: string | null;
  frequency: ReportFrequency;
  periodStart: Date;
  periodEnd: Date;
  recipients: string[];
  status: "sent" | "failed" | "skipped";
  subject: string;
  provider?: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  rawData?: unknown;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("report_send_logs").insert({
    restaurant_id: input.restaurantId,
    schedule_id: input.scheduleId,
    period_type: input.frequency,
    period_start: dateOnly(input.periodStart),
    period_end: dateOnly(input.periodEnd),
    recipient_emails: input.recipients,
    status: input.status,
    subject: input.subject,
    provider: input.provider ?? "resend",
    provider_message_id: input.providerMessageId ?? null,
    error_message: input.errorMessage ?? null,
    raw_data: input.rawData ?? {},
    sent_at: input.status === "sent" ? new Date().toISOString() : null
  });
  throwIfSupabaseError(error);
}

export async function sendDueScheduledReports({
  now = new Date(),
  limit = 25,
  maxBatches = 1
}: {
  now?: Date;
  limit?: number;
  maxBatches?: number;
} = {}) {
  const supabase = createAdminSupabaseClient() as any;
  const results: Array<{ scheduleId: string; restaurantId: string; status: "sent" | "failed" | "skipped"; error?: string }> = [];
  let batches = 0;
  let hasMore = false;

  while (batches < maxBatches) {
    const { data, error } = await supabase
      .from("report_schedules")
      .select("*,restaurant:restaurants(name,slug,contact_email)")
      .eq("enabled", true)
      .lte("next_run_at", now.toISOString())
      .order("next_run_at", { ascending: true })
      .limit(limit);
    throwIfSupabaseError(error);

    const schedules = (data ?? []) as ReportScheduleRow[];
    if (schedules.length === 0) break;

    batches += 1;
    hasMore = schedules.length === limit;

    for (const schedule of schedules) {
      const recipients = normalizeRecipients(schedule.recipients);
      const period = reportPeriodRange(schedule.frequency, now);
      const subject = `LogiVN - Báo cáo ${frequencyLabel(schedule.frequency)} ${schedule.restaurant?.name ?? ""} (${dateOnly(period.start)} - ${dateOnly(period.end)})`;

      try {
        if (recipients.length === 0) {
          await writeReportLog({
            restaurantId: schedule.restaurant_id,
            scheduleId: schedule.id,
            frequency: schedule.frequency,
            periodStart: period.start,
            periodEnd: period.end,
            recipients,
            status: "skipped",
            subject,
            errorMessage: "Không có email nhận báo cáo"
          });
          results.push({ scheduleId: schedule.id, restaurantId: schedule.restaurant_id, status: "skipped" });
        } else {
          const reportAnchor = new Date(period.end.getTime() + 12 * 60 * 60 * 1000);
          const report = await getAdminReport(schedule.restaurant_id, { period: schedule.frequency, now: reportAnchor });
          const csv = buildAdminReportCsv(report);
          const attachments = [
            ...(schedule.include_csv
              ? [{ filename: `logivn-report-${schedule.frequency}-${dateOnly(period.end)}.csv`, content: Buffer.from(csv).toString("base64") }]
              : []),
            ...(schedule.include_json
              ? [{ filename: `logivn-report-${schedule.frequency}-${dateOnly(period.end)}.json`, content: Buffer.from(JSON.stringify(report, null, 2)).toString("base64") }]
              : [])
          ];

          const email = await sendEmail({
            to: recipients,
            subject,
            html: buildReportEmailHtml({
              restaurantName: schedule.restaurant?.name ?? "Nhà hàng",
              frequency: schedule.frequency,
              periodStart: period.start,
              periodEnd: period.end,
              report
            }),
            attachments
          });

          await writeReportLog({
            restaurantId: schedule.restaurant_id,
            scheduleId: schedule.id,
            frequency: schedule.frequency,
            periodStart: period.start,
            periodEnd: period.end,
            recipients,
            status: "sent",
            subject,
            providerMessageId: email.providerMessageId,
            rawData: email.raw
          });
          results.push({ scheduleId: schedule.id, restaurantId: schedule.restaurant_id, status: "sent" });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không gửi được báo cáo";
        await writeReportLog({
          restaurantId: schedule.restaurant_id,
          scheduleId: schedule.id,
          frequency: schedule.frequency,
          periodStart: period.start,
          periodEnd: period.end,
          recipients,
          status: "failed",
          subject,
          errorMessage: message
        });
        results.push({ scheduleId: schedule.id, restaurantId: schedule.restaurant_id, status: "failed", error: message });
      } finally {
        const nextRunAt = calculateNextReportRunAt(
          {
            enabled: schedule.enabled,
            frequency: schedule.frequency,
            recipients,
            sendHour: schedule.send_hour,
            sendDayOfWeek: schedule.send_day_of_week,
            sendDayOfMonth: schedule.send_day_of_month,
            sendMonth: schedule.send_month,
            includeCsv: schedule.include_csv,
            includeJson: schedule.include_json
          },
          new Date(now.getTime() + 60_000)
        );

        const { error: updateError } = await supabase
          .from("report_schedules")
          .update({
            last_sent_at: new Date().toISOString(),
            next_run_at: nextRunAt
          })
          .eq("id", schedule.id);
        throwIfSupabaseError(updateError);
      }
    }

    if (schedules.length < limit) {
      hasMore = false;
      break;
    }
  }

  return {
    batches,
    hasMore: hasMore && batches === maxBatches,
    processed: results.length,
    results
  };
}
