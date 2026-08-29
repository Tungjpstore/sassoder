import { Suspense } from 'react';
import { SsoFlowFallback, SsoLogoutFlow } from '@/components/sso-flow';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default function SsoLogoutPage() {
  return <Suspense fallback={<SsoFlowFallback mode="logout" />}><SsoLogoutFlow /></Suspense>;
}
