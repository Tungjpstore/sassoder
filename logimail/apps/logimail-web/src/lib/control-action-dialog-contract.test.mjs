import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(relativeUrl) {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8');
}

test('Control Center uses accessible action dialogs instead of browser prompt/confirm', () => {
  const control = source('../components/control/control-client.tsx');
  const dialog = source('../components/control/control-action-dialog.tsx');

  assert.doesNotMatch(control, /window\.(?:prompt|confirm)\s*\(/);
  assert.match(control, /<ControlActionDialog/);
  assert.match(control, /field: \{ kind: 'textarea'/);
  assert.match(control, /field: \{ kind: 'number'/);
  assert.match(control, /field: \{ kind: 'confirmation'/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-describedby=/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /querySelectorAll<HTMLElement>/);
});

test('Backup and Agent pages do not present confirmation-only fake actions', () => {
  const pages = source('../components/logimail-pages.tsx');

  assert.doesNotMatch(pages, /ConfirmDangerModal/);
  assert.match(pages, /<BackupRequestButton workspaceId=\{data\.activeWorkspace\.id\}/);
  assert.match(pages, /Restore dry-run chưa có API/);
  assert.match(pages, /Download report chưa kết nối/);
  assert.match(pages, /Daily report chưa kết nối/);
  assert.match(pages, /Tắt agent chưa có API/);
});
