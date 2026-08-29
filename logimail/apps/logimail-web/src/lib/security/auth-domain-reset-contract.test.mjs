import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const domains = readSource('../registration-domains.ts');
const mailCredentials = readSource('../mail-credentials.ts');
const resetRoute = readSource('../../app/api/logimail/auth/reset-password/route.ts');

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test('signup domains stay registration-gated while login and reset accept every active approved domain', () => {
  const registrationList = functionSource(domains, 'export async function getRegistrationDomains', 'export async function getAuthenticationDomainOptions');
  const authenticationList = functionSource(domains, 'export async function getAuthenticationDomainOptions', 'export async function getAuthenticationDomains');
  const registrationRecord = functionSource(domains, 'export async function getRegistrationDomainRecord', 'export async function getAuthenticationDomainRecord');
  const authenticationRecord = domains.slice(domains.indexOf('export async function getAuthenticationDomainRecord'));

  assert.match(registrationList, /\.eq\('registration_enabled', true\)/);
  assert.match(registrationRecord, /\.eq\('registration_enabled', true\)/);
  assert.doesNotMatch(authenticationList, /\.eq\('registration_enabled', true\)/);
  assert.doesNotMatch(authenticationRecord, /\.eq\('registration_enabled', true\)/);
  assert.match(authenticationList, /\.eq\('status', 'active'\)[\s\S]*?\.eq\('approval_status', 'approved'\)/);
});

test('configured Supabase is authoritative for signup domains', () => {
  const registrationList = functionSource(domains, 'export async function getRegistrationDomains', 'export async function getAuthenticationDomainOptions');
  assert.match(registrationList, /if \(error\) return \[\];/);
  assert.match(registrationList, /if \(store\)[\s\S]*?return \(data[\s\S]*?const domain = fallbackDomain\(\)/);
});

test('authentication domain lookup distinguishes temporary query failure from an empty approved list', () => {
  const authenticationList = functionSource(domains, 'export async function getAuthenticationDomainOptions', 'export async function getAuthenticationDomains');
  assert.match(authenticationList, /if \(error\) return \{ domains: \[\], status: 'unavailable' \}/);
  assert.match(authenticationList, /status: 'ready'/);
});

test('password reset validates the target-bound code before account lookup and hides account state', () => {
  const validateAt = resetRoute.indexOf('const validatedCode = await validateSecurityCode');
  const profileAt = resetRoute.indexOf(".from('profiles')");
  const mailboxAt = resetRoute.indexOf(".from('mailboxes')");

  assert.ok(validateAt >= 0 && validateAt < profileAt && profileAt < mailboxAt);
  assert.match(resetRoute, /getAuthenticationDomainRecord/);
  assert.match(resetRoute, /if \(!profile\) return jsonError\('invalid_reset_request', GENERIC_RESET_ERROR, 409\)/);
  assert.match(resetRoute, /if \(!mailbox\) return jsonError\('invalid_reset_request', GENERIC_RESET_ERROR, 409\)/);
  assert.doesNotMatch(resetRoute, /account_not_found|mailbox_not_found/);
});

test('password reset commits credentials before revoking sessions and fully compensates failures', () => {
  const consumeAt = resetRoute.indexOf('const consumedCode = await consumeSecurityCode');
  const versionAt = resetRoute.indexOf("serviceStore.rpc('revoke_user_sessions'");
  const providerAt = resetRoute.indexOf('await updateBillionMailMailboxPassword(providerInput)');
  const authAt = resetRoute.indexOf('await serviceStore.auth.admin.updateUserById');
  const credentialAt = resetRoute.indexOf('await saveMailboxCredentials({ mailboxId: mailbox.id as string, email, password })');

  assert.ok(consumeAt >= 0 && consumeAt < providerAt && providerAt < authAt && authAt < credentialAt && credentialAt < versionAt);
  assert.match(resetRoute, /await serviceStore\.auth\.admin\.updateUserById\(profile\.id as string, \{ password: previousPassword \}\)/);
  assert.match(resetRoute, /await saveMailboxCredentials\(\{ mailboxId: mailbox\.id as string, email, password: previousPassword \}\)/);
  assert.match(resetRoute, /restoreConsumedResetCode\(serviceStore, consumedCode\.row\)/);
  assert.match(resetRoute, /if \(rollbackComplete\)/);
  assert.doesNotMatch(resetRoute, /Promise\.allSettled\(\[\s*saveMailboxCredentials/);
  assert.match(resetRoute, /serviceStore\.rpc\('revoke_user_sessions'/);
});

test('password reset keeps the code retryable when the previous mailbox credential is unavailable', () => {
  const readinessAt = resetRoute.indexOf('if (!mailCredentialReadiness().ready)');
  const previousCredentialAt = resetRoute.indexOf('const previousPassword = decryptMailboxCredential');
  const missingCredentialAt = resetRoute.indexOf("if (!previousPassword) throw new Error('missing_previous_mailbox_credential')");
  const consumeAt = resetRoute.indexOf('const consumedCode = await consumeSecurityCode');

  assert.ok(readinessAt >= 0 && readinessAt < consumeAt);
  assert.ok(previousCredentialAt >= 0 && previousCredentialAt < missingCredentialAt && missingCredentialAt < consumeAt);
});

test('mailbox credential persistence only succeeds when the target row was updated', () => {
  assert.match(mailCredentials, /\.eq\('id', input\.mailboxId\)[\s\S]*?\.select\('id'\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(mailCredentials, /if \(!data\) return \{ stored: false as const, reason: 'mailbox_not_found' \}/);
});
