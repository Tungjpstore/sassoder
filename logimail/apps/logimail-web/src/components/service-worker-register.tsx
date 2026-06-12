'use client';

import { useEffect } from 'react';
import { MailNotificationWatcher } from '@/components/pwa-notifications';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  return <MailNotificationWatcher />;
}
