# LogiVN AI Prompt Router

AI trong LogiVN được thiết kế như một lớp điều phối nghiệp vụ, không phải một chatbot chung chung. Mỗi request đi qua prompt router để xác định intent, lấy snapshot dữ liệu đúng `restaurant_id`, kiểm tra entitlement theo gói và ghi usage log.

## Luồng Chủ Quán

Endpoint: `/api/admin/ai/assistant`

Intent hỗ trợ:

- `setup`: quét cấu hình quán, readiness score, kế hoạch setup nhanh
- `overview`: tổng quan ca bán, điểm nghẽn, hành động ưu tiên
- `orders`: nhận đơn, xác nhận, phục vụ, thanh toán
- `kitchen`: ưu tiên ra món, SLA, món quá giờ
- `menu`: tối ưu danh mục, món, giá, ảnh, OCR
- `tables`: bàn trống, bàn đang phục vụ, QR, hóa đơn mở
- `payments`: VietQR, tiền mặt, đối soát, rủi ro lệch tiền
- `promotions`: mã giảm giá, điều kiện, chống lạm dụng
- `staff`: phân quyền và phân công nhân viên
- `online`: pickup, delivery, phí ship, trả trước/trả sau
- `reservations`: đặt bàn, giữ chỗ, nhận cọc, tránh trùng lịch
- `reports`: insight doanh thu, báo cáo email, xuất file
- `settings`: hồ sơ quán, ngân hàng, giờ mở cửa, thương hiệu
- `security`: tenant isolation, bug gói, spam, audit
- `growth`: slogan, mô tả, ảnh menu, chiến dịch tăng trưởng

Contract: AI chỉ được đề xuất thao tác, không tự xác nhận thanh toán, không tự đổi dữ liệu, không suy đoán dữ liệu quán khác.

Mỗi phản hồi có thể kèm `actions` để hộp chat hiển thị nút thao tác trực tiếp:

- `link`: dẫn tới đúng route trong dashboard hoặc luồng khách
- `prompt`: chạy tiếp một prompt có ngữ cảnh
- `api`: gọi endpoint AI phụ trợ như setup plan/draft/branding
- `ui`: điều khiển UI cục bộ như mở giỏ, mở lịch sử đơn, gọi nhân viên

`ui` cũng có thể điều phối workflow cục bộ có xác nhận, ví dụ `bulk_owner_actions` để chạy tuần tự nhiều action đơn hàng an toàn như nhận các đơn `pending`. Bulk action chỉ được chạy sau khi chủ quán bấm xác nhận, bị giới hạn số lượng, và không được chứa xác nhận thanh toán/hủy/xóa dữ liệu.

Action luôn có `safety`: `safe`, `confirm` hoặc `manual_only`. Những thao tác nhạy cảm như xác nhận thanh toán vẫn là `manual_only`, AI chỉ mở đúng màn để chủ quán tự bấm.

Mỗi phản hồi cũng có `agentPlan` để UI không còn là một hộp chat thô:

- `title`: vai trò agent đang chạy, ví dụ `Payment Guard`, `Menu Architect`
- `summary`: lý do và hướng xử lý chính
- `focusArea`: route hoặc vùng UI liên quan
- `nextBestActionId`: action nên bấm trước
- `safetyNote`: giới hạn an toàn của agent
- `confidence`: mức tự tin dựa trên số action/dữ liệu có sẵn

UI chủ quán phải hiển thị `agentPlan` ở panel riêng và `actions` ở action queue, không trộn mọi thứ vào một đoạn text dài.

Endpoint setup chuyên sâu: `/api/admin/ai/setup-plan`

Mode hỗ trợ:

- `audit`: audit toàn diện mức sẵn sàng thương mại hóa
- `express`: tạo kế hoạch setup trong 30 phút
- `growth`: đề xuất tính năng Pro/Premium đáng bật theo mô hình quán

Output setup là JSON có `summary`, `launchBlockers`, `expressSetup`, `aiAutopilot`, `customerExperience`, `ownerMessage`. UI hiển thị trong `AI Setup Studio` tại `/dashboard/settings`.

Endpoint tạo bản nháp setup: `/api/admin/ai/setup-draft`

Draft kind hỗ trợ:

- `brand_profile`: slogan, mô tả quán, brand voice, logo prompt, menu cover prompt
- `menu_blueprint`: khung danh mục, món mẫu, mô tả món, tag bán hàng
- `online_delivery`: pickup/delivery, bán kính, phí ship, điều kiện trả trước/trả sau
- `reservation_policy`: giữ bàn, tiền cọc, grace time, chống trùng lịch/no-show
- `promotion_launch`: mã giảm giá, min order, kênh hiển thị, chống lạm dụng
- `voice_ops`: mẫu lệnh giọng nói và thông báo vận hành bằng giọng nói

Output draft là JSON có `kind`, `title`, `confidence`, `requiresPlan`, `route`, `quickWins`, `draft.fields`, `draft.settings`, `draft.prompts`, `draft.checklist`, `ownerNote`. API chỉ tạo bản nháp, không tự ghi dữ liệu vào database.

Guardrail draft:

- Prompt ảnh không yêu cầu AI render chữ nhỏ/tên quán trong ảnh.
- Giao hàng phải nhắc tọa độ/bán kính trước khi bật thật.
- Đặt bàn phải chống overbooking và có time hết hạn.
- Khuyến mãi luôn có min order/thời hạn/kênh áp dụng.
- Giọng nói không đọc quá nhiều dữ liệu nhạy cảm trong ca bán.

## Luồng Khách

Endpoint: `/api/ai/customer-assistant`

Intent hỗ trợ:

- `menu_discovery`: gợi ý món từ menu thật
- `cart`: kiểm tra giỏ, gọi thêm món, ghi chú
- `order_status`: giải thích trạng thái đơn/hóa đơn
- `payment`: hướng dẫn VietQR/tiền mặt và hóa đơn
- `staff_call`: gọi nhân viên
- `delivery`: giao hàng, phí ship, theo dõi đơn
- `reservation`: đặt bàn và cọc giữ chỗ
- `promotion`: mã giảm giá
- `allergy`: dị ứng, ăn kiêng, ghi chú món

Contract: câu trả lời ngắn, mobile-first, không xác nhận đã thanh toán/đã nhận đơn nếu dữ liệu không có.

Luồng khách cũng nhận `actions` để mở thực đơn, mở giỏ, theo dõi đơn/hóa đơn, gọi nhân viên, mở link đặt online hoặc đặt bàn mà không bắt khách tự tìm.

## Provider

- Qwen: mặc định cho assistant, OCR và phản hồi nhanh.
- xAI: mặc định cho tạo ảnh nếu `AI_IMAGE_PROVIDER=xai`.
- Các luồng trả schema (`setup-plan`, `setup-draft`, branding, OCR text) bật JSON mode của DashScope/OpenAI-compatible bằng `response_format: { "type": "json_object" }` để giảm lỗi AI trả markdown.

Các env chính: `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `XAI_API_KEY`, `XAI_BASE_URL`, `AI_OWNER_PROVIDER`, `AI_CUSTOMER_PROVIDER`, `AI_IMAGE_PROVIDER`, `QWEN_*`, `XAI_*`.

## Mở Rộng Gói Pro/Premium

Mọi tính năng AI phải đi qua `assertFeatureEntitlement` và `ai_usage_logs`. Khi thêm intent mới, cần cập nhật:

1. `services/ai-prompt-router.ts`
2. schema endpoint nếu cần input mới
3. UI chip/quick prompts tương ứng
4. giới hạn gói trong subscription/migration nếu là feature mới

## Prompt Router Contract

Mỗi intent nên có:

- `description`: mục tiêu nghiệp vụ của intent
- `dataScope`: dữ liệu được phép dùng
- `guardrails`: điều AI không được làm trong danh mục đó
- `systemAddendum`: vai trò chuyên môn
- `responseContract`: format câu trả lời để UI dễ hiển thị
- `suggestions`: quick prompts ngắn cho chủ quán/khách

Router phải ưu tiên intent explicit từ UI. Nếu không có, mới infer bằng keyword tiếng Việt đã bỏ dấu. Mọi snapshot đều phải filter theo `restaurant_id`.

Nếu provider AI lỗi, timeout hoặc trả nội dung rỗng, backend phải dùng deterministic action router để trả `reply`, `agentPlan` và `actions` an toàn thay vì để CopilotKit treo hoặc hiển thị trống. UI chỉ render summary/action đã chuẩn hóa, không render raw JSON/tool output.
