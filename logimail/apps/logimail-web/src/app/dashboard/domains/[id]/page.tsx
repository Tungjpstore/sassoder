import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DashboardDomainDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  redirect(`/domains/${id}`);
}
