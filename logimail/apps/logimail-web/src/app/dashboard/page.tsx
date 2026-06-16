import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

function requestHost(headersList: Headers) {
  return (headersList.get('x-forwarded-host') ?? headersList.get('host') ?? '').split(',')[0]?.trim().split(':')[0]?.toLowerCase();
}

export default async function DashboardPage() {
  const host = requestHost(await headers());
  if (host === 'domain.logivn.com') redirect('/');
  redirect('/mail/inbox');
}
