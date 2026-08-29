import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(here, '../components/mail-native-client.tsx'), 'utf8');
const shell = readFileSync(resolve(here, '../components/mail-app-shell.tsx'), 'utf8');
const client = readFileSync(resolve(here, './mail-client.ts'), 'utf8');
const actionRoute = readFileSync(resolve(here, '../app/api/logimail/mail/messages/actions/route.ts'), 'utf8');
const messageRoute = readFileSync(resolve(here, '../app/api/logimail/mail/messages/[id]/route.ts'), 'utf8');
const archivePage = readFileSync(resolve(here, '../app/mail/archive/page.tsx'), 'utf8');

test('archive has a real route in both mailbox navigation surfaces', () => {
  assert.match(component, /archive:\s*\{[^}]*href:\s*'\/mail\/archive'/);
  assert.match(shell, /href:\s*'\/mail\/archive',\s*label:\s*'Lưu trữ'/);
  assert.match(archivePage, /<InboxView folder="archive" \/>/);
});

test('restore only moves recoverable folders back to inbox', () => {
  assert.match(client, /action === 'restore'/);
  assert.match(client, /\['trash', 'spam', 'archive'\]\.includes\(folder\)/);
  assert.match(client, /moveMessagesSafely\(client, uids, folderPathFor\('inbox', folders\)\)/);
  assert.match(component, /key:\s*'restore' as const,\s*label:\s*'Khôi phục'/);
  assert.doesNotMatch(client, /special === '\\\\all'/);
});

test('missing Archive renders empty and archive action creates a selectable folder', () => {
  assert.match(client, /if \(!folderPath && folder === 'archive'\)/);
  assert.match(client, /messages:\s*\[\],\s*total:\s*0/);
  assert.match(client, /await client\.mailboxCreate\(requestedPath\)/);
  assert.match(client, /const refreshed = await client\.list\(\)/);
  assert.match(client, /existingFolderPathFor\('archive', refreshed\)/);
  assert.match(client, /flags\.includes\('\\\\noselect'\)/);
  assert.match(client, /flags\.includes\('\\\\nonexistent'\)/);
  assert.match(client, /folder\.name\.toLowerCase\(\) === target/);
});

test('mail moves never delete the source before a successful copy', () => {
  assert.match(client, /client\.capabilities\.has\('MOVE'\)/);
  assert.match(client, /const moved = await client\.messageMove/);
  assert.match(client, /if \(!moved\) throw new Error\('imap_move_failed'\)/);
  assert.match(client, /client\.capabilities\.has\('UIDPLUS'\)/);
  const copyIndex = client.indexOf('const copied = await client.messageCopy');
  const copyGuardIndex = client.indexOf("if (!copied) throw new Error('imap_copy_failed')");
  const deleteIndex = client.indexOf('const deleted = await client.messageDelete', copyIndex);
  assert.ok(copyIndex > -1 && copyGuardIndex > copyIndex && deleteIndex > copyGuardIndex);
});

test('bulk actions reject malformed UID lists instead of silently acting on a subset', () => {
  assert.match(actionRoute, /uids\.some\(\(item\) => !Number\.isInteger\(item\) \|\| item <= 0\)/);
  assert.match(actionRoute, /Array\.from\(new Set\(uids\)\)/);
});

test('permanent delete is distinct, trash-only and requires explicit confirmation', () => {
  assert.match(client, /action === 'delete_permanently'/);
  assert.match(client, /folder !== 'trash'/);
  assert.match(actionRoute, /x-logimail-confirm/);
  assert.match(actionRoute, /I_UNDERSTAND_LOGIMAIL_RISK/);
  assert.match(component, /XOA VINH VIEN/);
  assert.match(component, /setConfirmPermanentDelete\(true\)/);
  assert.match(client, /if \(!client\.capabilities\.has\('UIDPLUS'\)\) throw new Error\('imap_permanent_delete_unsupported'\)/);
  assert.match(client, /if \(!deleted\) throw new Error\('imap_permanent_delete_failed'\)/);
  assert.doesNotMatch(component, /message\?\.folder === 'trash' \? 'Xóa vĩnh viễn'/);
});

test('read-only mailbox cannot mutate messages', () => {
  assert.match(actionRoute, /canModifyMailbox\(context\.mailbox\)/);
  assert.match(component, /const canModifyMailbox = session\?\.mailbox\?\.permission === 'send'/);
  assert.match(component, /if \(!canModifyMailbox\) return;/);
  assert.match(component, /disabled=\{!canModify \|\| !message/);
});

test('read-only message detail does not mark mail as seen', () => {
  assert.match(messageRoute, /markRead: canModifyMailbox\(sessionContext\.mailbox\)/);
  assert.match(client, /options: \{ markRead\?: boolean \} = \{\}/);
  assert.match(client, /readOnly: !markRead/);
  assert.match(client, /if \(markRead\) await client\.messageFlagsAdd/);
});

test('mailbox loads ignore stale responses and prune off-page selections', () => {
  assert.match(component, /const loadRequestRef = useRef\(0\)/);
  assert.match(component, /const requestId = \+\+loadRequestRef\.current/);
  assert.match(component, /if \(requestId !== loadRequestRef\.current\) return/);
  assert.match(component, /const visible = new Set\(messageData\.messages\.map/);
});

test('sent delivery reports an IMAP Sent-copy failure without hiding SMTP success', () => {
  assert.match(client, /let sentCopyStatus: 'saved' \| 'failed' = 'saved'/);
  assert.match(client, /smtpTransport\.close\(\)/);
  assert.match(component, /Email đã gửi thành công, nhưng chưa lưu được bản sao/);
});

test('auth expiry and mailbox unlock are separate client states', () => {
  assert.match(component, /authError\.code = 'auth_session_expired'/);
  assert.match(component, /errorCode === 'mail_session_required'/);
  assert.match(component, /errorCode === 'auth_session_expired'/);
  assert.match(component, /<AuthSessionExpiredPanel/);
  assert.doesNotMatch(component, /apiFetch<SessionData>\('\/api\/logimail\/mail\/session'\)\.catch\(\(\) => null\)/);
});

test('idle IMAP socket errors are consumed and evicted from the pool', () => {
  assert.match(client, /client\.on\('error', \(\) =>/);
  assert.match(client, /discardPooledClient\(client\)/);
  assert.match(client, /closeQuietly\(client\)/);
});

test('unlocking compose synchronizes the From mailbox with the unlocked session', () => {
  assert.match(component, /onUnlocked=\{\(unlockedSession\) =>/);
  assert.match(component, /const unlockedFrom = unlockedSession\.session\?\.email \?\? unlockedSession\.mailbox\?\.emailAddress/);
  assert.match(component, /setFrom\(unlockedFrom\)/);
});
