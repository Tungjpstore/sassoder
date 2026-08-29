import { setTimeout as sleep } from 'node:timers/promises';

import type { AuthorizedMailbox } from '../src/lib/mail-access';
import { listMailMessages, type MailMessageSummary } from '../src/lib/mail-client';
import { decryptMailboxCredential, mailCredentialReadiness } from '../src/lib/mail-credentials';
import { createLogimailServiceStore, supabaseErrorMessage } from '../src/lib/logimail-store';
import { sendPushToMailbox } from '../src/lib/push-subscriptions';
import { webPushReadiness } from '../src/lib/web-push';

type WorkerOptions = {
  once: boolean;
  dryRun: boolean;
  intervalMs: number;
  mailbox: string | null;
};

type PushTargetRow = {
  mailbox_id: string;
  user_id: string;
};

type PermissionRow = {
  mailbox_id: string;
  user_id: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  account_status: string;
};

type MailboxRow = {
  id: string;
  workspace_id: string;
  domain_id: string;
  email_address: string;
  display_name: string | null;
  quota_mb: number;
  status: string;
  provider: string;
  provider_mailbox_id: string | null;
  session_version: number;
  encrypted_imap_username: string | null;
  encrypted_imap_password: string | null;
};

type DomainRow = {
  id: string;
  domain: string;
  mail_hostname: string | null;
};

type CheckpointRow = {
  mailbox_id: string;
  workspace_id: string;
  last_seen_uid: number;
  last_notified_uid: number;
  metadata: Record<string, unknown> | null;
};

type Stats = {
  subscriptions: number;
  mailboxes: number;
  skipped: number;
  checked: number;
  baseline: number;
  newMessages: number;
  attempted: number;
  sent: number;
  failed: number;
  errors: number;
};

const DEFAULT_INTERVAL_MS = Number(process.env.LOGIMAIL_PUSH_WORKER_INTERVAL_MS || 45_000);
const MESSAGE_FETCH_LIMIT = 25;
const MAX_NOTIFICATIONS_PER_MAILBOX = 5;

let stopping = false;

function parseOptions(argv: string[]): WorkerOptions {
  let intervalMs = DEFAULT_INTERVAL_MS;
  let mailbox: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--interval-ms=')) intervalMs = Number(arg.slice('--interval-ms='.length));
    if (arg.startsWith('--mailbox=')) mailbox = arg.slice('--mailbox='.length).trim().toLowerCase() || null;
  }

  return {
    once: argv.includes('--once'),
    dryRun: argv.includes('--dry-run'),
    intervalMs: Number.isFinite(intervalMs) ? Math.max(15_000, intervalMs) : 45_000,
    mailbox,
  };
}

function log(level: 'info' | 'warn' | 'error', message: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, service: 'logimail-push-worker', time: new Date().toISOString(), ...data }));
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error ?? 'unknown_error')).slice(0, 240);
}

function mailboxFromRow(row: MailboxRow, domain: DomainRow | undefined): AuthorizedMailbox {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    domainId: row.domain_id,
    emailAddress: row.email_address,
    displayName: row.display_name,
    quotaMb: row.quota_mb,
    status: row.status,
    provider: row.provider,
    providerMailboxId: row.provider_mailbox_id,
    sessionVersion: row.session_version,
    permission: 'admin',
    domain: domain?.domain ?? null,
    mailHostname: domain?.mail_hostname ?? null,
    profileFullName: null,
    profileAvatarUrl: null,
  };
}

function notificationPayload(mailbox: MailboxRow, message: MailMessageSummary) {
  const url = `/mail/message/${message.id}`;
  return {
    subject: message.subject,
    from: message.from,
    body: message.from ? `${message.from} gửi email mới.` : 'Bạn có email mới trong LogiMail.',
    url,
    replyUrl: `/mail/compose?replyMessageId=${message.id}`,
    tag: `logimail-${mailbox.id}-${message.uid}`,
    timestamp: message.date ? new Date(message.date).getTime() : Date.now(),
  };
}

async function upsertCheckpoint(input: {
  mailbox: MailboxRow;
  lastSeenUid: number;
  lastNotifiedUid: number;
  metadata: Record<string, unknown>;
  success: boolean;
  dryRun: boolean;
}) {
  if (input.dryRun) return;
  const store = createLogimailServiceStore();
  if (!store) throw new Error('missing_service_store');
  const now = new Date().toISOString();
  const { error } = await store.from('mail_push_checkpoints').upsert(
    {
      mailbox_id: input.mailbox.id,
      workspace_id: input.mailbox.workspace_id,
      last_seen_uid: input.lastSeenUid,
      last_notified_uid: input.lastNotifiedUid,
      last_checked_at: now,
      last_success_at: input.success ? now : null,
      last_error_at: null,
      last_error: null,
      metadata: input.metadata,
    },
    { onConflict: 'mailbox_id' },
  );
  if (error) throw new Error(supabaseErrorMessage(error));
}

async function markCheckpointError(mailbox: MailboxRow, checkpoint: CheckpointRow | undefined, error: unknown, dryRun: boolean) {
  if (dryRun) return;
  const store = createLogimailServiceStore();
  if (!store) throw new Error('missing_service_store');
  const now = new Date().toISOString();
  const { error: updateError } = await store.from('mail_push_checkpoints').upsert(
    {
      mailbox_id: mailbox.id,
      workspace_id: mailbox.workspace_id,
      last_seen_uid: checkpoint?.last_seen_uid ?? 0,
      last_notified_uid: checkpoint?.last_notified_uid ?? 0,
      last_checked_at: now,
      last_error_at: now,
      last_error: errorMessage(error),
      metadata: { lastError: errorMessage(error) },
    },
    { onConflict: 'mailbox_id' },
  );
  if (updateError) throw new Error(supabaseErrorMessage(updateError));
}

function groupPushTargets(rows: PushTargetRow[]) {
  const targets = new Map<string, Set<string>>();
  for (const row of rows) {
    const users = targets.get(row.mailbox_id) ?? new Set<string>();
    users.add(row.user_id);
    targets.set(row.mailbox_id, users);
  }
  return targets;
}

async function runOnce(options: WorkerOptions): Promise<Stats> {
  const stats: Stats = { subscriptions: 0, mailboxes: 0, skipped: 0, checked: 0, baseline: 0, newMessages: 0, attempted: 0, sent: 0, failed: 0, errors: 0 };
  const pushReady = webPushReadiness();
  if (!pushReady.ready && !options.dryRun) {
    log('warn', 'web_push_not_configured', { missing: pushReady.missing });
    return stats;
  }

  const credentialReady = mailCredentialReadiness();
  if (!credentialReady.ready) {
    log('warn', 'credential_store_not_configured', { missing: credentialReady.missing });
  }

  const store = createLogimailServiceStore();
  if (!store) throw new Error('missing_service_store');

  const { data: subscriptionRows, error: subscriptionError } = await store
    .from('push_subscriptions')
    .select('mailbox_id,user_id')
    .eq('enabled', true)
    .is('disabled_at', null)
    .eq('permission_state', 'granted')
    .range(0, 4999);
  if (subscriptionError) throw new Error(supabaseErrorMessage(subscriptionError));

  const subscriptionTargets = (subscriptionRows ?? []) as PushTargetRow[];
  const targetMailboxIds = Array.from(new Set(subscriptionTargets.map((row) => row.mailbox_id)));
  const { data: mailboxRows, error: mailboxError } = await store
    .from('mailboxes')
    .select('id,workspace_id,domain_id,email_address,display_name,quota_mb,status,provider,provider_mailbox_id,session_version,encrypted_imap_username,encrypted_imap_password')
    .in('id', targetMailboxIds)
    .eq('status', 'active');
  if (mailboxError) throw new Error(supabaseErrorMessage(mailboxError));

  const mailboxes = ((mailboxRows ?? []) as MailboxRow[]).filter((mailbox) => !options.mailbox || mailbox.id === options.mailbox || mailbox.email_address === options.mailbox);
  stats.mailboxes = mailboxes.length;
  if (mailboxes.length === 0) return stats;

  const activeMailboxIds = mailboxes.map((mailbox) => mailbox.id);
  const candidateUserIds = Array.from(new Set(subscriptionTargets.filter((row) => activeMailboxIds.includes(row.mailbox_id)).map((row) => row.user_id)));
  const [permissionResult, profileResult] = await Promise.all([
    store.from('mailbox_permissions').select('mailbox_id,user_id').in('mailbox_id', activeMailboxIds).in('user_id', candidateUserIds),
    store.from('profiles').select('id,email,account_status').in('id', candidateUserIds),
  ]);
  if (permissionResult.error) throw new Error(supabaseErrorMessage(permissionResult.error));
  if (profileResult.error) throw new Error(supabaseErrorMessage(profileResult.error));

  const explicitPermissionKeys = new Set(((permissionResult.data ?? []) as PermissionRow[]).map((row) => `${row.mailbox_id}:${row.user_id}`));
  const profiles = new Map(((profileResult.data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
  const mailboxById = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const authorizedTargets = subscriptionTargets.filter((row) => {
    const mailbox = mailboxById.get(row.mailbox_id);
    if (!mailbox) return false;
    if (explicitPermissionKeys.has(`${row.mailbox_id}:${row.user_id}`)) return true;
    const profile = profiles.get(row.user_id);
    return profile?.account_status === 'approved' && profile.email?.trim().toLowerCase() === mailbox.email_address.toLowerCase();
  });
  stats.subscriptions = authorizedTargets.length;
  stats.skipped += subscriptionTargets.length - authorizedTargets.length;
  const targets = groupPushTargets(authorizedTargets);
  if (targets.size === 0) return stats;

  const domainIds = Array.from(new Set(mailboxes.map((mailbox) => mailbox.domain_id)));
  const { data: domainRows, error: domainError } = await store.from('domains').select('id,domain,mail_hostname').in('id', domainIds);
  if (domainError) throw new Error(supabaseErrorMessage(domainError));
  const domains = new Map(((domainRows ?? []) as DomainRow[]).map((domain) => [domain.id, domain]));

  const { data: checkpointRows, error: checkpointError } = await store.from('mail_push_checkpoints').select('mailbox_id,workspace_id,last_seen_uid,last_notified_uid,metadata').in('mailbox_id', mailboxes.map((mailbox) => mailbox.id));
  if (checkpointError) throw new Error(supabaseErrorMessage(checkpointError));
  const checkpoints = new Map(((checkpointRows ?? []) as CheckpointRow[]).map((checkpoint) => [checkpoint.mailbox_id, checkpoint]));

  for (const mailbox of mailboxes) {
    const checkpoint = checkpoints.get(mailbox.id);
    try {
      const username = decryptMailboxCredential(mailbox.encrypted_imap_username) ?? mailbox.email_address;
      const password = decryptMailboxCredential(mailbox.encrypted_imap_password);
      if (!password) {
        stats.skipped += 1;
        await markCheckpointError(mailbox, checkpoint, new Error('missing_mailbox_credentials'), options.dryRun);
        continue;
      }

      const mailboxContext = mailboxFromRow(mailbox, domains.get(mailbox.domain_id));
      const checkpointUidValidity = typeof checkpoint?.metadata?.uidValidity === 'string' ? checkpoint.metadata.uidValidity : null;
      const initialPoll = !checkpoint || checkpoint.last_seen_uid === 0 || !checkpointUidValidity;
      const { messages, uidValidity } = await listMailMessages(
        { email: username, password },
        mailboxContext,
        'inbox',
        MESSAGE_FETCH_LIMIT,
        initialPoll || checkpointUidValidity === null ? {} : { afterUid: checkpoint.last_seen_uid },
      );
      stats.checked += 1;
      const uidChanged = Boolean(checkpointUidValidity && uidValidity && checkpointUidValidity !== uidValidity);
      const latestUid = messages.reduce((max, message) => Math.max(max, message.uid), checkpoint?.last_seen_uid ?? 0);

      if (initialPoll || uidChanged) {
        stats.baseline += 1;
        await upsertCheckpoint({
          mailbox,
          lastSeenUid: latestUid,
          lastNotifiedUid: checkpoint?.last_notified_uid ?? 0,
          metadata: { mode: 'baseline', messageCount: messages.length, latestUid, uidValidity },
          success: true,
          dryRun: options.dryRun,
        });
        continue;
      }

      const newMessages = messages
        .filter((message) => message.uid > checkpoint.last_seen_uid)
        .sort((left, right) => left.uid - right.uid)
        .slice(0, MAX_NOTIFICATIONS_PER_MAILBOX);
      stats.newMessages += newMessages.length;

      let lastNotifiedUid = checkpoint.last_notified_uid;
      let lastSeenUid = checkpoint.last_seen_uid;
      for (const message of newMessages) {
        lastSeenUid = Math.max(lastSeenUid, message.uid);
        lastNotifiedUid = Math.max(lastNotifiedUid, message.uid);
        if (options.dryRun) continue;
        const userIds = Array.from(targets.get(mailbox.id) ?? []);
        for (const userId of userIds) {
          const result = await sendPushToMailbox({ userId, mailboxId: mailbox.id, payload: notificationPayload(mailbox, message) });
          stats.attempted += result.attempted;
          stats.sent += result.sent;
          stats.failed += result.failed;
        }
      }

      await upsertCheckpoint({
        mailbox,
        lastSeenUid,
        lastNotifiedUid,
        metadata: { mode: 'poll', messageCount: messages.length, newMessages: newMessages.length, latestUid, uidValidity, pending: Math.max(0, messages.length - newMessages.length) },
        success: true,
        dryRun: options.dryRun,
      });
    } catch (error) {
      stats.errors += 1;
      log('error', 'mailbox_poll_failed', { mailboxId: mailbox.id, email: mailbox.email_address, error: errorMessage(error) });
      await markCheckpointError(mailbox, checkpoint, error, options.dryRun).catch((checkpointError) => {
        log('error', 'checkpoint_error_update_failed', { mailboxId: mailbox.id, error: errorMessage(checkpointError) });
      });
    }
  }

  return stats;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  log('info', 'worker_start', { once: options.once, dryRun: options.dryRun, intervalMs: options.intervalMs, mailbox: options.mailbox });

  do {
    const startedAt = Date.now();
    try {
      const stats = await runOnce(options);
      log('info', 'worker_cycle_complete', { durationMs: Date.now() - startedAt, ...stats });
    } catch (error) {
      log('error', 'worker_cycle_failed', { durationMs: Date.now() - startedAt, error: errorMessage(error) });
    }
    if (options.once) break;
    await sleep(options.intervalMs);
  } while (!stopping);

  log('info', 'worker_stop');
}

process.on('SIGINT', () => {
  stopping = true;
});

process.on('SIGTERM', () => {
  stopping = true;
});

main().catch((error) => {
  log('error', 'worker_fatal', { error: errorMessage(error) });
  process.exitCode = 1;
});
