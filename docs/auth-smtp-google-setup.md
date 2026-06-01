# Cấu Hình SMTP Và Google Login Cho LogiVN

Tài liệu này dùng cho Supabase project `tfhqatvevbrbzaaqjhfa` và domain production của app.

## 1. Chuẩn Bị SMTP

Chọn một dịch vụ gửi mail production như Resend, Postmark, AWS SES, SendGrid, Brevo hoặc Zoho ZeptoMail.

Cần có đủ thông tin:

```txt
SMTP host
SMTP port
SMTP username
SMTP password/API key
From email, ví dụ `no-reply@logivn.com`
Sender name, ví dụ LogiVN
```

Trong Supabase, SMTP mặc định chỉ dành cho thử nghiệm và có giới hạn rất thấp, nên production bắt buộc dùng SMTP riêng.

Cấu hình hiện tại của dự án đang dùng Resend SMTP với sender `no-reply@chophanmem.com` vì tài khoản Resend free chỉ cho một domain đã xác minh. Khi nâng cấp/đổi domain gửi mail, thay sender sang `no-reply@logivn.com` hoặc domain gửi mail chính thức của LogiVN.

## 2. Chuẩn Bị Google OAuth

Trong Google Cloud Console:

- Project hiện tại: `LogiVN Auth` (`logivn-auth`).
- Publishing status hiện tại: `In production`, cho phép người dùng Google bên ngoài test users đăng nhập.
- Tạo OAuth Client loại `Web application`.
- Authorized JavaScript origins:
  - `https://logivn.com`
  - `https://logi.vn.com` nếu domain phụ này được cấu hình DNS/Vercel
  - `http://localhost:3000`
- Authorized redirect URI:
  - `https://logivn.com/auth/google/callback`
  - `http://localhost:3000/auth/google/callback` cho local dev

Không dùng `https://tfhqatvevbrbzaaqjhfa.supabase.co/auth/v1/callback` cho luồng Google chính nữa. Route `/auth/google` hiện redirect trực tiếp sang Google, callback về `logivn.com`, rồi đổi Google `id_token` thành Supabase session bằng `signInWithIdToken`.

Production yêu cầu đủ `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`. Nếu thiếu, `/auth/google` fail closed về login với lỗi cấu hình thay vì tự rơi về Supabase OAuth. Route rollback `/auth/google/supabase` mặc định bị tắt; chỉ bật tạm bằng `GOOGLE_LEGACY_SUPABASE_OAUTH_ENABLED=1` khi cần quay lại luồng cũ.

Sau đó lấy:

```txt
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
```

## 3. Cấu Hình Supabase Auth Bằng Script

Tạo Supabase access token tại:

```txt
https://supabase.com/dashboard/account/tokens
```

Chạy lệnh với secret nằm trong môi trường shell, không commit vào git:

```bash
export SUPABASE_PROJECT_REF="tfhqatvevbrbzaaqjhfa"
export SUPABASE_ACCESS_TOKEN="sbp_..."
export NEXT_PUBLIC_APP_URL="https://logivn.com"

export SUPABASE_SMTP_HOST="smtp.example.com"
export SUPABASE_SMTP_PORT="587"
export SUPABASE_SMTP_USER="smtp-user"
export SUPABASE_SMTP_PASS="smtp-password"
export SUPABASE_SMTP_ADMIN_EMAIL="no-reply@logivn.com"
export SUPABASE_SMTP_SENDER_NAME="LogiVN"

export GOOGLE_OAUTH_CLIENT_ID="..."
export GOOGLE_OAUTH_CLIENT_SECRET="..."
export GOOGLE_OAUTH_STATE_SECRET="..."

node scripts/configure-supabase-auth.mjs
```

Script sẽ cấu hình:

- Site URL
- Redirect allow list cho `/auth/callback` và `/auth/confirm`
- Email provider + email confirmation
- Password policy tối thiểu 10 ký tự, bắt buộc chữ hoa/chữ thường/chữ số
- Refresh-token rotation, chống reuse token và yêu cầu xác thực lại khi đổi mật khẩu
- Leaked password protection qua Have I Been Pwned nếu gói Supabase của project hỗ trợ
- Template email có cả OTP 6 số và nút xác thực
- Custom SMTP nếu đủ biến SMTP
- Google provider trong Supabase nếu đủ Client ID/Secret để Supabase xác thực `id_token`

Lưu ý quan trọng cho Google OAuth trực tiếp: Google không cho wildcard redirect URI, nên callback production cố định ở `https://logivn.com/auth/google/callback`.

- Người dùng mở `logivn.com` sẽ callback về `https://logivn.com/auth/google/callback`.
- Người dùng mở subdomain quán `*.logivn.com` vẫn callback về root `logivn.com`; state đã ký lưu host ban đầu, sau khi tạo Supabase session cookie domain `.logivn.com`, app chuyển tiếp về đúng dashboard/quán.
- Callback Supabase PKCE `/auth/callback` vẫn giữ lại cho rollback/legacy nhưng không phải luồng Google chính.

## 4. Cấu Hình Thủ Công Trên Dashboard

Nếu không dùng script:

- Supabase Dashboard > Authentication > URL Configuration:
  - Site URL: `https://logivn.com`
  - Redirect URLs:
    - `https://logivn.com/auth/callback**`
    - `https://logivn.com/auth/confirm**`
    - `https://*.logivn.com/auth/callback**`
    - `https://*.logivn.com/auth/confirm**`
    - `https://logi.vn.com/auth/callback**` nếu domain phụ này được cấu hình DNS/Vercel
    - `https://logi.vn.com/auth/confirm**` nếu domain phụ này được cấu hình DNS/Vercel
    - `http://localhost:3000/auth/callback**`
    - `http://localhost:3000/auth/confirm**`
- Authentication > Providers:
  - Email: bật signup và confirmation.
  - Google: bật provider, thêm Web Client ID của luồng direct vào trường `Client IDs` để Supabase chấp nhận `signInWithIdToken` từ Google direct OAuth.
  - Giữ Client Secret OAuth cũ nếu vẫn muốn route rollback `/auth/google/supabase` tiếp tục chạy qua Supabase OAuth. Chỉ đổi secret trong Supabase khi Google OAuth client mới cũng đã có authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
- Vercel > Environment Variables:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_STATE_SECRET`
  - `GOOGLE_LEGACY_SUPABASE_OAUTH_ENABLED=0` trong vận hành bình thường; chỉ đặt `1` khi rollback legacy OAuth.
- Authentication > SMTP:
  - Bật custom SMTP và nhập thông tin SMTP.
  - Cấu hình hiện tại: Resend SMTP, sender `LogiVN <no-reply@chophanmem.com>`.
- Authentication > Security:
  - Minimum password length: `10`.
  - Password requirements: chữ hoa, chữ thường và chữ số.
  - Bật refresh token rotation/reuse detection nếu dashboard hiển thị tuỳ chọn này.
  - Bật leaked password protection. Nếu Supabase báo cần nâng cấp plan, đây là cảnh báo còn lại của security advisor và phải xử lý ở cấp Supabase project.
- Authentication > Email Templates > Confirm signup:
  - Subject: `Mã xác thực LogiVN của bạn`
  - Content: dùng nội dung trong `supabase/templates/confirmation.html`.

## 5. Kiểm Tra

- Vào `/dashboard/register`, đăng ký một email thật.
- Email phải có OTP 6 số và nút xác thực.
- Nhập OTP tại `/dashboard/verify-email` phải tạo quán và chuyển vào dashboard.
- Vào `/dashboard/login`, bấm `Đăng nhập bằng Google`, URL đầu tiên phải là `accounts.google.com/o/oauth2/v2/auth`, `redirect_uri` phải là `https://logivn.com/auth/google/callback`, rồi quay vào dashboard hoặc onboarding.
