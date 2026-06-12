import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DashboardMailboxDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  redirect(`/mailboxes/${id}`);
}
