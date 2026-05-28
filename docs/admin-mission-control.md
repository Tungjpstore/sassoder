# LogiVN DevOps Control Center

Tài liệu này mô tả hướng control plane nội bộ sau khi chuyển nền tảng vận hành sang `admin.logivn.com`.

## Phạm Vi

`admin.logivn.com` là control plane nội bộ của LogiVN. Nó tách biệt với dashboard vận hành của từng quán và tách biệt với namespace API dashboard hiện hữu dưới `app/api/admin/*`.

Phạm vi hiện tại:

- Quan sát sức khoẻ platform theo tenant, billing, content, AI, maps, integrations, cron và deployment runtime.
- Chỉ hiển thị trạng thái configured/missing và tên biến môi trường, không hiển thị raw secret.
- Bảo vệ quyền riêng tư tenant bằng cách không drill-down đơn hàng, bill hoặc doanh thu riêng từ control plane nền tảng.
- Ưu tiên observability read-only trước, sau đó thêm write action qua permission, audit, confirmation và rollback.

## Bề Mặt Đã Có

- `admin.logivn.com/content` theo dõi landing, pricing, blog, customer QR menu, sitemap/feed/llms.
- `admin.logivn.com/ai` theo dõi AI routing, provider readiness, usage 24h, token, failure và model name.
- `admin.logivn.com/ai` theo dõi AI Ops Morning Brief, email delivery, health score, failed/skipped delivery, severity, recipients, summaries và action items.
- `admin.logivn.com/ai` theo dõi branch-scoped AI Ops insights mà không lộ order/revenue riêng tư.
- `admin.logivn.com/maps` theo dõi map provider calls, failure, estimated cost, cache hit, delivery quote acceptance và fallback config.
- `admin.logivn.com/atlas` map toàn bộ project surface qua frontend, backend, data, automation và external integrations.
- `admin.logivn.com/ops` theo dõi Vercel Cron, next-run ETA, run history, failure streak, integration readiness, cache readiness và env guardrails.
- `admin.logivn.com/governance` theo dõi capability coverage, mutation risk, audit/rollback readiness và RBAC role readiness.

## Quy Tắc An Toàn

- Không lưu raw API key trong Supabase tables.
- Không expose service-role, AI, map, email, R2 hoặc cron secret ra browser.
- Mutation của platform control plane phải đi qua server actions hoặc server-only APIs.
- Mọi mutation phải ghi audit log với actor, action, target, metadata, timestamp và reason khi có thể.
- Hành động tenant/content/billing có rủi ro cần confirmation rõ ràng; production-critical change cần approval.
- High-risk mutations phải nằm trong mutation registry trước khi mở cho role không phải owner.
- Support mode cho tenant data phải có reason, thời hạn, mặc định read-only và audit log.

## Chuỗi Nâng Cấp Tiếp Theo

1. Thêm `platform_admin_users`, roles, permissions, session revocation và optional 2FA.
2. Thêm immutable `platform_content_revisions` cho landing/pricing/blog với draft, preview, publish và rollback.
3. Thêm synthetic checks cho Atlas flows: QR order, checkout, reservation, dashboard login, billing và cron.
4. Thêm `platform_change_requests` cho approval trên dangerous changes.
5. Mở rộng cron execution logs bằng push/email alerts và drill-down theo execution id.
6. Thêm R2 migration plan cho platform assets với dual-read fallback về Supabase Storage.

## Mô Hình Governance

Màn hình governance tách rõ ba nhóm:

- Capability matrix: control plane quan sát, điều chỉnh, audit và rollback được gì.
- Mutation registry: server actions nào đang live, guard ra sao, action nào high-risk.
- Role readiness: role nào cần có trước khi nhiều người cùng vận hành production.

Giới hạn hiện tại: runtime auth vẫn cần hoàn thiện RBAC đầy đủ. Cho tới khi xong, mọi session hợp lệ trên `admin.logivn.com` phải được xem như owner-level.
