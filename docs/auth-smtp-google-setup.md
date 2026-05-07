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
  - `https://tfhqatvevbrbzaaqjhfa.supabase.co/auth/v1/callback`

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
- Google OAuth nếu đủ Client ID/Secret

Lưu ý quan trọng cho OAuth PKCE: route `/auth/google` tạo `redirectTo` theo domain người dùng đang mở để cookie xác thực và callback cùng origin. Vì vậy:

- Người dùng mở `logivn.com` sẽ callback về `https://logivn.com/auth/callback`.
- Người dùng mở `logi.vn.com` sẽ callback về `https://logi.vn.com/auth/callback` nếu domain phụ này được cấu hình DNS/Vercel.
- Nếu mở từ subdomain quán `*.logivn.com`, callback quay về đúng subdomain đó để cookie PKCE luôn cùng origin.

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
  - Google: bật provider, nhập Client ID/Secret.
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
- Vào `/dashboard/login`, bấm `Đăng nhập bằng Google`, Google phải quay về `/auth/callback` rồi vào dashboard hoặc onboarding.
