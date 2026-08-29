import { createHmac, randomBytes } from 'node:crypto';

export type WorkspaceInviteRole = 'admin' | 'member' | 'viewer';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_ROLES = new Set<WorkspaceInviteRole>(['admin', 'member', 'viewer']);

export function normalizeWorkspaceInviteRole(value: string): WorkspaceInviteRole {
  if (!INVITE_ROLES.has(value as WorkspaceInviteRole)) throw new Error('invalid_invite_role');
  return value as WorkspaceInviteRole;
}

export function normalizeWorkspaceInviteCode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length !== 22 || !normalized.startsWith('LMI')) throw new Error('invalid_invite_code');
  return normalized;
}

function inviteSecret() {
  const secret = process.env.LOGIMAIL_INVITE_SECRET ?? '';
  if (secret.length < 16) throw new Error('missing_invite_secret');
  return secret;
}

export function hashWorkspaceInviteCode(code: string) {
  return createHmac('sha256', inviteSecret()).update(normalizeWorkspaceInviteCode(code)).digest('hex');
}

export function createWorkspaceInviteCode() {
  let code = 'LMI';
  const bytes = randomBytes(19);
  for (const byte of bytes) code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  return `${code.slice(0, 3)}-${code.slice(3, 8)}-${code.slice(8, 13)}-${code.slice(13, 18)}-${code.slice(18)}`;
}

export function workspaceInviteCodeHint(code: string) {
  return normalizeWorkspaceInviteCode(code).slice(-4);
}
