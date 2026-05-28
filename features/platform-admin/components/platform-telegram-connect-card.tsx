"use client";

import { useActionState } from "react";
import { AlertTriangle, Bot, ExternalLink, KeyRound, Link2, ShieldCheck, Trash2, Users } from "lucide-react";
import {
  createPlatformTelegramConnectTokenAction,
  revokePlatformTelegramConnectionAction,
  revokePlatformTelegramTokenAction,
  type PlatformTelegramConnectActionState
} from "@/features/platform-admin/actions";
import { PrimaryButton, badgeTone, formatDateTime, formatNumber, statusTone } from "@/features/platform-admin/components/primitives";
import type { PlatformTelegramOpsState } from "@/services/platform-telegram-connection-service";
import { cn } from "@/lib/utils";

type PlatformTelegramConnectCardProps = {
  initialState: PlatformTelegramOpsState;
};

function boolTone(value: boolean) {
  return value ? "good" : "warning";
}

function boolLabel(value: boolean) {
  return value ? "Đã cấu hình" : "Thiếu cấu hình";
}

function tokenStateTone(state: string) {
  if (state === "pending") return "info";
  if (state === "consumed") return "good";
  if (state === "revoked") return "danger";
  return "warning";
}

function tokenStateLabel(state: string) {
  if (state === "pending") return "Đang dùng được";
  if (state === "consumed") return "Đã kết nối";
  if (state === "revoked") return "Đã thu hồi";
  if (state === "expired") return "Đã hết hạn";
  return state;
}

function tokenTimelineLabel(token: { state: string; expiresAt: string; consumedAt: string | null; revokedAt: string | null }) {
  if (token.state === "pending") return "Có hiệu lực tới khi admin thu hồi hoặc link được dùng";
  if (token.state === "consumed") return token.consumedAt ? `Đã dùng ${formatDateTime(token.consumedAt)}` : "Đã dùng";
  if (token.state === "revoked") return token.revokedAt ? `Thu hồi ${formatDateTime(token.revokedAt)}` : "Đã thu hồi";
  return `Hết hiệu lực ${formatDateTime(token.expiresAt)}`;
}

export function PlatformTelegramConnectCard({ initialState }: PlatformTelegramConnectCardProps) {
  const [createState, createAction, createPending] = useActionState<PlatformTelegramConnectActionState | undefined, FormData>(createPlatformTelegramConnectTokenAction, undefined);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Bot</p>
            <Bot size={18} className="text-slate-500" />
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-950">{initialState.bot.username ? `@${initialState.bot.username}` : "Chưa nối"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={badgeTone(boolTone(initialState.bot.configured))}>{boolLabel(initialState.bot.configured)}</span>
            <span className={badgeTone(boolTone(initialState.bot.webhookConfigured))}>Webhook</span>
          </div>
          {initialState.bot.startUrl ? (
            <a href={initialState.bot.startUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
              <ExternalLink size={14} />
              Mở bot
            </a>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Kết nối</p>
            <Users size={18} className="text-slate-500" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{formatNumber(initialState.summary.activeConnections)}</p>
          <p className="mt-2 text-sm text-slate-600">{formatNumber(initialState.summary.revokedConnections)} đã thu hồi</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Link mời</p>
            <KeyRound size={18} className="text-slate-500" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{formatNumber(initialState.summary.pendingTokens)}</p>
          <p className="mt-2 text-sm text-slate-600">
            {initialState.bot.persistentConnectLink ? "Đến khi thu hồi hoặc đã dùng" : `TTL ${initialState.bot.ttlSeconds}s`}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Rủi ro</p>
            <ShieldCheck size={18} className="text-slate-500" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{initialState.summary.risk}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={badgeTone(statusTone(initialState.summary.risk))}>{initialState.schemaReady ? "Schema sẵn sàng" : "Thiếu schema"}</span>
            <span className={badgeTone(boolTone(initialState.bot.connectSecretConfigured))}>Connect secret</span>
          </div>
        </div>
      </div>

      {initialState.warnings.length ? (
        <div className="grid gap-2 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          {initialState.warnings.map((warning) => (
            <div key={warning} className="flex items-start gap-2 text-sm font-semibold text-orange-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Tạo link kết nối DevOps</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">Tạo link mời cho người vận hành. Link không tự hết hạn, chỉ dùng một lần hoặc bị admin thu hồi.</p>
            </div>
            <form action={createAction}>
              <PrimaryButton tone="dark">
                <KeyRound size={15} />
                {createPending ? "Đang tạo" : "Tạo link"}
              </PrimaryButton>
            </form>
          </div>

          {createState?.error ? <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{createState.error}</p> : null}
          {createState?.token ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className={badgeTone("good")}>{createState.token.role}</span>
                <span className={badgeTone("neutral")}>
                  {createState.token.persistent ? "Đến khi thu hồi hoặc đã dùng" : `Hết hạn ${formatDateTime(createState.token.expiresAt)}`}
                </span>
              </div>
              {createState.token.startUrl ? (
                <a href={createState.token.startUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 break-all rounded-xl bg-white px-3 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  <Link2 size={15} />
                  {createState.token.startUrl}
                </a>
              ) : null}
              <code className="rounded-xl bg-white px-3 py-2 font-mono text-xs text-emerald-900 ring-1 ring-emerald-200">{createState.token.startCommand}</code>
              <p className="text-xs font-semibold text-emerald-800">Nếu gửi nhầm người, thu hồi link ở danh sách bên phải trước khi họ bấm Start.</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-950">Link mời gần đây</p>
            <form action={revokePlatformTelegramTokenAction}>
              <input type="hidden" name="revokeAll" value="true" />
              <PrimaryButton tone="soft">
                <Trash2 size={15} />
                Thu hồi link chưa dùng
              </PrimaryButton>
            </form>
          </div>
          <div className="mt-3 grid gap-2">
            {initialState.tokens.slice(0, 6).map((token) => (
              <div key={token.id} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span className={badgeTone(tokenStateTone(token.state))}>{tokenStateLabel(token.state)}</span>
                    <span className={badgeTone("neutral")}>{token.telegramRole}</span>
                  </div>
                  {token.state === "pending" ? (
                    <form action={revokePlatformTelegramTokenAction}>
                      <input type="hidden" name="tokenId" value={token.id} />
                      <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 text-xs font-semibold text-red-700">
                        <Trash2 size={13} />
                        Thu hồi
                      </button>
                    </form>
                  ) : null}
                </div>
                <div className="grid gap-1 font-mono text-xs text-slate-500 md:grid-cols-2">
                  <span>{token.actor}</span>
                  <span>{tokenTimelineLabel(token)}</span>
                </div>
              </div>
            ))}
            {!initialState.tokens.length ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Chưa có link mời DevOps.</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-950">Kết nối DevOps</p>
          <div className="mt-3 grid gap-2">
            {initialState.connections.map((connection) => (
              <div key={connection.id} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{connection.displayName}</p>
                    <p className="break-all font-mono text-xs text-slate-500">{connection.username ? `@${connection.username}` : connection.telegramUserId}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className={badgeTone(statusTone(connection.status))}>{connection.status}</span>
                    <span className={badgeTone("neutral")}>{connection.role}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                  <span>Seen: {formatDateTime(connection.lastSeenAt)}</span>
                  {connection.status === "active" ? (
                    <form action={revokePlatformTelegramConnectionAction} className="flex items-center gap-2">
                      <input type="hidden" name="connectionId" value={connection.id} />
                      <input type="hidden" name="reason" value="platform_admin_revoked" />
                      <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 text-xs font-semibold text-red-700">
                        <Trash2 size={13} />
                        Thu hồi
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
            {!initialState.connections.length ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Chưa có kết nối Telegram DevOps.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-950">Audit gần đây</p>
          <div className="mt-3 grid gap-2">
            {initialState.auditLogs.slice(0, 8).map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{log.action}</p>
                  <span className={badgeTone(statusTone(log.outcome))}>{log.outcome}</span>
                </div>
                <div className={cn("mt-2 grid gap-1 font-mono text-xs text-slate-500", log.targetId ? "md:grid-cols-2" : "") }>
                  <span>{formatDateTime(log.createdAt)}</span>
                  {log.targetId ? <span>{log.targetType}:{log.targetId}</span> : null}
                </div>
              </div>
            ))}
            {!initialState.auditLogs.length ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Chưa có audit log.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
