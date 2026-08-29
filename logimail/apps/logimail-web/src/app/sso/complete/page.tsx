import { Suspense } from 'react';
import { SsoCompleteFlow, SsoFlowFallback } from '@/components/sso-flow';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default function SsoCompletePage() {
  return <Suspense fallback={<SsoFlowFallback mode="complete" />}><SsoCompleteFlow /></Suspense>;
}
