import { MailboxDetailView } from '@/components/logimail-pages';

export const dynamic = 'force-dynamic';

export default async function MailboxDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <MailboxDetailView id={id} />;
}
