import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  readOptional("supabase/.temp/project-ref")?.trim() ||
  parseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const appUrl = stripTrailingSlash(process.env.NEXT_PUBLIC_APP_URL || "https://logivn.com");
const confirmationTemplate = readOptional("supabase/templates/confirmation.html");

if (!projectRef) fail("Thiếu SUPABASE_PROJECT_REF hoặc NEXT_PUBLIC_SUPABASE_URL.");
if (!accessToken) fail("Thiếu SUPABASE_ACCESS_TOKEN. Tạo token tại Supabase Dashboard > Account > Access Tokens.");
if (!confirmationTemplate) fail("Không tìm thấy supabase/templates/confirmation.html.");

const smtp = readSmtpConfig();
const google = readGoogleConfig();
const redirectUrls = unique([
  `${appUrl}/auth/callback**`,
  `${appUrl}/auth/confirm**`,
  "https://logivn.com/auth/callback**",
  "https://logivn.com/auth/confirm**",
  "https://*.logivn.com/auth/callback**",
  "https://*.logivn.com/auth/confirm**",
  "https://logi.vn.com/auth/callback**",
  "https://logi.vn.com/auth/confirm**",
  "http://localhost:3000/auth/callback**",
  "http://localhost:3000/auth/confirm**",
  ...csv(process.env.SUPABASE_AUTH_EXTRA_REDIRECT_URLS)
]);

const payload = {
  site_url: appUrl,
  uri_allow_list: redirectUrls.join(","),
  external_email_enabled: true,
  mailer_autoconfirm: false,
  mailer_secure_email_change_enabled: true,
  mailer_otp_length: 6,
  mailer_otp_exp: 900,
  refresh_token_rotation_enabled: true,
  security_update_password_require_reauthentication: true,
  security_refresh_token_reuse_interval: 10,
  password_hibp_enabled: true,
  password_min_length: 10,
  password_required_characters: "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789",
  mailer_subjects_confirmation: "Mã xác thực LogiVN của bạn",
  mailer_templates_confirmation_content: confirmationTemplate,
  ...(smtp ?? {}),
  ...(google ?? {})
};

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});

if (!response.ok) {
  const detail = await response.text();
  fail(`Supabase Auth config lỗi ${response.status}: ${detail}`);
}

console.log(
  JSON.stringify(
    {
      projectRef,
      siteUrl: appUrl,
      redirectUrls,
      smtpConfigured: Boolean(smtp),
      googleConfigured: Boolean(google)
    },
    null,
    2
  )
);

function readOptional(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
}

function parseProjectRef(value) {
  if (!value) return null;
  try {
    const host = new URL(value).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  } catch {
    return null;
  }
}

function stripTrailingSlash(value) {
  return value.trim().replace(/\/+$/, "");
}

function csv(value) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function unique(values) {
  return Array.from(new Set(values));
}

function readSmtpConfig() {
  const host = process.env.SUPABASE_SMTP_HOST;
  const port = process.env.SUPABASE_SMTP_PORT;
  const user = process.env.SUPABASE_SMTP_USER;
  const pass = process.env.SUPABASE_SMTP_PASS;
  const adminEmail = process.env.SUPABASE_SMTP_ADMIN_EMAIL;
  const senderName = process.env.SUPABASE_SMTP_SENDER_NAME || "LogiVN";

  const provided = [host, port, user, pass, adminEmail].some(Boolean);
  if (!provided) return null;
  if (!host || !port || !user || !pass || !adminEmail) {
    fail("SMTP cần đủ SUPABASE_SMTP_HOST, SUPABASE_SMTP_PORT, SUPABASE_SMTP_USER, SUPABASE_SMTP_PASS, SUPABASE_SMTP_ADMIN_EMAIL.");
  }

  return {
    smtp_host: host,
    smtp_port: String(port),
    smtp_user: user,
    smtp_pass: pass,
    smtp_admin_email: adminEmail,
    smtp_sender_name: senderName
  };
}

function readGoogleConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId && !secret) return null;
  if (!clientId || !secret) fail("Google OAuth cần đủ GOOGLE_OAUTH_CLIENT_ID và GOOGLE_OAUTH_CLIENT_SECRET.");

  return {
    external_google_enabled: true,
    external_google_client_id: clientId,
    external_google_secret: secret
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
