# Responsive Specs

## Breakpoints

- Mobile: 375px, 390px, 414px, 430px.
- Tablet optional: 768px.
- Desktop preserved: `lg` / 1024px and above.

## Implementation Pattern

- Write mobile variants below `lg`.
- Preserve existing desktop tables and grids with `lg:` or larger classes.
- Prefer one shared data/component model with mobile card rendering and desktop table rendering.
- Avoid separate business logic for mobile.

## Layout

- Mobile shell uses bottom nav with safe-area padding.
- Content bottom padding must account for nav and FAB.
- Cards use stable dimensions and do not resize on hover.
- Charts use snapshots and sparklines on mobile, detailed legends on desktop.

## Realtime And Offline

- Connected: subtle live pill.
- Reconnecting: orange `Đang nối lại`.
- Offline: persistent banner plus queued-action count.
- Syncing: per-card pending state.
- Failed sync: retry action and rollback explanation.

## Motion

- Use opacity and transform only.
- Duration: 150-250ms.
- Respect `prefers-reduced-motion`.
- No cinematic transitions.
