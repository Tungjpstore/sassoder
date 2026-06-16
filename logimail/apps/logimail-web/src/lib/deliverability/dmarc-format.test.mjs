import test from 'node:test';
import assert from 'node:assert/strict';

const { parseAggregateReport, printAggregateReport, DmarcParseError, rowPassCount } = await import('./dmarc-format.ts');

const SAMPLE = `<?xml version="1.0"?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc@google.com</email>
    <report_id>123456789</report_id>
    <date_range><begin>1749772800</begin><end>1749859200</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>logivn.com</domain>
    <p>none</p>
  </policy_published>
  <record>
    <row>
      <source_ip>203.0.113.10</source_ip>
      <count>42</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>logivn.com</header_from></identifiers>
  </record>
  <record>
    <row>
      <source_ip>198.51.100.5</source_ip>
      <count>7</count>
      <policy_evaluated><disposition>quarantine</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated>
    </row>
    <identifiers><header_from>mail.logivn.com</header_from></identifiers>
  </record>
</feedback>`;

test('parses a real-ish aggregate report (R6.1)', () => {
  const report = parseAggregateReport(SAMPLE);
  assert.equal(report.orgName, 'google.com');
  assert.equal(report.reportId, '123456789');
  assert.equal(report.policyDomain, 'logivn.com');
  assert.equal(report.records.length, 2);
  assert.equal(report.records[0].sourceIp, '203.0.113.10');
  assert.equal(report.records[0].count, 42);
  assert.equal(rowPassCount(report.records[0]), 42);
  assert.equal(rowPassCount(report.records[1]), 0);
});

test('rejects invalid XML with a parse error (R6.2)', () => {
  assert.throws(() => parseAggregateReport('not xml at all'), DmarcParseError);
  assert.throws(() => parseAggregateReport('<feedback></feedback>'), DmarcParseError); // missing metadata
  assert.throws(() => parseAggregateReport(''), DmarcParseError);
});

function randomReport() {
  const recordCount = Math.floor(Math.random() * 6);
  const dispositions = ['none', 'quarantine', 'reject'];
  const results = ['pass', 'fail'];
  const records = [];
  for (let i = 0; i < recordCount; i += 1) {
    records.push({
      sourceIp: `${1 + Math.floor(Math.random() * 223)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
      count: Math.floor(Math.random() * 10000),
      disposition: dispositions[Math.floor(Math.random() * dispositions.length)],
      dkim: results[Math.floor(Math.random() * results.length)],
      spf: results[Math.floor(Math.random() * results.length)],
      headerFrom: `sub${i}.example${Math.floor(Math.random() * 4)}.com`,
    });
  }
  const begin = 1_700_000_000 + Math.floor(Math.random() * 1_000_000);
  return {
    orgName: `org & co <${Math.floor(Math.random() * 100)}>`,
    reportId: `rpt-${Math.floor(Math.random() * 1e9)}`,
    dateBegin: begin,
    dateEnd: begin + 86_400,
    policyDomain: `example${Math.floor(Math.random() * 4)}.com`,
    records,
  };
}

// Property 1 (Validates Requirements 6.3, 6.4): for all valid reports,
// parse(print(parse(xml))) produces an equivalent record set (round-trip).
test('⚠ property: parse∘print∘parse round-trip is stable', () => {
  for (let i = 0; i < 600; i += 1) {
    const report = randomReport();
    const xml1 = printAggregateReport(report);
    const parsed1 = parseAggregateReport(xml1);
    const xml2 = printAggregateReport(parsed1);
    const parsed2 = parseAggregateReport(xml2);
    assert.deepEqual(parsed2, parsed1, `round-trip diverged at iteration ${i}`);
  }
});

test('round-trip is stable on the sample report', () => {
  const parsed = parseAggregateReport(SAMPLE);
  const reparsed = parseAggregateReport(printAggregateReport(parsed));
  assert.deepEqual(reparsed, parsed);
});
