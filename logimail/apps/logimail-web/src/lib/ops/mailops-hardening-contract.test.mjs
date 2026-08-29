import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('alerts scan uses request-type-specific columns and reports the failed stage', () => {
  const alerting = source('./alerting.ts');
  const route = source('../../app/api/logimail/cron/alerts-scan/route.ts');

  assert.match(alerting, /account:\s*\{ table: 'account_requests', select: 'id,created_at' \}/);
  assert.match(alerting, /domain:\s*\{ table: 'domain_requests', select: 'id,workspace_id,created_at' \}/);
  assert.match(alerting, /\.select\(source\.select\)/);
  assert.match(route, /stage:\s*'bounce_rate' \| 'pending_sla'/);
  assert.match(route, /`\$\{stage\}: \$\{mapped\.text\}`/);
  assert.match(route, /\[logimail:alerts-scan\] failed/);
});

test('cron runner preserves HTTP status and response body on failure', () => {
  const cron = source('../../../../../infra/vps/logimail-run-cron.sh');

  assert.match(cron, /-w '%\{http_code\}'/);
  assert.match(cron, /FAILED curl=/);
  assert.match(cron, /FAILED HTTP/);
  assert.match(cron, /sed -n '1,40p'/);
});

test('mail send reserves quota and rate capacity before handing work to SMTP', () => {
  const mailClient = source('../mail-client.ts');
  const sendRoute = source('../../app/api/logimail/mail/send/route.ts');
  const quota = source('../deliverability/quota.ts');
  const antiAbuse = source('../anti-abuse.ts');

  assert.match(mailClient, /const quota = await enforceSendingQuota\(session\.email\)/);
  assert.match(mailClient, /if \(!quota\.allowed\) throw new Error\(quota\.reason/);
  assert.doesNotMatch(mailClient, /commitDomainQuotaUsage/);
  assert.match(quota, /rpc\('reserve_domain_send_quota'/);
  assert.match(antiAbuse, /rpc\('reserve_mailbox_send_rate'/);
  assert.match(sendRoute, /validateSendInput\(input\)/);
  assert.match(sendRoute, /await enforceMailboxSendRate/);
  assert.match(sendRoute, /quotaCommitStatus/);
});

test('runbooks declare ingest, queue and backup production gates', () => {
  const monitoring = source('../../../../../docs/monitoring.md');
  const backup = source('../../../../../docs/backup-restore.md');

  assert.match(monitoring, /LOGIMAIL_INGEST_KEY/);
  assert.match(monitoring, /postqueue -p/);
  assert.match(monitoring, /alerts-scan/);
  assert.match(backup, /requested -> running -> completed\|failed/);
  assert.match(backup, /Backup worker chưa cấu hình/);
});
