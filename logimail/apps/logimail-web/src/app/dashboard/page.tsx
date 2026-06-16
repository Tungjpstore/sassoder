import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { DOMAIN_CONTROL_HOST, hostnameFromHeaders } from '@/lib/logimail-hosts';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const host = hostnameFromHeaders(await headers());
  if (host === DOMAIN_CONTROL_HOST) redirect('/');
  redirect('/mail/inbox');
}
