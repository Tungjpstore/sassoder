import test from 'node:test';
import assert from 'node:assert/strict';

const { evaluateAutoApprovalDecision, DEFAULT_AUTO_APPROVAL_RULES, limitBulkIds, BULK_MAX_IDS } = await import('./approval-rules.ts');

test('rule disabled keeps request pending (R9.1)', () => {
  const decision = evaluateAutoApprovalDecision({ type: 'domain', riskFlags: [] });
  assert.equal(decision.autoApprove, false);
  assert.equal(decision.reason, 'rule_disabled');
});

test('enabled rule + no risk flags auto-approves (R9.2)', () => {
  const decision = evaluateAutoApprovalDecision({ type: 'mailbox', riskFlags: [] });
  assert.equal(decision.autoApprove, true);
  assert.equal(decision.reason, 'auto_approved');
});

test('risk flags keep request pending even if rule enabled (R9.3)', () => {
  const rules = { account: true, domain: true, mailbox: true };
  const decision = evaluateAutoApprovalDecision({ type: 'domain', riskFlags: ['new_domain'], rules });
  assert.equal(decision.autoApprove, false);
  assert.equal(decision.reason, 'risk_flags_present');
});

test('defaults: only mailbox auto-approves', () => {
  assert.equal(DEFAULT_AUTO_APPROVAL_RULES.account, false);
  assert.equal(DEFAULT_AUTO_APPROVAL_RULES.domain, false);
  assert.equal(DEFAULT_AUTO_APPROVAL_RULES.mailbox, true);
});

test('bulk ids capped at 500 (R10.4)', () => {
  const ids = Array.from({ length: 750 }, (_, i) => `id-${i}`);
  assert.equal(limitBulkIds(ids).length, BULK_MAX_IDS);
  assert.equal(limitBulkIds(['a', 'b']).length, 2);
});
