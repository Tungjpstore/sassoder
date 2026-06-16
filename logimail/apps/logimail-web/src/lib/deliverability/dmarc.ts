import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import {
  DmarcParseError,
  parseAggregateReport,
  printAggregateReport,
  rowPassCount,
  type AggregateReport,
} from '@/lib/deliverability/dmarc-format';

// DMARC_Ingestor (Requirement 6): parse aggregate reports, persist one row per
// source record, and summarize pass-rate (30-day window, paginated).

export { parseAggregateReport, printAggregateReport, DmarcParseError };

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('dmarc_not_configured');
  return client;
}

function unixToDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** Parse + persist a DMARC aggregate report (R6.1). One row per source record. */
export async function ingestDmarcReport(input: { domainId: string; workspaceId: string; xml: string; actorId?: string | null }): Promise<{ inserted: number; report: AggregateReport }> {
  const report = parseAggregateReport(input.xml); // throws DmarcParseError on invalid XML (R6.2)
  const db = store();

  const reportStart = unixToDate(report.dateBegin);
  const reportEnd = unixToDate(report.dateEnd);

  const rows = report.records.map((record) => {
    const passCount = rowPassCount(record);
    return {
      workspace_id: input.workspaceId,
      domain_id: input.domainId,
      report_domain: record.headerFrom || report.policyDomain,
      source_ip: record.sourceIp || null,
      disposition: record.disposition,
      dkim_result: record.dkim,
      spf_result: record.spf,
      message_count: record.count,
      pass_count: passCount,
      fail_count: Math.max(0, record.count - passCount),
      report_start: reportStart,
      report_end: reportEnd,
      metadata: { reportId: report.reportId, orgName: report.orgName },
    };
  });

  if (rows.length > 0) {
    const { error } = await db.from('dmarc_reports').insert(rows);
    if (error) throw new Error(supabaseErrorMessage(error));
  }

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? 'dmarc-ingestor',
    action: 'logimail.dmarc_ingested',
    targetType: 'domain',
    targetId: input.domainId,
    metadata: { reportId: report.reportId, records: rows.length },
  });

  return { inserted: rows.length, report };
}

export type DmarcSummary = {
  windowDays: number;
  messageCount: number;
  passCount: number;
  failCount: number;
  passRate: number; // 0..1
  rows: Array<{ report_domain: string; source_ip: string | null; disposition: string | null; message_count: number; pass_count: number; fail_count: number; report_start: string | null; created_at: string }>;
};

/** Pass-rate summary over the trailing window (default 30 days), paginated to 200 (R6.5, R6.6). */
export async function getDmarcSummary(input: { domainId: string; windowDays?: number; limit?: number }): Promise<DmarcSummary> {
  const db = store();
  const windowDays = input.windowDays ?? 30;
  const limit = Math.min(200, Math.max(1, input.limit ?? 200));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('dmarc_reports')
    .select('report_domain,source_ip,disposition,message_count,pass_count,fail_count,report_start,created_at')
    .eq('domain_id', input.domainId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(supabaseErrorMessage(error));

  const rows = (data ?? []) as DmarcSummary['rows'];
  let messageCount = 0;
  let passCount = 0;
  let failCount = 0;
  for (const row of rows) {
    messageCount += row.message_count;
    passCount += row.pass_count;
    failCount += row.fail_count;
  }

  return {
    windowDays,
    messageCount,
    passCount,
    failCount,
    passRate: messageCount > 0 ? passCount / messageCount : 0,
    rows,
  };
}

export function dmarcError(error: unknown) {
  if (error instanceof DmarcParseError) return { status: 400, text: error.message };
  const message = error instanceof Error ? error.message : String(error ?? 'dmarc_error');
  if (message === 'dmarc_not_configured') return { status: 503, text: 'Thiếu service role cho DMARC.' };
  return { status: 502, text: message };
}
