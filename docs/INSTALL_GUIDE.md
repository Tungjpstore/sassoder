# LogiVN Install Guide

## Routes

- `/download`: platform-aware install center with manual platform choice.
- `/download/android`: Android Chrome/Edge guide.
- `/download/ios`: iPhone and iPad Safari guide.
- `/download/windows`: Windows Chrome/Edge guide.
- `/download/mac`: macOS Chrome/Edge guide with Safari Add to Dock note.

## Browser Behavior

LogiVN only uses browser-supported install behavior:

- `beforeinstallprompt` is used when Chromium exposes it.
- iOS and iPadOS use manual Safari Share > Add to Home Screen instructions.
- macOS Safari install guidance is presented as Add to Dock where available, not as a guaranteed prompt.
- Standalone mode is detected with `display-mode: standalone` and iOS `navigator.standalone`.

## Dismissal State

The install panel stores dismissal in `localStorage` under:

```txt
logivn:pwa-install-dismissed
```

This only controls the install CTA state. It does not disable the service worker, clear caches, or affect login/session behavior.

## Security Boundary

The install center is public UI only. It does not expand offline caching, dashboard caching, API caching, Web Push, Background Sync, staff attendance sync, payments, reservations, or order mutation behavior.

## One-Click Install Boundary

A website cannot silently install itself into the user's Start Menu, Dock, Launchpad, or Home Screen. Browsers and operating systems require a user confirmation step.

Closest PWA behavior:

- Chromium can show the real install prompt after the user clicks the LogiVN install CTA.
- iOS/iPadOS still requires Safari Share > Add to Home Screen.

Native installers are intentionally out of scope for this PWA phase. If LogiVN later needs classic download installers, plan separate native packaging:

- Android: Trusted Web Activity, APK, or Play Store AAB.
- Windows: MSIX, Microsoft Store, or Electron installer.
- macOS: signed and notarized DMG/PKG or Mac App Store build.
- iOS: App Store or TestFlight app shell.
