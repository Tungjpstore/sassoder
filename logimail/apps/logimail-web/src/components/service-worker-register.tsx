'use client';

import { useEffect } from 'react';
import { MailNotificationWatcher } from '@/components/pwa-notifications';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
        registration.update().catch(() => undefined);
      }).catch(() => undefined);
    }
  }, []);

  return <MailNotificationWatcher />;
}
