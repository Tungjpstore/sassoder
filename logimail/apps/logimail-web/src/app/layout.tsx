import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import '@/styles/globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'LogiMail | Hộp thư nội bộ',
  description: 'Hộp thư nội bộ LogiVN tại mail.logivn.com.',
  manifest: '/manifest.json',
  metadataBase: new URL('https://mail.logivn.com'),
};

export const viewport: Viewport = {
  themeColor: '#0F4D3A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
