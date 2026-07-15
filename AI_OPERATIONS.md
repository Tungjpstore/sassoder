# LogiVN AI Operations

Tài liệu này mô tả lớp vận hành AI dùng cho `admin.logivn.com`, tập trung vào cấu hình provider, xoay vòng khoá API, runtime routing và audit.

## Mục tiêu

- Cho phép vận hành AI mà không cần sửa code khi thay API key.
- Không đưa raw API key xuống browser hoặc `NEXT_PUBLIC_*`.
- Ưu tiên cấu hình đã lưu trong `admin.logivn.com`; nếu chưa có cấu hình DB thì fallback về biến môi trường hiện tại.
- Ghi audit cho mọi lần bật/tắt provider, đổi model, đổi base URL hoặc xoay vòng key.

## Lưu trữ bí mật

Bảng `public.platform_ai_provider_configs` lưu cấu hình runtime theo provider:

- `provider`: `mimo`, `deepseek`, `qwen` (legacy alias), `nvidia`, `bedrock`, `openai`, `gemini`, `xai`, `claude`, `vercel_gateway`
- `enabled`: bật/tắt provider ở runtime
- `api_key_ciphertext`, `api_key_iv`, `api_key_tag`: API key đã mã hoá AES-256-GCM
- `key_fingerprint`, `key_last_four`: metadata an toàn để nhận diện key trong UI
- `base_url`, `chat_model`, `fast_model`, `image_model`, `ocr_model`: override runtime
- `last_rotated_at`, `updated_at`, `updated_by`: audit metadata

Migrations:

- `supabase/migrations/20260528143000_platform_ai_provider_configs.sql`
- `supabase/migrations/20260607103000_add_mimo_deepseek_ai_providers.sql`

## Khoá mã hoá

Production nên cấu hình `PLATFORM_AI_SECRET_KEY` riêng, dài và ngẫu nhiên. Runtime có fallback theo thứ tự:

1. `PLATFORM_AI_SECRET_KEY`
2. `PLATFORM_ADMIN_SESSION_SECRET`
3. `SUPABASE_SERVICE_ROLE_KEY`

Không đổi `PLATFORM_AI_SECRET_KEY` nếu vẫn cần giải mã các key đã lưu. Khi cần xoay secret mã hoá, hãy nhập lại API key provider trong UI sau khi đổi secret.

## Luồng đổi API key

1. Admin có quyền `admins.manage` mở `admin.logivn.com/ai`.
2. Chọn provider, nhập `Khoá API mới`, model/base URL nếu cần.
3. Server action `updateAiProviderConfigAction` xác thực quyền, validate input và gọi `updatePlatformAiProviderConfig`.
4. Key được mã hoá server-side, lưu vào Supabase bằng service role, sau đó ghi `platform_audit_logs` với action `platform_ai_provider_config_updated`.
5. Cache cấu hình AI và snapshot admin được invalidate.
6. Các lần gọi AI tiếp theo dùng cấu hình DB trước, fallback env khi DB không có key.

## Runtime routing

Các entrypoint đã đọc cấu hình đã resolve:

- `lib/ai/router/model-router.ts`
- `app/api/copilotkit/route.ts`
- `services/ai/runtime.ts` cho Xiaomi MiMo OCR, chat router và xAI image generation
- các AI readiness deck/API trong dashboard

Runtime production hiện ưu tiên `mimo` với model `mimo-v2.5-pro`, fallback mặc định `deepseek -> gemini`. Các id provider cũ như `qwen` hoặc `dashscope` chỉ còn tác dụng tương thích ngược và được alias sang `mimo`; router không auto-route sang Qwen nữa.

`bedrock` dùng Amazon Bedrock Converse API cho text/chat tasks và mặc định thử `us.amazon.nova-2-lite-v1:0` qua US inference profile. PoC nên dùng `AWS_BEARER_TOKEN_BEDROCK` hoặc key đã nhập trong `admin.logivn.com/ai`. Bedrock không đọc ảnh OCR trực tiếp; ảnh vẫn đi qua Textract/Google Vision/OCR.Space. Bedrock có thể tham gia bước chuẩn hóa text OCR thành JSON qua `AI_OCR_TEXT_PROVIDER=bedrock`, sau đó router tự fallback sang provider khác nếu Bedrock bị quota/runtime lỗi.

Không đưa `bedrock` làm provider chính cho assistant production cho tới khi `npm run ai:bedrock:check` qua được bước Converse. Khi checker trả `status: quota-blocked`, nghĩa là key/model/list-model đã đúng nhưng runtime invocation đang hết quota/ngày; router sẽ tạm block provider trong process và thử fallback thay vì để luồng AI/OCR treo.

Nếu Bedrock trả `Operation not allowed` trên tài khoản AWS mới trong khi `ListFoundationModels` vẫn chạy được, kiểm tra trạng thái account verification của AWS. CloudShell/Bedrock runtime có thể bị chặn cho tới khi AWS hoàn tất xác minh tài khoản.

Smoke-test Bedrock sau khi AWS verification hoàn tất:

```bash
npm run ai:bedrock:check
```

Script này đọc `AWS_BEARER_TOKEN_BEDROCK` hoặc `BEDROCK_API_KEY` từ `.env.local`, không in key ra terminal, gọi `ListFoundationModels`, rồi thử Converse với model đang cấu hình. Dùng `BEDROCK_ALLOW_QUOTA_BLOCKED=1 npm run ai:bedrock:check` khi cần coi trạng thái quota-blocked là check không fatal trong quá trình triển khai fallback.

Provider bị tắt trong DB sẽ không được chọn dù biến môi trường vẫn tồn tại. Nếu xoá key DB, runtime trở lại dùng ENV fallback nếu ENV còn cấu hình.

## An toàn UI

UI `admin.logivn.com/ai` chỉ hiển thị:

- nguồn key: `CSDL mã hoá`, `ENV server`, hoặc `Chưa có`
- fingerprint rút gọn
- 4 ký tự cuối của key DB
- trạng thái enabled/configured

Raw API key không được trả về snapshot, không nằm trong props React và không xuất hiện trong HTML.

## Kiểm tra

Các kiểm tra liên quan:

- `npx tsc --noEmit --pretty false --incremental false`
- `npm run ai:bedrock:check` sau khi AWS account verification đã xong
- `npm test -- services/platform-ai-provider-config-service.test.ts`
- `npm run lint`
- `git diff --check`
