import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('legacy admin pages do not use confirmation-only modals for mailbox and session actions', () => {
  const pages = source('../components/logimail-pages.tsx');

  assert.doesNotMatch(pages, /triggerLabel="(?:Reset mật khẩu|Tạm khóa|Xóa mailbox|Rotate secrets|Revoke sessions)"/);
  assert.match(pages, /<MailboxAdminActions mailboxId=\{mailbox\.id\}/);
  assert.match(pages, /<SecurityAdminActions userId=\{data\.auth\.user\.id\}/);
  assert.match(pages, /isPlatformRole\(data\.auth\.profile\?\.platform_role\)/);
});

test('available admin controls call real audited APIs and unavailable controls stay disabled', () => {
  const controls = source('../components/admin-action-controls.tsx');
  const bulkRoute = source('../app/api/logimail/admin/bulk/route.ts');
  const keyRoute = source('../app/api/logimail/admin/keys/rotate/route.ts');
  const sessionRoute = source('../app/api/logimail/admin/sessions/route.ts');

  assert.match(controls, /'\/api\/logimail\/admin\/bulk'/);
  assert.match(controls, /action, ids: \[mailboxId\]/);
  assert.match(controls, /'\/api\/logimail\/admin\/keys\/rotate'/);
  assert.match(controls, /'\/api\/logimail\/admin\/sessions'/);
  assert.match(controls, /'x-logimail-confirm': 'I_UNDERSTAND_LOGIMAIL_RISK'/);
  assert.doesNotMatch(controls, /window\.(?:confirm|prompt)\s*\(/);
  assert.equal((controls.match(/<ControlActionDialog state=/g) ?? []).length, 2);
  assert.match(controls, /\$\{unlock \? 'UNLOCK' : 'LOCK'\} \$\{email\}/);
  assert.match(controls, /ROTATE CREDENTIAL KEYS/);
  assert.match(controls, /REVOKE MY SESSIONS/);
  assert.match(controls, /Reset mật khẩu \(chưa khả dụng\)/);
  assert.match(controls, /Xóa mailbox \(chưa khả dụng\)/);
  assert.match(controls, /type="button" disabled title="Chưa có API admin reset/);
  assert.match(controls, /type="button" disabled title="Chưa có API xóa mailbox/);
  assert.match(bulkRoute, /'lock_mailbox', 'unlock_mailbox'/);
  assert.match(keyRoute, /requireAdmin\(request, 'dangerous'\)/);
  assert.match(sessionRoute, /revokeUserSessions/);
});

test('legacy admin mutations preserve mfa_required and use the shared step-up flow', () => {
  const controls = source('../components/admin-action-controls.tsx');

  assert.match(controls, /class AdminActionRequestError extends Error/);
  assert.match(controls, /body\.error\.code/);
  assert.equal((controls.match(/mfaStepUp\.runWithStepUp/g) ?? []).length, 3);
  assert.equal((controls.match(/<AdminMfaStepUpModal/g) ?? []).length, 2);
});

test('onboarding offers direct domain, DNS and mailbox actions', () => {
  const pages = source('../components/logimail-pages.tsx');

  assert.match(pages, /action: firstDomain \? 'Quản lý domain' : 'Thêm domain'/);
  assert.match(pages, /href: firstDomain \? `\/domains\/\$\{firstDomain\.id\}\/dns` : '\/domains\/new'/);
  assert.match(pages, /action: data\.mailboxes\.length \? 'Mở hộp thư' : 'Tạo mailbox'/);
  assert.match(pages, /<ButtonLink href=\{step\.href\}/);
});
