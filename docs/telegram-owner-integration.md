# Telegram Owner Integration

## Production Model

LogiVN uses a managed multi-tenant Telegram bot for owner/staff operations.

Telegram does not provide a public API for creating new bots outside BotFather, so the production owner flow does not ask each restaurant to create or paste a bot token. The platform provisions one secured bot token in VPS/Vercel secrets, then maps each Telegram account to a restaurant, branch, user, role, and permission set.

## Owner Flow

1. Owner opens `Dashboard -> Settings -> Thong bao -> Telegram Ops Center`.
2. Dashboard reads `/api/admin/telegram/status` and shows setup state:
   - managed bot configured
   - secure link readiness
   - Telegram account mapping
   - BullMQ delivery pipeline
   - test delivery state
3. Owner chooses branch scope and clicks `Tao link tich hop`.
4. Backend revokes any previous unconsumed token for the same restaurant/user/branch scope.
5. Backend creates a signed, expiring `/start` token and stores only `token_hash`.
6. Owner opens `https://t.me/<bot>?start=<token>`.
7. Owner taps Telegram's `Start` button. If a Telegram client opens the chat without sending the payload, Dashboard also shows a copyable `/start <token>` fallback command.
8. Telegram worker atomically claims the token, maps Telegram identity to the LogiVN user, and replies with the ops menu.
9. Dashboard auto-polls status until the active connection appears.
10. Owner sends test notifications from the same panel.

## Security Contract

- Telegram ID alone is never trusted.
- Connect tokens are signed, hashed at rest, expiring, one-time, and tenant-scoped.
- Callback/session buttons are signed and one-time.
- Internal actions re-check live staff permissions before mutation.
- Test notifications go directly to `telegram.notifications`, not the general event router, so they never trigger business queues.
- Test cards are labelled and do not render mutation buttons.

## Custom Bot Tokens

Per-restaurant custom bot tokens are intentionally not enabled in the current production path. Supporting them would require a separate encrypted token store, bot-token rotation, per-bot webhook registration, tenant-specific worker routing, and a rollback plan for bot ownership transfer.
