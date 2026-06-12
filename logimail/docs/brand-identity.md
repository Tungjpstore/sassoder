# Bộ nhận diện LogiMail

LogiMail là nhánh MailOps nội bộ của LogiVN, vì vậy nhận diện phải cùng hệ với LogiVN nhưng đọc được ngay là sản phẩm email, bảo mật và vận hành.

## Nguồn concept

Concept board được tạo bằng xAI từ API key local, model `grok-imagine-image-quality`:

```text
apps/logimail-web/public/brand/logimail/generated/xai-logimail-concept-board-20260609.jpg
```

Logo sản xuất dùng SVG deterministic để không phụ thuộc lỗi chữ/hình của ảnh AI.

## Logo system

| Asset | Mục đích |
| --- | --- |
| `apps/logimail-web/public/brand/logimail/logimail-mark.svg` | App icon, favicon, avatar sản phẩm |
| `apps/logimail-web/public/brand/logimail/logimail-logo-horizontal.svg` | Header, docs, slide, email footer |
| `apps/logimail-web/public/brand/logimail/logimail-logo-stacked.svg` | Cover, poster, tài liệu onboarding |
| `apps/logimail-web/public/brand/logimail/logimail-mark-reverse.svg` | Dùng trên nền xanh đậm |
| `apps/logimail-web/public/brand/logimail/logimail-mark-mono-dark.svg` | In đen trắng hoặc tình huống một màu |
| `apps/logimail-web/public/brand/logimail/logimail-logo-system.svg` | Brand board tổng hợp |
| `apps/logimail-web/public/icons/icon-192.png` | PWA icon 192px |
| `apps/logimail-web/public/icons/icon-512.png` | PWA icon 512px |
| `apps/logimail-web/public/brand/logimail/logimail-logo-horizontal-1040.png` | PNG horizontal cho tài liệu không hỗ trợ SVG |
| `apps/logimail-web/public/brand/logimail/logimail-logo-stacked-720.png` | PNG stacked cho cover/onboarding |

Biểu tượng chính là mail shield: khung bo vuông xanh LogiVN, shield ivory, phong bì ở giữa và dấu xác thực màu cam. Ý nghĩa: email nội bộ, bảo vệ hạ tầng, trạng thái vận hành đã kiểm tra.

## Màu sắc

| Token | Hex | Cách dùng |
| --- | --- | --- |
| `--brand-primary` | `#0F4D3A` | Logo, sidebar, heading quan trọng, trạng thái an toàn |
| `--brand-accent` | `#F28C28` | Điểm nhấn Mail, verify, CTA phụ, cảnh báo cần chú ý |
| `--brand-ivory` | `#FFF7EB` | Nền ấm, shield trong logo, vùng onboarding |
| `--brand-secondary` | `#A9C5A1` | Nền phụ, border mềm, trạng thái pending |
| `--brand-text` | `#2B2B2B` | Nội dung chính |
| `--mail-muted` | `#68736D` | Mô tả, metadata, timestamp |

Tỉ lệ khuyến nghị trong UI: 60% nền trung tính/ivory, 30% xanh và surface phụ, 10% cam cho tín hiệu hành động. Không dùng tím, neon, hoặc palette xanh lam fintech làm màu chủ đạo.

## Kiểu chữ

LogiMail đồng bộ LogiVN qua `Sora`, `Inter`, `Geist`.

| Vai trò | Font | Kích cỡ |
| --- | --- | --- |
| Product H1 | Sora | 36px desktop, 28px mobile |
| Section H2 | Sora hoặc Inter | 20-24px |
| Card title | Inter | 16-18px, 700-800 |
| Body/UI | Inter | 14-16px |
| Metadata/table | Inter | 12-14px, 650-750 |
| Mono/log | Geist Mono | 12-14px |

CSS token hiện có trong `apps/logimail-web/src/styles/globals.css`:

```text
--text-xs: 12px
--text-sm: 14px
--text-base: 16px
--text-lg: 18px
--text-xl: 20px
--text-2xl: 24px
--text-3xl: 30px
--text-4xl: 36px
```

Letter spacing giữ `0` cho heading/wordmark. Chỉ dùng tracking lớn cho label ngắn như `MAILOPS NỘI BỘ`.

## Khoảng cách và hình khối

- Border radius chuẩn: 8px cho panel, form, nav item.
- Logo mark radius: 24/128 để cùng cảm giác bo mềm với LogiVN.
- Layout dashboard theo 8px grid: 8, 16, 24, 32.
- Touch target tối thiểu: 44px trên mobile.
- Không đặt card lồng card; dashboard dùng panel phẳng, rõ biên.

## Quy tắc dùng logo

- Không đổi màu chữ `Logi` khỏi xanh hoặc `Mail` khỏi cam trong logo chính.
- Không bật shadow/gradient cho logo.
- Không đặt logo trên nền cam đậm làm mất dấu verify.
- Clear space tối thiểu bằng 1/4 chiều cao mark quanh logo.
- Kích cỡ tối thiểu: mark 24px, horizontal lockup 120px chiều rộng.

## Mapping trong app

- Component logo: `apps/logimail-web/src/components/logimail-logo.tsx`.
- PWA icon: `apps/logimail-web/public/icons/icon.svg`.
- Sidebar/login/register dùng subtitle `mail.logivn.com` để gắn nhận diện với subdomain vận hành.
