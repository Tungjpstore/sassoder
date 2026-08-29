import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const controlPath = fileURLToPath(new URL('../../components/control/control-client.tsx', import.meta.url));
const routePath = fileURLToPath(new URL('../../app/api/logimail/admin/domains/[id]/dns-provision/route.ts', import.meta.url));
const ticketPath = fileURLToPath(new URL('./dns-preview-ticket.ts', import.meta.url));
const migrationPath = fileURLToPath(new URL('../../../../../supabase/migrations/20260723090000_logimail_dns_preview_tickets.sql', import.meta.url));
const control = readFileSync(controlPath, 'utf8');
const route = readFileSync(routePath, 'utf8');
const ticket = readFileSync(ticketPath, 'utf8');
const migration = readFileSync(migrationPath, 'utf8');

test('control fetches and retains a server DNS preview before any provision POST', () => {
  assert.match(control, /apiFetch<\{ preview: DnsProvisionPreview \}>\(`\/api\/logimail\/admin\/domains\/\$\{domain\.id\}\/dns-provision`\)/);
  assert.match(control, /savePreview\(domain\.id, preview\)/);
  assert.match(control, /expectedPreviewDigest: dnsPreview\.digest/);
  assert.match(control, /previewId: previewConfirmation\.previewId/);
  assert.match(control, /confirmationText: dnsConfirmation\.trim\(\)/);
  assert.doesNotMatch(control, /allowModify: dnsPreview\.status/);
});

test('stale preview invalidates confirmation and forces a re-preview', () => {
  assert.match(control, /'dns_preview_replayed'/);
  assert.match(control, /'dns_preview_expired'/);
  assert.match(control, /markPreviewStale\(domain\.id\)/);
  assert.match(control, /Tải lại preview/);
  assert.match(route, /jsonError\('dns_preview_stale', mapped\.text, mapped\.status\)/);
});

test('control renders the complete typed diff and requires exact confirmation text', () => {
  assert.match(control, /action: 'create' \| 'update' \| 'delete' \| 'noop'/);
  assert.match(control, /dnsPreview\.changes\.map/);
  assert.match(control, /dnsRecordMeta\(change\.before\)/);
  assert.match(control, /dnsRecordMeta\(change\.after\)/);
  assert.match(control, /dnsConfirmation\.trim\(\) === dnsPreview\.confirmation\.text/);
  assert.doesNotMatch(control, /window\.confirm\(`Xác nhận DNS preview/);
});

test('server issues actor-bound preview tickets and consumes them once before mutation', () => {
  assert.match(route, /issueDnsPreviewTicket/);
  assert.match(route, /beforeApply: async \(freshPreview\) => \{[\s\S]*await consumeDnsPreviewTicket/);
  assert.match(route, /completeDnsPreviewTicket\(previewId\)/);
  assert.match(ticket, /\.eq\('actor_id', input\.actorId\)/);
  assert.match(ticket, /\.eq\('digest', input\.digest\)/);
  assert.match(ticket, /\.eq\('confirmation_text', input\.confirmationText\)/);
  assert.match(ticket, /\.eq\('status', 'issued'\)/);
  assert.match(ticket, /\.update\(\{ status: 'applying' \}\)/);
  assert.match(ticket, /dns_preview_replayed/);
  assert.match(migration, /where status in \('issued', 'applying'\)/);
  assert.match(migration, /revoke all on table logimail\.dns_provision_previews from public, anon, authenticated/);
});

test('legacy direct empty-body DNS provision call is gone', () => {
  assert.doesNotMatch(control, /dns-provision`,\s*\{\s*method:\s*'POST',[\s\S]{0,180}body:\s*JSON\.stringify\(\{\}\)/);
});
