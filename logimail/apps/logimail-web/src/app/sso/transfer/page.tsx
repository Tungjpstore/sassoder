import { Suspense } from 'react';
import { SsoFlowFallback, SsoTransferFlow } from '@/components/sso-flow';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default function SsoTransferPage() {
  return <Suspense fallback={<SsoFlowFallback mode="transfer" />}><SsoTransferFlow /></Suspense>;
}
