import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../components/mail-native-client.tsx'), 'utf8');
const draftRoute = readFileSync(resolve(here, '../app/api/logimail/mail/drafts/route.ts'), 'utf8');
const draftDeleteRoute = readFileSync(resolve(here, '../app/api/logimail/mail/drafts/[id]/route.ts'), 'utf8');
const sendRoute = readFileSync(resolve(here, '../app/api/logimail/mail/send/route.ts'), 'utf8');

test('mailbox unlock keeps the mailbox selected by the user', () => {
  assert.match(source, /<select value=\{email\} onChange=\{\(event\) => setEmail\(event\.target\.value\)\}/);
  assert.doesNotMatch(source, /selectedEmail[\s\S]{0,160}setEmail\(/);
});

test('compose distinguishes fully rejected and partially accepted SMTP results', () => {
  assert.match(source, /const accepted = Array\.isArray\(sendResult\.result\?\.accepted\)/);
  assert.match(source, /if \(accepted\.length === 0\)/);
  assert.match(source, /if \(rejected\.length > 0\)/);
  assert.match(source, /setTo\(rejected\.join\('\, '\)\)/);
  assert.match(source, /Đã gửi \$\{accepted\.length\} người nhận/);
});

test('send and discard serialize behind the in-flight autosave', () => {
  assert.match(source, /const autosavePromiseRef = useRef/);
  assert.match(source, /const pauseAutosave = useCallback\(async \(\) =>/);
  assert.match(source, /const draftToDelete = await pauseAutosave\(\)/);
  assert.match(source, /persistedDraftIdRef\.current/);
  assert.match(source, /const resumeAutosave = useCallback/);
  assert.match(source, /const draftSnapshot = \{/);
  assert.match(source, /body: JSON\.stringify\(\{ \.\.\.draftSnapshot, draftId: draftToDelete \}\)/);
  assert.match(source, /Never finalize a stale draft/);
  assert.match(source, /sendOutcomeUnknown/);
  assert.match(source, /block a blind retry/);
  assert.match(source, /disabled=\{loading \|\| sendOutcomeUnknown/);
  assert.match(source, /if \(sendOutcomeUnknown\) return;/);
});

test('compose reload hydrates all fields from the user-scoped browser cache', () => {
  assert.match(source, /readComposeDraftCache\(window\.sessionStorage/);
  assert.match(source, /setTo\(cached\.to\)/);
  assert.match(source, /setCc\(cached\.cc\)/);
  assert.match(source, /setBcc\(cached\.bcc\)/);
  assert.match(source, /setSubject\(cached\.subject\)/);
  assert.match(source, /setText\(cached\.text\)/);
  assert.match(source, /Đã khôi phục trên thiết bị/);
  assert.match(source, /contentBase64:\s*null/);
  assert.match(source, /clearComposeDraftCache\(window\.sessionStorage/);
  assert.match(source, /setTo\(draft\.to \?\? ''\)/);
  assert.match(source, /setCc\(draft\.cc \?\? ''\)/);
  assert.match(source, /setBcc\(draft\.bcc \?\? ''\)/);
  assert.match(source, /setSubject\(draft\.subject \?\? ''\)/);
  assert.match(source, /setText\(draft\.text \?\? ''\)/);
  assert.match(source, /setAttachments\(\[\]\)/);
  assert.match(source, /composeContextRef/);
  assert.match(source, /onAuthStateChange/);
  assert.match(source, /ownerGenerationRef/);
});

test('autosaves are queued and only successful snapshots become current', () => {
  assert.match(source, /const previousSave = autosavePromiseRef\.current/);
  assert.match(source, /const savePromise = previousSave[\s\S]*\.then\(async \(\) =>/);
  assert.match(source, /body: JSON\.stringify\(\{ \.\.\.snapshot, draftId: persistedDraftIdRef\.current \}\)/);
  assert.match(source, /lastDraftPayloadRef\.current = fingerprint/);
  assert.match(source, /autosavePromiseRef\.current = savePromise/);
  assert.match(source, /errorCode === 'not_found'[\s\S]*persistedDraftIdRef\.current = null/);
});

test('restored attachment metadata cannot be sent without selecting files again', () => {
  assert.match(source, /attachmentsNeedingReattach\.length/);
  assert.match(source, /Hãy chọn lại \$\{attachmentsNeedingReattach\.length\} tệp/);
  assert.match(source, /!attachment\.contentBase64 \? ' · cần chọn lại tệp'/);
});

test('server draft finalization is bound to the successful send', () => {
  assert.match(sendRoute, /const draftId = draftIdRaw \? normalizeUuid/);
  assert.match(sendRoute, /\.update\(\{ status: 'sent' \}\)/);
  assert.match(sendRoute, /\.eq\('user_id', context\.auth\.user\.id\)/);
  assert.match(sendRoute, /\.eq\('mailbox_id', context\.mailbox\.id\)/);
  assert.match(sendRoute, /result\.rejected\.length > 0 \|\| result\.accepted\.length === 0/);
  assert.match(sendRoute, /draftCleanupStatus: draftCleanup\.status/);
  assert.match(sendRoute, /value\.length > MAX_ATTACHMENT_COUNT/);
  assert.match(sendRoute, /encodedBytes \+= attachment\.contentBase64\.length/);
  assert.match(sendRoute, /MAX_ATTACHMENT_ENCODED_BYTES/);
  assert.match(draftRoute, /\.eq\('status', 'draft'\)/);
  assert.match(draftRoute, /\.eq\('mailbox_id', mailbox\.id\)/);
  assert.match(draftDeleteRoute, /draft\.status !== 'draft'/);
  assert.match(draftDeleteRoute, /\.eq\('status', 'draft'\)/);
  assert.match(draftDeleteRoute, /\.select\('id'\)\s*\.maybeSingle\(\)/);
  assert.match(source, /errorCode === 'not_found' \|\| errorCode === 'draft_not_editable'/);
});
