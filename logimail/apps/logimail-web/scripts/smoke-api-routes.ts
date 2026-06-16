import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GET as healthGet } from '../src/app/api/logimail/health/route';
import { requireAuth } from '../src/lib/api-boundary';
import { billionMailBridgeMailboxEndpoint } from '../src/lib/billionmail-config';
import { decryptMailboxCredential, encryptMailboxCredential, mailCredentialReadiness } from '../src/lib/mail-credentials';
import {
  buildSafeDnsPlan,
  normalizeDomain,
  normalizeEmail,
  normalizeMailboxLocalPart,
  normalizeSlug,
  normalizeUuid,
} from '../src/lib/logimail-store';

type SmokeTest = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: SmokeTest[] = [];

function test(name: string, run: SmokeTest['run']) {
  tests.push({ name, run });
}

async function responseJson(response: Response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T> | T) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function routeSource(pathFromWebRoot: string) {
  return readFileSync(fileURLToPath(new URL(`../${pathFromWebRoot}`, import.meta.url)), 'utf8');
}

function repoSource(pathFromRepoRoot: string) {
  return readFileSync(fileURLToPath(new URL(`../../../${pathFromRepoRoot}`, import.meta.url)), 'utf8');
}

function assertSourceOrder(source: string, earlier: string, later: string, message: string) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  assert.notEqual(earlierIndex, -1, `${message}: missing ${earlier}`);
  assert.notEqual(laterIndex, -1, `${message}: missing ${later}`);
  assert.ok(earlierIndex < laterIndex, message);
}

test('health route reports missing server config without failing', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      SUPABASE_SECRET_KEY: undefined,
      SUPABASE_DEFAULT_KEY: undefined,
      BILLIONMAIL_BASE_URL: undefined,
      BILLIONMAIL_API_TOKEN: undefined,
      BILLIONMAIL_BRIDGE_BASE_URL: undefined,
      BILLIONMAIL_BRIDGE_TOKEN: undefined,
      CLOUDFLARE_ZONE_ID: undefined,
    },
    async () => {
      const result = await responseJson(healthGet());
      assert.equal(result.status, 200);
      assert.equal(result.body.ok, true);
      assert.equal(result.body.data.status, 'not_configured');
      assert.deepEqual(result.body.data.missing, [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'CLOUDFLARE_ZONE_ID',
        'SUPABASE_SECRET_KEY',
        'BILLIONMAIL_BASE_URL',
        'BILLIONMAIL_API_TOKEN',
        'BILLIONMAIL_BRIDGE_BASE_URL',
        'BILLIONMAIL_BRIDGE_TOKEN',
      ]);
      assert.deepEqual(result.body.data.billionmail, { ready: false, mode: 'not_configured' });
    },
  );
});

test('health route reports ready when required server config is present', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-example',
      SUPABASE_SECRET_KEY: 'sb_secret_example',
      BILLIONMAIL_BASE_URL: 'http://127.0.0.1:8081',
      BILLIONMAIL_API_TOKEN: 'provider-token',
      CLOUDFLARE_ZONE_ID: 'zone-example',
    },
    async () => {
      const result = await responseJson(healthGet());
      assert.equal(result.status, 200);
      assert.equal(result.body.data.status, 'ready');
      assert.deepEqual(result.body.data.missing, []);
      assert.deepEqual(result.body.data.billionmail, { ready: true, mode: 'direct' });
    },
  );
});

test('health route accepts BillionMail bridge mode for Vercel console deployments', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-example',
      SUPABASE_SECRET_KEY: 'sb_secret_example',
      BILLIONMAIL_BASE_URL: undefined,
      BILLIONMAIL_API_TOKEN: undefined,
      BILLIONMAIL_BRIDGE_BASE_URL: 'https://mail.logivn.com/api/logimail/provider-bridge',
      BILLIONMAIL_BRIDGE_TOKEN: 'bridge-token',
      CLOUDFLARE_ZONE_ID: 'zone-example',
    },
    async () => {
      const result = await responseJson(healthGet());
      assert.equal(result.status, 200);
      assert.equal(result.body.data.status, 'ready');
      assert.deepEqual(result.body.data.missing, []);
      assert.deepEqual(result.body.data.billionmail, { ready: true, mode: 'bridge' });
    },
  );
});

test('BillionMail bridge mailbox endpoint preserves nested base path', () => {
  assert.equal(
    billionMailBridgeMailboxEndpoint('https://mail.logivn.com/api/logimail/provider-bridge'),
    'https://mail.logivn.com/api/logimail/provider-bridge/mailbox',
  );
  assert.equal(
    billionMailBridgeMailboxEndpoint('https://mail.logivn.com/api/logimail/provider-bridge/'),
    'https://mail.logivn.com/api/logimail/provider-bridge/mailbox',
  );
});

test('auth boundary rejects requests without bearer token', async () => {
  const auth = await requireAuth(new Request('https://mail.logivn.com/api/logimail/me'), 'read');
  assert.equal(auth.ok, false);
  if (!auth.ok) {
    const result = await responseJson(auth.response);
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'unauthorized');
  }
});

test('dangerous auth boundary requires explicit confirmation before Supabase network auth', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-example',
    },
    async () => {
      const auth = await requireAuth(
        new Request('https://mail.logivn.com/api/logimail/ops/restart-safe', {
          headers: { Authorization: 'Bearer fake-token' },
        }),
        'dangerous',
      );
      assert.equal(auth.ok, false);
      if (!auth.ok) {
        const result = await responseJson(auth.response);
        assert.equal(result.status, 428);
        assert.equal(result.body.error.code, 'confirmation_required');
      }
    },
  );
});

test('normalizers keep metadata payloads predictable', () => {
  assert.equal(normalizeSlug('logimail-internal'), 'logimail-internal');
  assert.equal(normalizeDomain('MAIL.LOGIVN.COM'), 'mail.logivn.com');
  assert.equal(normalizeEmail('Admin@MAIL.LOGIVN.COM'), 'admin@mail.logivn.com');
  assert.equal(normalizeMailboxLocalPart('Sales.Team-01'), 'sales.team-01');
  assert.equal(normalizeUuid('018f2f91-9e35-4af5-bc1f-23584f996d02'), '018f2f91-9e35-4af5-bc1f-23584f996d02');
  assert.throws(() => normalizeSlug('Logi Mail'), /invalid_slug/);
  assert.throws(() => normalizeDomain('mail_logivn_com'), /invalid_domain/);
  assert.throws(() => normalizeEmail('admin'), /invalid_email/);
  assert.throws(() => normalizeMailboxLocalPart('admin..ops'), /invalid_local_part/);
  assert.throws(() => normalizeMailboxLocalPart('-admin'), /invalid_local_part/);
});

test('DNS plan keeps mail host DNS-only and leaves DMARC in observation mode', () => {
  const plan = buildSafeDnsPlan('logivn.com', '103.199.19.144', 'mail.logivn.com');
  assert.deepEqual(plan[0], { type: 'A', name: 'mail.logivn.com', content: '103.199.19.144', proxied: false });
  assert.deepEqual(plan[1], { type: 'MX', name: 'logivn.com', content: 'mail.logivn.com', priority: 10 });
  assert.equal(plan[2].content, 'v=spf1 mx ip4:103.199.19.144 -all');
  assert.equal(plan[3].content, 'v=DMARC1; p=none; rua=mailto:postmaster@logivn.com');
});

test('mailbox credential encryption is gated by server-side key', async () => {
  await withEnv({ LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY: undefined }, () => {
    assert.equal(mailCredentialReadiness().ready, false);
    assert.equal(decryptMailboxCredential('bad.payload'), null);
  });

  await withEnv({ LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY: 'local-test-key-for-logimail-credential-store' }, () => {
    assert.equal(mailCredentialReadiness().ready, true);
    const encrypted = encryptMailboxCredential('secret-mailbox-password');
    assert.notEqual(encrypted, 'secret-mailbox-password');
    assert.equal(decryptMailboxCredential(encrypted), 'secret-mailbox-password');
    assert.equal(decryptMailboxCredential('bad.payload'), null);
  });
});

test('protected API routes keep auth guard at route boundary', () => {
  const protectedRoutes = [
    'src/app/api/logimail/account/request/route.ts',
    'src/app/api/logimail/workspaces/route.ts',
    'src/app/api/logimail/domains/route.ts',
    'src/app/api/logimail/domains/request/route.ts',
    'src/app/api/logimail/domains/[id]/dns-check/route.ts',
    'src/app/api/logimail/domains/[id]/dns-bootstrap/route.ts',
    'src/app/api/logimail/domains/[id]/deliverability/route.ts',
    'src/app/api/logimail/aliases/route.ts',
    'src/app/api/logimail/mailboxes/route.ts',
    'src/app/api/logimail/mailboxes/request/route.ts',
    'src/app/api/logimail/mailboxes/[id]/assign-user/route.ts',
    'src/app/api/logimail/mail/session/route.ts',
    'src/app/api/logimail/mail/folders/route.ts',
    'src/app/api/logimail/mail/messages/route.ts',
    'src/app/api/logimail/mail/messages/[id]/route.ts',
    'src/app/api/logimail/mail/send/route.ts',
    'src/app/api/logimail/mail/drafts/route.ts',
    'src/app/api/logimail/mail/drafts/[id]/route.ts',
    'src/app/api/logimail/mail/labels/route.ts',
    'src/app/api/logimail/mail/rules/route.ts',
    'src/app/api/logimail/team/tasks/route.ts',
    'src/app/api/logimail/team/tasks/[id]/route.ts',
    'src/app/api/logimail/push/config/route.ts',
    'src/app/api/logimail/push/subscriptions/route.ts',
    'src/app/api/logimail/push/test/route.ts',
    'src/app/api/logimail/push/notifications/route.ts',
    'src/app/api/logimail/me/route.ts',
    'src/app/api/logimail/ops/backup/route.ts',
    'src/app/api/logimail/ops/report/route.ts',
    'src/app/api/logimail/ops/restart-safe/route.ts',
  ];

  for (const route of protectedRoutes) {
    assert.match(routeSource(route), /requireAuth\(request|requireMailSession\(request/);
  }
});

test('mutation and ops routes include audit log calls', () => {
  const routeActions: Record<string, string> = {
    'src/app/api/logimail/account/request/route.ts': 'account.request_create',
    'src/app/api/logimail/workspaces/route.ts': 'workspace.create_approval_required',
    'src/app/api/logimail/domains/route.ts': 'domain.create_approval_required',
    'src/app/api/logimail/domains/request/route.ts': 'domain.request_create',
    'src/app/api/logimail/mailboxes/route.ts': 'mailbox.create_approval_required',
    'src/app/api/logimail/mailboxes/request/route.ts': 'mailbox.request_create',
    'src/app/api/logimail/mailboxes/[id]/assign-user/route.ts': 'mailbox.assign_user',
    'src/app/api/logimail/domains/[id]/dns-bootstrap/route.ts': 'domain.dns_bootstrap_dry_run',
    'src/app/api/logimail/domains/[id]/deliverability/route.ts': 'domain.deliverability.check_create',
    'src/app/api/logimail/aliases/route.ts': 'mail.alias.request_create',
    'src/app/api/logimail/mail/send/route.ts': 'mail.native_send',
    'src/app/api/logimail/mail/drafts/route.ts': 'mail.draft.create',
    'src/app/api/logimail/mail/drafts/[id]/route.ts': 'mail.draft.discard',
    'src/app/api/logimail/mail/labels/route.ts': 'mail.label.create',
    'src/app/api/logimail/mail/rules/route.ts': 'mail.rule.create',
    'src/app/api/logimail/team/tasks/route.ts': 'team.mailbox_task.create',
    'src/app/api/logimail/team/tasks/[id]/route.ts': 'team.mailbox_task.update',
    'src/app/api/logimail/push/subscriptions/route.ts': 'push.subscription_upsert',
    'src/app/api/logimail/push/test/route.ts': 'push.test_send',
    'src/app/api/logimail/me/route.ts': 'profile.update_sender_identity',
    'src/app/api/logimail/ops/backup/route.ts': 'ops.backup.request',
    'src/app/api/logimail/ops/restart-safe/route.ts': 'ops.restart_safe.request',
  };

  for (const [route, action] of Object.entries(routeActions)) {
    const source = routeSource(route);
    assert.match(source, /writeAuditLog/);
    assert.match(source, new RegExp(action.replaceAll('.', '\\.')));
  }
});

test('direct create routes force the approval request flow', () => {
  const routeReplacements: Record<string, string> = {
    'src/app/api/logimail/workspaces/route.ts': '/api/logimail/account/request',
    'src/app/api/logimail/domains/route.ts': '/api/logimail/domains/request',
    'src/app/api/logimail/mailboxes/route.ts': '/api/logimail/mailboxes/request',
  };

  for (const [route, replacement] of Object.entries(routeReplacements)) {
    const source = routeSource(route);
    assert.match(source, /approval_required/);
    assert.match(source, new RegExp(replacement.replaceAll('/', '\\/')));
  }
});

test('public registration route uses one-time security codes and provisions real mailboxes', () => {
  const registerPage = routeSource('src/app/auth/register/page.tsx');
  const publicRegisterPage = routeSource('src/app/register/page.tsx');
  const authForms = routeSource('src/components/auth-forms.tsx');
  const registerRoute = routeSource('src/app/api/logimail/auth/register/route.ts');
  const resetRoute = routeSource('src/app/api/logimail/auth/reset-password/route.ts');
  const domainRoute = routeSource('src/app/api/logimail/auth/domains/route.ts');
  const domainRegistry = routeSource('src/lib/registration-domains.ts');

  assert.match(registerPage, /AuthRegisterView/);
  assert.match(publicRegisterPage, /AuthRegisterView/);
  assert.doesNotMatch(publicRegisterPage, /redirect\(['"]\/auth\/invite['"]\)/);
  assert.match(authForms, /email-domain-suffix/);
  assert.match(authForms, /securityCode/);
  assert.match(authForms, /one-time-code/);
  assert.match(authForms, /\/api\/logimail\/auth\/register/);
  assert.match(authForms, /\/api\/logimail\/auth\/reset-password/);
  assert.match(authForms, /href="\/auth\/register"/);
  assert.doesNotMatch(authForms, /signInWithOAuth/);
  assert.doesNotMatch(authForms, /auth\.signUp/);
  assert.doesNotMatch(authForms, /api\/logimail\/account\/request/);
  assert.match(registerRoute, /createLogimailServiceStore/);
  assert.match(registerRoute, /validateSecurityCode/);
  assert.match(registerRoute, /consumeSecurityCode/);
  assert.match(registerRoute, /createBillionMailMailbox/);
  assert.match(registerRoute, /auth\.admin\.createUser/);
  assert.match(registerRoute, /saveMailboxCredentials/);
  assertSourceOrder(registerRoute, 'const validatedCode = await validateSecurityCode', 'await createBillionMailMailbox', 'Registration must validate the code before provisioning a provider mailbox');
  assertSourceOrder(registerRoute, 'await saveMailboxCredentials', 'const consumedCode = await consumeSecurityCode', 'Registration must consume the one-time code only after credentials are saved');
  assert.match(registerRoute, /email_confirm:\s*true/);
  assert.match(registerRoute, /account\.email_registration_create/);
  assert.doesNotMatch(registerRoute, /account\.email_registration_request_create/);
  assert.doesNotMatch(registerRoute, /account_requests'\)\.insert/);
  assert.match(registerRoute, /RESERVED_LOCAL_PARTS/);
  assert.doesNotMatch(registerRoute, /\n\s*'admin',/);
  assert.doesNotMatch(registerRoute, /\n\s*'support',/);
  assert.match(registerRoute, /\n\s*'postmaster',/);
  assert.doesNotMatch(registerRoute, /requireAuth\(/);
  assert.match(resetRoute, /validateSecurityCode/);
  assert.match(resetRoute, /consumeSecurityCode/);
  assert.match(resetRoute, /updateBillionMailMailboxPassword/);
  assert.match(resetRoute, /auth\.admin\.updateUserById/);
  assert.match(resetRoute, /saveMailboxCredentials/);
  assertSourceOrder(resetRoute, 'const validatedCode = await validateSecurityCode', 'await updateBillionMailMailboxPassword', 'Password reset must validate the code before updating provider password');
  assertSourceOrder(resetRoute, 'await saveMailboxCredentials', 'const consumedCode = await consumeSecurityCode', 'Password reset must consume the one-time code only after credentials are saved');
  assert.match(resetRoute, /account\.password_reset_with_security_code/);
  assert.match(domainRoute, /getRegistrationDomains/);
  assert.match(domainRegistry, /registration_enabled/);
  assert.match(domainRegistry, /approval_status/);
  assert.match(domainRegistry, /LOGIMAIL_DOMAIN/);
});

test('native mail client keeps RoundCube out of primary inbox and compose flow', () => {
  const pages = routeSource('src/components/logimail-pages.tsx');
  const mailShell = routeSource('src/components/mail-app-shell.tsx');
  const ui = routeSource('src/components/logimail-ui.tsx');
  const nativeClient = routeSource('src/components/mail-native-client.tsx');
  const mailClient = routeSource('src/lib/mail-client.ts');
  const mailAccess = routeSource('src/lib/mail-access.ts');
  const profileForm = routeSource('src/components/profile-settings-form.tsx');
  const authForms = routeSource('src/components/auth-forms.tsx');
  const controlLogin = routeSource('src/components/control/control-login-form.tsx');
  const authLoginClient = routeSource('src/lib/auth-login-client.ts');
  const authLoginRoute = routeSource('src/app/api/logimail/auth/login/route.ts');
  const meRoute = routeSource('src/app/api/logimail/me/route.ts');
  const sessionRoute = routeSource('src/app/api/logimail/mail/session/route.ts');
  const sendRoute = routeSource('src/app/api/logimail/mail/send/route.ts');
  const rootPage = routeSource('src/app/page.tsx');
  const dashboardPage = routeSource('src/app/dashboard/page.tsx');
  const mailPage = routeSource('src/app/mail/page.tsx');
  const mailNotificationPage = routeSource('src/app/mail/settings/notifications/page.tsx');
  const pwaNotifications = routeSource('src/components/pwa-notifications.tsx');
  const requestForms = routeSource('src/components/request-forms.tsx');
  const pushConfigRoute = routeSource('src/app/api/logimail/push/config/route.ts');
  const pushSubscriptionsRoute = routeSource('src/app/api/logimail/push/subscriptions/route.ts');
  const pushTestRoute = routeSource('src/app/api/logimail/push/test/route.ts');
  const pushNotifyRoute = routeSource('src/app/api/logimail/push/notifications/route.ts');
  const pushStore = routeSource('src/lib/push-subscriptions.ts');
  const webPush = routeSource('src/lib/web-push.ts');
  const mailCredentials = routeSource('src/lib/mail-credentials.ts');
  const envelopeCrypto = routeSource('src/lib/security/envelope-crypto.ts');
  const pushWorker = routeSource('scripts/logimail-push-worker.ts');
  const middleware = routeSource('src/middleware.ts');
  const serviceWorker = routeSource('public/sw.js');
  const packageJson = routeSource('package.json');
  const pushWorkerService = repoSource('infra/vps/logimail-push-worker.service.example');

  assert.match(pages, /MailInboxClient/);
  assert.match(pages, /MailComposeClient/);
  assert.match(pages, /MailMessageClient/);
  assert.match(pages, /<MailAppShell[\s\S]*<MailInboxClient/);
  assert.match(pages, /<MailAppShell[\s\S]*<MailComposeClient/);
  assert.match(pages, /<MailAppShell[\s\S]*<MailMessageClient/);
  assert.doesNotMatch(pages, /href="\/roundcube\//);
  assert.doesNotMatch(ui, /href="\/roundcube\//);
  assert.match(mailShell, /Hộp thư đến/);
  assert.match(mailShell, /Tìm trong thư/);
  assert.doesNotMatch(mailShell, /Domain & DNS|MailOps|Backup|Agent Control|Cloudflare DNS/);
  assert.match(rootPage, /redirect\(['"]\/mail\/inbox['"]\)/);
  assert.match(dashboardPage, /redirect\(['"]\/mail\/inbox['"]\)/);
  assert.match(mailPage, /redirect\(['"]\/mail\/inbox['"]\)/);
  assert.match(mailNotificationPage, /MailNotificationSettingsView/);
  assert.match(middleware, /domain\.logivn\.com/);
  assert.match(middleware, /DOMAIN_CONTROL_PREFIXES/);
  assert.match(middleware, /MAILBOX_PREFIXES/);
  assert.match(middleware, /refresh_token_already_used/);
  assert.match(middleware, /clearSupabaseAuthCookies/);
  assert.match(authLoginClient, /\/api\/logimail\/auth\/login/);
  assert.match(authLoginClient, /auth-login-cooldown/);
  assert.doesNotMatch(authForms, /\.auth\.signInWithPassword/);
  assert.doesNotMatch(controlLogin, /\.auth\.signInWithPassword/);
  assert.match(authLoginRoute, /SUPABASE_SECRET_KEY/);
  assert.match(authLoginRoute, /not_configured/);
  assert.match(authLoginRoute, /sb-forwarded-for/);
  assert.match(authLoginRoute, /signInWithPassword/);
  assert.match(authLoginRoute, /enforceRateLimit/);
  assert.doesNotMatch(pages, /admin\.logivn\.com/);
  assert.match(serviceWorker, /logimail-shell-v6/);
  assert.doesNotMatch(serviceWorker, /\n\s*'\/mail\/inbox',/);
  assert.doesNotMatch(serviceWorker, /\n\s*'\/auth\/login',/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/_next\/'\)/);
  assert.match(serviceWorker, /event\.request\.mode === 'navigate'/);
  assert.match(serviceWorker, /LOGIMAIL_SHOW_NOTIFICATION/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(serviceWorker, /action: 'reply'/);
  assert.doesNotMatch(serviceWorker, /\/dashboard|\/ops|\/settings\/security/);
  assert.match(packageJson, /"web-push"/);
  assert.match(packageJson, /"push-worker"/);
  assert.match(packageJson, /"tsx"/);
  assert.match(webPush, /setVapidDetails/);
  assert.match(envelopeCrypto, /LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY/);
  assert.match(mailCredentials, /encrypted_imap_password/);
  assert.match(pushStore, /push_subscriptions/);
  assert.match(pushStore, /shouldDisablePushSubscription/);
  assert.match(pushConfigRoute, /webPushReadiness/);
  assert.match(pushSubscriptionsRoute, /savePushSubscription/);
  assert.match(pushTestRoute, /sendPushToMailbox/);
  assert.match(pushNotifyRoute, /cleanNotificationPayload/);
  assert.match(pushWorker, /mail_push_checkpoints/);
  assert.match(pushWorker, /listMailMessages/);
  assert.match(pushWorker, /sendPushToMailbox/);
  assert.match(pushWorker, /mode: 'baseline'/);
  assert.match(pushWorker, /missing_mailbox_credentials/);
  assert.match(pushWorkerService, /logimail-push-worker/);
  assert.match(pushWorkerService, /run push-worker/);
  assert.match(pwaNotifications, /PushManager/);
  assert.match(pwaNotifications, /\/api\/logimail\/push\/subscriptions/);
  assert.match(pwaNotifications, /\/api\/logimail\/push\/test/);
  assert.match(pwaNotifications, /\/api\/logimail\/push\/notifications/);
  assert.match(nativeClient, /\/api\/logimail\/mail\/messages/);
  assert.match(nativeClient, /\/api\/logimail\/mail\/send/);
  assert.match(nativeClient, /replyMessageId/);
  assert.match(nativeClient, /showFolderPanel/);
  assert.match(nativeClient, /Trả lời/);
  assert.match(nativeClient, /Trả lời tất cả/);
  assert.match(nativeClient, /Chuyển tiếp/);
  assert.match(nativeClient, /\/api\/logimail\/mail\/drafts/);
  assert.match(nativeClient, /\/api\/logimail\/team\/tasks/);
  assert.match(nativeClient, /buildReplyAllDraft/);
  assert.match(nativeClient, /buildForwardDraft/);
  assert.match(nativeClient, /compose-status-line/);
  assert.match(nativeClient, /mail-inline-search/);
  assert.match(nativeClient, /buildReplyDraft/);
  assert.match(nativeClient, /inReplyTo/);
  assert.match(nativeClient, /Paperclip/);
  assert.match(nativeClient, /type="file" multiple/);
  assert.match(nativeClient, /contentBase64/);
  assert.match(sessionRoute, /verifyMailCredentials/);
  assert.match(sessionRoute, /saveMailboxCredentials/);
  assert.match(sessionRoute, /MAIL_SESSION_COOKIE/);
  assert.match(mailClient, /new ImapFlow/);
  assert.match(mailClient, /nodemailer\.createTransport/);
  assert.match(mailClient, /attachments/);
  assert.match(mailClient, /messageId/);
  assert.match(mailClient, /references/);
  assert.match(mailClient, /profileFullName/);
  assert.match(mailAccess, /full_name,avatar_url/);
  assert.match(profileForm, /Avatar URL/);
  assert.match(profileForm, /PATCH/);
  assert.match(meRoute, /PATCH/);
  assert.match(meRoute, /profile\.update_sender_identity/);
  assert.match(sendRoute, /email_send_logs/);
  assert.match(sendRoute, /attachmentsField/);
  assert.match(sendRoute, /attachmentCount/);
  assert.match(requestForms, /AliasRequestForm/);
  assert.match(requestForms, /MailLabelForm/);
  assert.match(requestForms, /MailRuleForm/);
  assert.match(requestForms, /DeliverabilityCheckButton/);
  assert.match(requestForms, /BackupRequestButton/);
  assert.match(requestForms, /\/api\/logimail\/aliases/);
  assert.match(requestForms, /\/api\/logimail\/mail\/labels/);
  assert.match(requestForms, /\/api\/logimail\/mail\/rules/);
});

test('nginx routes health to the ops API and product API routes to Next.js', () => {
  const nginx = repoSource('infra/vps/nginx-mail-logivn.conf.example');

  assert.match(
    nginx,
    /location = \/api\/logimail\/health \{[\s\S]*?proxy_pass http:\/\/logimail_api;[\s\S]*?\}/,
  );
  assert.match(
    nginx,
    /location \/api\/logimail\/ \{[\s\S]*?proxy_pass http:\/\/logimail_web;[\s\S]*?\}/,
  );
});

test('approval schema keeps provisioning writes behind service/admin flow', () => {
  const schema = repoSource('supabase/schema.sql');
  const rls = repoSource('supabase/rls-policies.sql');

  assert.match(schema, /account_status text not null default 'pending'/);
  assert.match(schema, /create table if not exists logimail\.account_requests/);
  assert.match(schema, /create table if not exists logimail\.domain_requests/);
  assert.match(schema, /create table if not exists logimail\.mailbox_requests/);
  assert.match(schema, /create table if not exists logimail\.security_codes/);
  assert.match(schema, /create table if not exists logimail\.push_subscriptions/);
  assert.match(schema, /create table if not exists logimail\.mail_push_checkpoints/);
  assert.match(schema, /max_uses integer not null default 1 check \(max_uses = 1\)/);
  assert.match(schema, /registration_enabled boolean not null default false/);
  assert.match(rls, /alter table logimail\.security_codes enable row level security/);
  assert.match(rls, /alter table logimail\.push_subscriptions enable row level security/);
  assert.match(rls, /alter table logimail\.mail_push_checkpoints enable row level security/);
  assert.match(rls, /revoke all on logimail\.security_codes from public, anon, authenticated/);
  assert.match(rls, /revoke all on logimail\.push_subscriptions from public, anon, authenticated/);
  assert.match(rls, /revoke all on logimail\.mail_push_checkpoints from public, anon, authenticated/);
  assert.match(rls, /grant select, insert, update, delete on logimail\.security_codes to service_role/);
  assert.match(rls, /grant select, insert, update, delete on logimail\.push_subscriptions to service_role/);
  assert.match(rls, /grant select, insert, update, delete on logimail\.mail_push_checkpoints to service_role/);
  assert.match(rls, /create policy account_requests_insert_self/);
  assert.match(rls, /create policy domain_requests_insert_workspace_admin/);
  assert.match(rls, /create policy mailbox_requests_insert_member/);
  assert.doesNotMatch(rls, /create policy workspaces_insert_owner/);
  assert.doesNotMatch(rls, /create policy domains_write_admin/);
  assert.doesNotMatch(rls, /create policy mailboxes_write_admin/);
  assert.doesNotMatch(rls, /create policy workspace_members_write_admin/);
  assert.doesNotMatch(rls, /create policy mailbox_permissions_write_admin/);
});

test('product upgrade schema adds operational metadata without storing raw email bodies', () => {
  const schema = repoSource('supabase/schema.sql');
  const rls = repoSource('supabase/rls-policies.sql');
  const migration = repoSource('supabase/migrations/20260611155130_logimail_product_upgrade_batch.sql');

  for (const source of [schema, migration]) {
    assert.match(source, /create table if not exists logimail\.mailbox_aliases/);
    assert.match(source, /create table if not exists logimail\.mail_labels/);
    assert.match(source, /create table if not exists logimail\.mail_rules/);
    assert.match(source, /create table if not exists logimail\.mail_drafts/);
    assert.match(source, /create table if not exists logimail\.team_mailbox_tasks/);
    assert.match(source, /create table if not exists logimail\.deliverability_checks/);
    assert.match(source, /create table if not exists logimail\.dmarc_reports/);
    assert.match(source, /create table if not exists logimail\.bounce_events/);
    assert.match(source, /create table if not exists logimail\.backup_jobs/);
    assert.match(source, /local_part text not null/);
    assert.match(source, /unique\(domain_id, local_part\)/);
    assert.match(source, /body_preview text/);
    assert.match(source, /body_sha256 text/);
    assert.doesNotMatch(source, /\n\s*body text,/);
  }

  assert.match(rls, /alter table logimail\.mail_drafts enable row level security/);
  assert.match(rls, /create policy mail_drafts_select_owner[\s\S]*user_id = \(select auth\.uid\(\)\)/);
  assert.match(rls, /grant select on logimail\.mailbox_aliases, logimail\.mail_labels, logimail\.mail_rules, logimail\.mail_drafts/);
  assert.match(rls, /grant select, insert, update, delete on logimail\.mailbox_aliases, logimail\.mail_labels, logimail\.mail_rules, logimail\.mail_drafts/);
});

test('mailbox assignment uses service role only after explicit owner/admin check', () => {
  const source = routeSource('src/app/api/logimail/mailboxes/[id]/assign-user/route.ts');
  assert.match(source, /createLogimailServiceStore/);
  assert.match(source, /workspace\.owner_id === auth\.user\.id/);
  assert.match(source, /\['owner', 'admin'\]\.includes/);
  assert.match(source, /serviceStore\s*\n\s*\.from\('mailbox_permissions'\)/);
});

test('DNS bootstrap route remains dry-run only and does not mutate Cloudflare', () => {
  const source = routeSource('src/app/api/logimail/domains/[id]/dns-bootstrap/route.ts');
  assert.match(source, /status: 'dry_run_only'/);
  assert.match(source, /plannedRecords/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
});

test('restart-safe route is marked dangerous', () => {
  const source = routeSource('src/app/api/logimail/ops/restart-safe/route.ts');
  assert.match(source, /requireAuth\(request, 'dangerous'\)/);
  assert.match(source, /ops\.restart_safe\.request/);
});

async function main() {
  let failed = 0;
  for (const item of tests) {
    try {
      await item.run();
      console.log(`[pass] ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`[fail] ${item.name}`);
      console.error(error);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }

  console.log(`[done] ${tests.length} LogiMail API smoke checks passed.`);
}

void main();
