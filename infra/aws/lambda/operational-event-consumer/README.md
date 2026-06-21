# LogiVN Operational Event Consumer Lambda

Lambda này là phương án thay thế hoặc dự phòng cho `infra/vps/services/workers/sqs-operational-event-worker.mts`.
Nó nhận event từ AWS SQS, kiểm tra payload tối thiểu, rồi forward từng operational event sang VPS gateway `POST /events` để hệ thống BullMQ/Telegram/notification hiện hữu tiếp tục xử lý.

## Khi Nên Bật

- Vercel đã publish operational events vào SQS thành công.
- SQS queue đã có DLQ/redrive policy.
- Gateway `LOGIVN_API_INTERNAL_URL` reachable từ AWS Lambda.
- `LOGIVN_INTERNAL_API_KEY` trên Lambda trùng với key của gateway.
- Lambda event source mapping bật `ReportBatchItemFailures` để lỗi từng message không retry cả batch.

Không nên chuyển main Next.js app sang Lambda. Main app vẫn nên ở Vercel; Lambda chỉ hợp cho async consumer, retry, scheduled maintenance hoặc các job dài hơi.

## Env Runtime

```txt
LOGIVN_API_INTERNAL_URL=https://api.logivn.com
LOGIVN_INTERNAL_API_KEY=...
LOGIVN_GATEWAY_TIMEOUT_MS=8000
```

## IAM Tối Thiểu

Lambda execution role cần quyền đọc/xóa message từ queue operational events:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ChangeMessageVisibility"
      ],
      "Resource": "arn:aws:sqs:us-east-1:992764023505:logivn-operational-events.fifo"
    }
  ]
}
```

Đổi ARN theo queue thật nếu tên khác.

## Event Source Mapping

Khuyến nghị ban đầu:

- Batch size: `5` hoặc `10`
- Maximum batching window: `0-5s`
- Function timeout: `30s`
- SQS visibility timeout: ít nhất `6x` Lambda timeout
- Function response types: `ReportBatchItemFailures`
- Reserved concurrency: bắt đầu `1-3` để không đẩy gateway/Redis quá tải

## Cutover An Toàn

1. Giữ Vercel `OPERATIONAL_EVENT_QUEUE_PROVIDER=gateway` cho đến khi SQS/Lambda smoke pass.
2. Deploy Lambda với event source mapping disabled.
3. Gửi một message smoke vào SQS queue riêng hoặc queue production với event `platform.alert` đã đánh dấu smoke.
4. Bật event source mapping, xác nhận gateway nhận và BullMQ enqueue thành công.
5. Chỉ sau đó mới set Vercel `OPERATIONAL_EVENT_QUEUE_PROVIDER=sqs` và `OPERATIONAL_EVENT_SQS_CONSUMER_CONFIRMED=true`.
6. Không chạy đồng thời VPS SQS consumer và Lambda consumer trên cùng queue nếu không chủ đích active-active. Nếu chạy song song, cần kiểm tra idempotency bằng `eventId` ở toàn bộ downstream.

## Build

```bash
npm install
npm run build
```

Artifact entrypoint sau build: `dist/handler.handler`.
