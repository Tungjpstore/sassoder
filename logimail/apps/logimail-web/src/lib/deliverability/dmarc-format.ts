// Pure DMARC aggregate report parse/print (Requirement 6 / Property 1).
// A minimal tag-based parser for the well-defined DMARC aggregate structure;
// no external XML dependency so parse/print round-trip can be property-tested.

export class DmarcParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DmarcParseError';
  }
}

export type DmarcRecord = {
  sourceIp: string;
  count: number;
  disposition: string;
  dkim: string;
  spf: string;
  headerFrom: string;
};

export type AggregateReport = {
  orgName: string;
  reportId: string;
  dateBegin: number; // unix seconds
  dateEnd: number; // unix seconds
  policyDomain: string;
  records: DmarcRecord[];
};

function decode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function encode(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = re.exec(xml);
  return match ? match[1] : null;
}

function allTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) out.push(match[1]);
  return out;
}

function textOf(xml: string, tag: string): string {
  const value = firstTag(xml, tag);
  return value == null ? '' : decode(value.trim());
}

/** Parse a DMARC aggregate report XML into a normalized structure (R6.1, R6.2). */
export function parseAggregateReport(xml: string): AggregateReport {
  if (typeof xml !== 'string' || !/<feedback\b[^>]*>[\s\S]*<\/feedback>/i.test(xml)) {
    throw new DmarcParseError('Không tìm thấy phần tử <feedback> hợp lệ.');
  }

  const metadata = firstTag(xml, 'report_metadata');
  if (!metadata) throw new DmarcParseError('Thiếu <report_metadata>.');

  const dateRange = firstTag(metadata, 'date_range') ?? '';
  const beginRaw = textOf(dateRange, 'begin');
  const endRaw = textOf(dateRange, 'end');
  const dateBegin = Number(beginRaw);
  const dateEnd = Number(endRaw);
  if (!Number.isFinite(dateBegin) || !Number.isFinite(dateEnd)) {
    throw new DmarcParseError('date_range begin/end không hợp lệ.');
  }

  const policyPublished = firstTag(xml, 'policy_published') ?? '';
  const policyDomain = textOf(policyPublished, 'domain');

  const records: DmarcRecord[] = allTags(xml, 'record').map((recordXml) => {
    const row = firstTag(recordXml, 'row') ?? '';
    const policyEvaluated = firstTag(row, 'policy_evaluated') ?? '';
    const identifiers = firstTag(recordXml, 'identifiers') ?? '';
    const count = Number(textOf(row, 'count'));
    return {
      sourceIp: textOf(row, 'source_ip'),
      count: Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
      disposition: textOf(policyEvaluated, 'disposition') || 'none',
      dkim: textOf(policyEvaluated, 'dkim') || 'fail',
      spf: textOf(policyEvaluated, 'spf') || 'fail',
      headerFrom: textOf(identifiers, 'header_from') || policyDomain,
    };
  });

  return {
    orgName: textOf(metadata, 'org_name'),
    reportId: textOf(metadata, 'report_id'),
    dateBegin: Math.floor(dateBegin),
    dateEnd: Math.floor(dateEnd),
    policyDomain,
    records,
  };
}

/** Pretty-print a normalized report back into aggregate XML (R6.3). */
export function printAggregateReport(report: AggregateReport): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<feedback>');
  lines.push('  <report_metadata>');
  lines.push(`    <org_name>${encode(report.orgName)}</org_name>`);
  lines.push(`    <report_id>${encode(report.reportId)}</report_id>`);
  lines.push('    <date_range>');
  lines.push(`      <begin>${report.dateBegin}</begin>`);
  lines.push(`      <end>${report.dateEnd}</end>`);
  lines.push('    </date_range>');
  lines.push('  </report_metadata>');
  lines.push('  <policy_published>');
  lines.push(`    <domain>${encode(report.policyDomain)}</domain>`);
  lines.push('  </policy_published>');
  for (const record of report.records) {
    lines.push('  <record>');
    lines.push('    <row>');
    lines.push(`      <source_ip>${encode(record.sourceIp)}</source_ip>`);
    lines.push(`      <count>${record.count}</count>`);
    lines.push('      <policy_evaluated>');
    lines.push(`        <disposition>${encode(record.disposition)}</disposition>`);
    lines.push(`        <dkim>${encode(record.dkim)}</dkim>`);
    lines.push(`        <spf>${encode(record.spf)}</spf>`);
    lines.push('      </policy_evaluated>');
    lines.push('    </row>');
    lines.push('    <identifiers>');
    lines.push(`      <header_from>${encode(record.headerFrom)}</header_from>`);
    lines.push('    </identifiers>');
    lines.push('  </record>');
  }
  lines.push('</feedback>');
  return lines.join('\n');
}

/** DMARC alignment: a row passes if DKIM or SPF evaluated to pass (R6.1). */
export function rowPassCount(record: DmarcRecord): number {
  const aligned = record.dkim.toLowerCase() === 'pass' || record.spf.toLowerCase() === 'pass';
  return aligned ? record.count : 0;
}
