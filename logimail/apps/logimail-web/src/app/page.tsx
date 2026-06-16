import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ManagementConsole } from '@/components/control/management-console';

export const dynamic = 'force-dynamic';

const MAIL_HOST = 'mail.logivn.com';

function requestHost(headersList: Headers) {
  return (headersList.get('x-forwarded-host') ?? headersList.get('host') ?? '').split(',')[0]?.trim().split(':')[0]?.toLowerCase();
}

export default async function HomePage() {
  const host = requestHost(await headers());
  // mail.logivn.com is purely the mailbox client; every other host (domain.logivn.com,
  // localhost) is the LogiMail management console.
  if (host === MAIL_HOST) redirect('/mail/inbox');
  return <ManagementConsole />;
}
