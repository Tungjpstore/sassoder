import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(relativeUrl) {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8');
}

test('domain requests issue an ownership challenge and remain unverified', () => {
  const route = source('../app/api/logimail/domains/request/route.ts');
  assert.match(route, /createDomainOwnershipChallenge/);
  assert.match(route, /ownership_unverified/);
  assert.match(route, /pending_domain_verification/);
  assert.match(route, /dns_plan:\s*\[ownership, \.\.\.plannedRecords\]/);
});

test('ownership verification is authorized with the user token before service-role update', () => {
  const route = source('../app/api/logimail/domains/request/[id]/ownership/route.ts');
  assert.match(route, /createLogimailStore\(auth\.token\)/);
  assert.match(route, /verifyDomainOwnership/);
  assert.match(route, /createLogimailServiceStore/);
  assert.match(route, /\.eq\('status', 'pending'\)/);
});

test('admin approval fails closed until TXT ownership is verified', () => {
  const adminService = source('./admin-service.ts');
  assert.match(adminService, /ownership\.status !== 'verified'/);
  assert.match(adminService, /domain_ownership_unverified/);
});

test('admin onboarding path preserves ownership metadata across every step', () => {
  const onboarding = source('./onboarding.ts');
  assert.match(onboarding, /createDomainOwnershipChallenge/);
  assert.match(onboarding, /risk_flags: \['ownership_unverified'\]/);
  assert.match(onboarding, /ownership_challenge_missing/);
  assert.match(onboarding, /status: ownershipVerified \? 'verified' : 'pending'/);
});

test('safe DNS plan includes DMARC reporting, MTA-STS and TLS-RPT', () => {
  const store = source('./logimail-store.ts');
  assert.match(store, /v=DMARC1; p=none; rua=mailto:postmaster@\$\{domain\}; fo=1/);
  assert.match(store, /_mta-sts\.\$\{domain\}/);
  assert.match(store, /v=TLSRPTv1; rua=mailto:postmaster@\$\{domain\}/);
});
