import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ManagementConsole } from '@/components/control/management-console';
import { DOMAIN_CONTROL_HOST, MAIL_HOST, hostnameFromHeaders, isDomainConsoleHost } from '@/lib/logimail-hosts';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const host = hostnameFromHeaders(await headers());
  if (host === MAIL_HOST) redirect('/mail/inbox');
  if (!isDomainConsoleHost(host)) redirect(`https://${DOMAIN_CONTROL_HOST}/`);
  return <ManagementConsole />;
}
